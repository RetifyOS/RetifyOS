/*
 * Portions of this file are derived from Aetheria (https://github.com/venymlabs/aetheria),
 * Copyright Venym Labs, licensed under the Apache License, Version 2.0.
 * See NOTICE and licenses/APACHE-2.0.txt. Modified for RetifyOS: Aetheria's
 * `SwapRequest` came from its `shared` runtime contract, which RetifyOS
 * deliberately did not carry over, so the request shape is declared here as
 * {@link StrategySwap}; the executor port is narrowed to the one method the
 * runner needs; and the tick timer is unref'd so a runner never holds the
 * process open.
 * SPDX-License-Identifier: Apache-2.0
 */
import { WSOL_MINT } from "../kernel/money.js";
const MAX_CONSECUTIVE_ERRORS = 3;
const MIN_INTERVAL_SEC = 15;
const DEFAULT_INTERVAL_SEC = 3600;
function num(v, d = 0) {
    return typeof v === "number" && Number.isFinite(v) ? v : d;
}
function str(v, d = "") {
    return typeof v === "string" ? v : d;
}
/**
 * The autonomous strategy runner. Ticks on an interval, executes due strategies
 * one at a time (single-writer), and auto-pauses a strategy after
 * {@link MAX_CONSECUTIVE_ERRORS} consecutive failures so a broken schedule stops
 * burning fees instead of retrying forever.
 *
 * Two breakers, deliberately at different altitudes:
 *
 *  · **the error breaker here** is local and per-strategy — it stops *this*
 *    schedule when it keeps failing;
 *  · **the kernel's rolling daily cap** is global and denominated in the input
 *    leg — it stops *everything* once the day's authorised spend is used up.
 *
 * The second is the one that has to be right, and it is not implemented here:
 * it is enforced inside `TradeGateway.execute()`, which every swap above passes
 * through.
 */
