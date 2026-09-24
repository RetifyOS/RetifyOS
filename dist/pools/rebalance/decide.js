/*
 * Portions of this file are derived from Aetheria (https://github.com/venymlabs/aetheria),
 * Copyright Venym Labs, licensed under the Apache License, Version 2.0.
 * See NOTICE and licenses/APACHE-2.0.txt. Modified for RetifyOS.
 * SPDX-License-Identifier: Apache-2.0
 */
import { activePositionInRange, binDrift, binSpan, divergenceLossPct, rangeAroundActive, uiPriceOfBin, } from "../meteora/bins.js";
import { EMPTY_HISTORY } from "./ledger.js";
/** Conservative: act only on a real exit, once an hour at most, 4 a day, must pay for itself. */
export function defaultRebalancePolicy() {
    return {
        driftBins: 2,
        edgeTriggerPct: 0.1,
        minIntervalMs: 3_600_000,
        maxPerDay: 4,
        horizonMs: 86_400_000,
        requireIlRecovery: true,
        minNetBenefitQuote: 0n,
        targetBelowBins: 10,
        targetAboveBins: 10,
        shape: "spot",
    };
}
function hold(code, reason, currentRange, drift, rangeFraction, economics = null) {
    return {
        action: "hold",
        code,
        reason,
        targetRange: null,
        currentRange,
        drift,
        rangeFraction,
        economics,
    };
}
/**
 * Should this position be rebalanced right now? Returns a decision, never throws
 * for ordinary bad inputs — a malformed position is a `hold`, because "we do not
 * understand this position" must mean "do not touch it".
 */
export function decideRebalance(s) {
    const { position, pool, policy, now } = s;
    const history = s.history ?? EMPTY_HISTORY;
    const currentRange = {
        lowerBinId: position.lowerLevel,
        upperBinId: position.upperLevel,
    };
    if (!Number.isInteger(currentRange.lowerBinId) ||
        !Number.isInteger(currentRange.upperBinId) ||
        currentRange.upperBinId < currentRange.lowerBinId) {
        return hold("POOL_RANGE_INVALID", "position range is malformed — refusing to act on it", currentRange, 0, null);
    }
    if (position.poolAddress !== pool.address) {
        return hold("POOL_VENUE_ERROR", "position and pool do not match", currentRange, 0, null);
    }
    const activeBinId = pool.activeLevel;
    const drift = binDrift(currentRange, activeBinId);
    const rangeFraction = activePositionInRange(currentRange, activeBinId);
    // ── 1. drift ──────────────────────────────────────────────────────────────
    const exited = Math.abs(drift) > policy.driftBins;
    const nearEdge = rangeFraction !== null &&
        policy.edgeTriggerPct > 0 &&
        binSpan(currentRange.lowerBinId, currentRange.upperBinId) > 1 &&
        (rangeFraction <= policy.edgeTriggerPct ||
            rangeFraction >= 1 - policy.edgeTriggerPct);
    if (!exited && !nearEdge) {
        return hold("REBALANCE_NOT_DRIFTED", drift === 0
            ? `active bin ${activeBinId} is comfortably inside ${currentRange.lowerBinId}..${currentRange.upperBinId}`
            : `active bin drifted ${drift} bins, within the ${policy.driftBins}-bin no-churn band`, currentRange, drift, rangeFraction);
    }
    // ── 2. minimum interval ───────────────────────────────────────────────────
    if (history.lastAt !== null) {
        const since = now - history.lastAt;
        if (since < policy.minIntervalMs) {
            return hold("REBALANCE_TOO_SOON", `last rebalance was ${Math.round(since / 1000)}s ago; minimum interval is ${Math.round(policy.minIntervalMs / 1000)}s`, currentRange, drift, rangeFraction);
        }
    }
    // ── 3. rolling daily cap ──────────────────────────────────────────────────
    if (history.countInWindow >= policy.maxPerDay) {
        return hold("REBALANCE_DAILY_CAP", `already rebalanced ${history.countInWindow} times in the last 24h (cap ${policy.maxPerDay})`, currentRange, drift, rangeFraction);
    }
    // ── target range ──────────────────────────────────────────────────────────
    const targetRange = rangeAroundActive(activeBinId, policy.targetBelowBins, policy.targetAboveBins);
    if (targetRange.lowerBinId === currentRange.lowerBinId &&
        targetRange.upperBinId === currentRange.upperBinId) {
        return hold("REBALANCE_NOT_DRIFTED", "target range equals the current range — nothing to do", currentRange, drift, rangeFraction);
    }
    // ── 4. economics ──────────────────────────────────────────────────────────
    const econ = computeEconomics(s, targetRange);
    if (!econ) {
        return hold("REBALANCE_UNECONOMIC", "economic inputs incomplete (fees, cost or notional unknown) — refusing to rebalance blind", currentRange, drift, rangeFraction);
    }
    if (econ.netBenefitQuote <= 0n ||
        econ.netBenefitQuote < policy.minNetBenefitQuote) {
        return hold("REBALANCE_UNECONOMIC", `projected fees ${econ.projectedFeesQuote} do not cover cost ${econ.cashCostQuote}` +
            (policy.requireIlRecovery
                ? ` + divergence ${econ.divergenceCostQuote}`
                : "") +
            ` (net ${econ.netBenefitQuote})`, currentRange, drift, rangeFraction, econ);
    }
    return {
        action: "rebalance",
        code: "REBALANCE_OK",
        reason: `active bin ${activeBinId} is ${drift === 0 ? "at the edge of" : `${Math.abs(drift)} bins outside`} ` +
            `${currentRange.lowerBinId}..${currentRange.upperBinId}; re-centre on ${targetRange.lowerBinId}..${targetRange.upperBinId} ` +
            `(net +${econ.netBenefitQuote} quote over ${Math.round(policy.horizonMs / 3_600_000)}h)`,
        targetRange,
        currentRange,
        drift,
        rangeFraction,
        economics: econ,
    };
}
/**
 * The trade-off, computed once and reported whole.
 *
 * Benefit is **only** the fees the position would earn back in range over the
 * horizon. `claimableFeesQuote` is deliberately excluded: those fees can be
 * collected by a bare `claim` without moving the range, so counting them as a
 * reason to rebalance would let any position with accrued fees justify an
 * arbitrarily expensive move. Reported, never credited.
 *
 * Cost is the round-trip cash out of the wallet, plus — in strict mode — the
 * divergence loss the move crystallises versus the entry price.
 *
 * Returns null when any required input is missing, which the caller must treat as
 * a rejection.
 */
export function computeEconomics(s, targetRange) {
    const { pool, policy, economics: e } = s;
    if (e.projectedFeesPerDayQuote === null ||
        e.txCostQuote === null ||
        e.inventorySwapCostQuote === null)
        return null;
    if (e.projectedFeesPerDayQuote < 0n ||
        e.txCostQuote < 0n ||
        e.inventorySwapCostQuote < 0n)
        return null;
    if (!Number.isFinite(policy.horizonMs) || policy.horizonMs <= 0)
        return null;
    // Fee projection is scaled by how much of the *new* range actually earns: a
    // wider range spreads the same liquidity thinner, so fewer of its bins sit at
    // the active price. Narrower ⇒ more fee capture per unit, and more drift risk —
    // which is precisely the trade the brakes above are metering.
    const targetSpan = binSpan(targetRange.lowerBinId, targetRange.upperBinId);
    const currentSpan = binSpan(s.position.lowerLevel, s.position.upperLevel);
    const concentration = currentSpan > 0 && targetSpan > 0 ? currentSpan / targetSpan : 1;
    const horizonDays = policy.horizonMs / 86_400_000;
    const projectedFeesQuote = (e.projectedFeesPerDayQuote *
        BigInt(Math.max(0, Math.round(horizonDays * concentration * 1_000_000)))) /
        1000000n;
    const cashCostQuote = e.txCostQuote + e.inventorySwapCostQuote;
    let divergenceCostQuote = 0n;
    let ilPct = null;
    if (policy.requireIlRecovery) {
        if (e.positionNotionalQuote === null || e.entryUiPrice === null)
            return null;
        if (e.positionNotionalQuote < 0n ||
            !Number.isFinite(e.entryUiPrice) ||
            e.entryUiPrice <= 0)
            return null;
        const nowPrice = uiPriceOfBin(pool.activeLevel, pool.levelStepBps, pool.baseDecimals, pool.quoteDecimals);
        ilPct = divergenceLossPct(nowPrice / e.entryUiPrice); // negative or zero
        const lossBps = BigInt(Math.round(Math.abs(ilPct) * 100));
        divergenceCostQuote = (e.positionNotionalQuote * lossBps) / 10000n;
    }
    const netBenefitQuote = projectedFeesQuote - cashCostQuote - divergenceCostQuote;
    return {
        projectedFeesQuote,
        cashCostQuote,
        divergenceCostQuote,
        netBenefitQuote,
        claimableFeesQuote: e.claimableFeesQuote,
        divergenceLossPct: ilPct,
    };
}