export class StrategyRunner {
    #store;
    #exec;
    #tickMs;
    #timer = null;
    #running = false;
    constructor(store, exec, tickMs = 5_000) {
        this.#store = store;
        this.#exec = exec;
        this.#tickMs = Math.max(250, tickMs);
    }
    get running() {
        return this.#timer !== null;
    }
    start() {
        if (this.#timer)
            return;
        this.#timer = setInterval(() => void this.tick(), this.#tickMs);
        // A background schedule must never be why `node dist/server.js` won't exit.
        this.#timer.unref?.();
    }
    stop() {
        if (this.#timer) {
            clearInterval(this.#timer);
            this.#timer = null;
        }
    }
    /** One pass over the due set. Re-entrant calls are dropped, not queued. */
    async tick() {
        if (this.#running)
            return;
        this.#running = true;
        try {
            const now = Date.now();
            for (const strat of this.#store.due(now)) {
                await this.#step(strat);
            }
        }
        finally {
            this.#running = false;
        }
    }
    async #step(strat) {
        try {
            const plan = await this.#plan(strat);
            if (plan === "done") {
                strat.status = "done";
                this.#store.save(strat);
                await this.#notify(strat, `strategy ${strat.kind} complete.`);
                return;
            }
            if (plan === "skip") {
                this.#reschedule(strat);
                this.#store.save(strat);
                return;
            }
            // Derived from the strategy id and its run counter, so a crash between
            // the swap and the save replays the SAME key: the kernel's idempotency
            // ledger returns the original outcome instead of trading twice.
            const idem = `strat_${strat.id}_${strat.runs}`;
            const res = await this.#exec.swap(plan, idem);
            strat.runs += 1;
            strat.lastRunAt = Date.now();
            if (res.ok) {
                strat.errors = 0;
                strat.lastError = null;
                this.#applyProgress(strat, plan);
                await this.#notify(strat, `${strat.kind}: ${res.text}`);
            }
            else {
                strat.errors += 1;
                strat.lastError = res.text;
                if (strat.errors >= MAX_CONSECUTIVE_ERRORS) {
                    strat.status = "paused";
                    await this.#notify(strat, `strategy ${strat.kind} paused after ${strat.errors} errors: ${res.text}`);
                }
            }
            if (strat.status === "active" && this.#isComplete(strat)) {
                strat.status = "done";
                await this.#notify(strat, `strategy ${strat.kind} complete.`);
            }
            this.#reschedule(strat);
            this.#store.save(strat);
        }
        catch (e) {
            strat.errors += 1;
            strat.lastError = e instanceof Error ? e.message : String(e);
            if (strat.errors >= MAX_CONSECUTIVE_ERRORS)
                strat.status = "paused";
            this.#reschedule(strat);
            this.#store.save(strat);
        }
    }
    async #plan(strat) {
        const p = strat.params;
        switch (strat.kind) {
            case "dca": {
                const token = str(p.token);
                const per = num(p.amountUiPerStep);
                const total = num(p.totalBudgetUi);
                const spent = num(p.spentUi);
                if (!token || per <= 0)
                    return "done";
                if (total > 0 && spent + per > total + 1e-9)
                    return "done";
                return {
                    kind: "buy",
                    amountUi: per,
                    inputMint: WSOL_MINT,
                    outputMint: token,
                    slippageBps: undefined,
                };
            }
            case "twap": {
                const token = str(p.token);
                const totalUi = num(p.totalUi);
                const slices = Math.max(1, Math.floor(num(p.slices, 1)));
                const done = Math.floor(num(p.doneSlices));
                const side = str(p.side, "buy");
                if (!token || done >= slices)
                    return "done";
                const sliceUi = totalUi / slices;
                return side === "sell"
                    ? {
                        kind: "sell",
                        amountUi: sliceUi,
                        inputMint: token,
                        outputMint: WSOL_MINT,
                        slippageBps: undefined,
                    }
                    : {
                        kind: "buy",
                        amountUi: sliceUi,
                        inputMint: WSOL_MINT,
                        outputMint: token,
                        slippageBps: undefined,
                    };
            }
            case "trailing_stop": {
                const token = str(p.token);
                const dropPct = num(p.dropPct, 10);
                const sizeUi = num(p.sizeUi);
                // No price source ⇒ skip. Guessing a peak would arm a sell on fiction.
                if (!token || sizeUi <= 0 || !this.#exec.price)
                    return "skip";
                const price = await this.#exec.price(token);
                if (price === undefined)
                    return "skip";
                const peak = Math.max(num(p.peak, price), price);
                strat.params = { ...p, peak };
                if (price <= peak * (1 - dropPct / 100)) {
                    return {
                        kind: "sell",
                        amountUi: sizeUi,
                        inputMint: token,
                        outputMint: WSOL_MINT,
                        slippageBps: undefined,
                    };
                }
                return "skip";
            }
            case "take_profit": {
                const token = str(p.token);
                const gainPct = num(p.gainPct, 50);
                const sizeUi = num(p.sizeUi);
                const entry = num(p.entryPrice);
                if (!token || sizeUi <= 0 || entry <= 0 || !this.#exec.price)
                    return "skip";
                const price = await this.#exec.price(token);
                if (price === undefined)
                    return "skip";
                if (price >= entry * (1 + gainPct / 100)) {
                    return {
                        kind: "sell",
                        amountUi: sizeUi,
                        inputMint: token,
                        outputMint: WSOL_MINT,
                        slippageBps: undefined,
                    };
                }
                return "skip";
            }
            default:
                return "done";
        }
    }
    #applyProgress(strat, action) {
        const p = strat.params;
        if (strat.kind === "dca")
            strat.params = { ...p, spentUi: num(p.spentUi) + action.amountUi };
        else if (strat.kind === "twap")
            strat.params = { ...p, doneSlices: Math.floor(num(p.doneSlices)) + 1 };
        // trailing_stop / take_profit are one-shot exits.
        else
            strat.status = "done";
    }
    #isComplete(strat) {
        const p = strat.params;
        if (strat.kind === "dca") {
            const total = num(p.totalBudgetUi);
            return total > 0 && num(p.spentUi) >= total - 1e-9;
        }
        if (strat.kind === "twap")
            return (Math.floor(num(p.doneSlices)) >=
                Math.max(1, Math.floor(num(p.slices, 1))));
        return false;
    }
    #reschedule(strat) {
        const intervalSec = Math.max(MIN_INTERVAL_SEC, num(strat.params.intervalSec, DEFAULT_INTERVAL_SEC));
        strat.nextRunAt = Date.now() + intervalSec * 1000;
    }
    async #notify(strat, text) {
        if (!this.#exec.notify)
            return;
        try {
            await this.#exec.notify(strat.userId, text);
        }
        catch {
            // Notification failures must not break the runner.
        }
    }
}
