/*
 * Portions of this file are derived from Aetheria (https://github.com/venymlabs/aetheria),
 * Copyright Venym Labs, licensed under the Apache License, Version 2.0.
 * See NOTICE and licenses/APACHE-2.0.txt. Modified for RetifyOS.
 * SPDX-License-Identifier: Apache-2.0
 */
import { SOL_DECIMALS, USDC_DECIMALS, quoteBucketFor, toBaseUnits, } from "../kernel/money.js";
import { refuse } from "./errors.js";
/** DLMM stores at most 70 bins in one position account (`DEFAULT_BIN_PER_POSITION`). */
export const MAX_LEVELS_PER_POSITION = 70;
/**
 * Deliberately tight defaults. LP is a longer-dated, harder-to-exit exposure than
 * a swap, so these sit *below* the kernel's swap caps rather than beside them.
 */
export function defaultPoolGuardConfig() {
    return {
        sol: {
            maxSpendPerAction: toBaseUnits(0.5, SOL_DECIMALS),
            maxLpPositionQuote: toBaseUnits(2, SOL_DECIMALS),
            minPoolLiquidityQuote: toBaseUnits(50, SOL_DECIMALS),
        },
        usdc: {
            maxSpendPerAction: toBaseUnits(100, USDC_DECIMALS),
            maxLpPositionQuote: toBaseUnits(400, USDC_DECIMALS),
            minPoolLiquidityQuote: toBaseUnits(10_000, USDC_DECIMALS),
        },
        maxConcurrentPositions: 5,
        maxBaseLegPctOfHoldings: 25,
        maxRugHeat: 60,
        maxCurveSlippageBps: 300,
        minCurveRealSolLamports: toBaseUnits(2, SOL_DECIMALS),
        authorityAllowlist: [],
        allowToken2022: false,
        maxLevelSpan: MAX_LEVELS_PER_POSITION,
    };
}
export function limitsFor(cfg, mint) {
    const bucket = quoteBucketFor(mint);
    if (bucket === "sol")
        return cfg.sol;
    if (bucket === "usdc")
        return cfg.usdc;
    return null;
}
// ── individual guards ────────────────────────────────────────────────────────
/**
 * Input-leg spend cap. Mirrors the kernel's denomination rule: only quote-asset
 * inputs (SOL/USDC) are capped in notional terms, because only those can be
 * bounded without a price oracle. A token input (a sell) is not capped here —
 * that is the kernel's `quoteBucketFor(...) === null` branch, restated, not a hole.
 */
export function guardSpend(cfg, input) {
    if (input.amount <= 0n) {
        return refuse("POOL_SPEND_CAP", "input amount must be positive");
    }
    const limits = limitsFor(cfg, input.mint);
    if (!limits)
        return null; // selling a token: nothing leaves that a quote cap can bound.
    if (input.amount > limits.maxSpendPerAction) {
        return refuse("POOL_SPEND_CAP", `spend ${input.amount} exceeds the per-action cap ${limits.maxSpendPerAction}`, {
            amount: input.amount.toString(),
            cap: limits.maxSpendPerAction.toString(),
        });
    }
    return null;
}
/**
 * Live mint or freeze authority is a rejection unless the mint is explicitly
 * allowlisted. A `null`/`undefined` entry means we could not read the mint — also
 * a rejection. Token-2022 is refused for parity with the kernel's phase-1 stance.
 */
export function guardTokenAuthorities(cfg, mints) {
    if (mints.length === 0) {
        return refuse("POOL_MINT_AUTHORITY", "no mint records supplied — cannot verify authorities");
    }
    for (const info of mints) {
        if (!info) {
            return refuse("POOL_MINT_AUTHORITY", "mint record unavailable — refusing rather than assuming it is clean");
        }
        if (!cfg.allowToken2022 && info.isToken2022) {
            return refuse("POOL_TOKEN2022", `${info.mint} is a Token-2022 mint (transfer fees/hooks); refused`, {
                mint: info.mint,
            });
        }
        const allowlisted = cfg.authorityAllowlist.includes(info.mint);
        if (allowlisted)
            continue;
        if (info.mintAuthority) {
            return refuse("POOL_MINT_AUTHORITY", `${info.mint} still has a live mint authority (supply can be inflated)`, {
                mint: info.mint,
                authority: info.mintAuthority,
            });
        }
        if (info.freezeAuthority) {
            return refuse("POOL_FREEZE_AUTHORITY", `${info.mint} still has a live freeze authority (your tokens can be frozen)`, {
                mint: info.mint,
                authority: info.freezeAuthority,
            });
        }
    }
    return null;
}
/**
 * Rug-heat as a hard gate. A signals engine returns 60 for a mint
 * with no trades in the window, so "we have never seen this token trade" lands on
 * the reject side of the default threshold by construction — which is the point.
 */
export function guardRugHeat(cfg, heat) {
    if (!heat || !Number.isFinite(heat.score)) {
        return refuse("POOL_RUG_HEAT", "no rug-heat reading available — refusing rather than trading blind");
    }
    if (heat.score >= cfg.maxRugHeat) {
        return refuse("POOL_RUG_HEAT", `rug-heat ${heat.score}/100 is at or above the ${cfg.maxRugHeat} rejection threshold`, {
            score: heat.score,
            threshold: cfg.maxRugHeat,
            reasons: heat.reasons.slice(0, 3),
        });
    }
    return null;
}
/** Pool TVL floor, denominated in the pool's quote asset. Unknown TVL is a refusal. */
export function guardPoolLiquidity(cfg, pool) {
    const limits = limitsFor(cfg, pool.quoteMint);
    if (!limits) {
        return refuse("POOL_LIQUIDITY_FLOOR", `pool quote asset ${pool.quoteMint} is not a supported quote asset (SOL/USDC)`);
    }
    if (pool.liquidityQuote === undefined) {
        return refuse("POOL_LIQUIDITY_FLOOR", "pool TVL unavailable — refusing rather than assuming it is deep enough");
    }
    if (pool.liquidityQuote < limits.minPoolLiquidityQuote) {
        return refuse("POOL_LIQUIDITY_FLOOR", `pool TVL ${pool.liquidityQuote} is below the ${limits.minPoolLiquidityQuote} floor`, {
            tvl: pool.liquidityQuote.toString(),
            floor: limits.minPoolLiquidityQuote.toString(),
        });
    }
    return null;
}
/** Per-position notional cap plus the concurrent-position count cap. */
export function guardLpSizing(cfg, s) {
    const limits = limitsFor(cfg, s.pool.quoteMint);
    if (!limits) {
        return refuse("POOL_POSITION_CAP", `pool quote asset ${s.pool.quoteMint} is not a supported quote asset (SOL/USDC)`);
    }
    if (s.addQuote < 0n || s.existingPositionQuote < 0n) {
        return refuse("POOL_POSITION_CAP", "position amounts must be non-negative");
    }
    const after = s.existingPositionQuote + s.addQuote;
    if (after > limits.maxLpPositionQuote) {
        return refuse("POOL_POSITION_CAP", `position would hold ${after} quote, above the ${limits.maxLpPositionQuote} cap`, {
            after: after.toString(),
            cap: limits.maxLpPositionQuote.toString(),
        });
    }
    if (s.isNewPosition && s.openPositions.length >= cfg.maxConcurrentPositions) {
        return refuse("POOL_MAX_POSITIONS", `already holding ${s.openPositions.length} positions (max ${cfg.maxConcurrentPositions})`, {
            open: s.openPositions.length,
            max: cfg.maxConcurrentPositions,
        });
    }
    return null;
}
/**
 * The base (non-quote) leg of a two-sided deposit leaves the wallet too, and the
 * kernel's input-leg cap only sees the quote leg. Bound it as a share of current
 * holdings of that same mint — oracle-free, and it degrades to "reject" when the
 * holding is unknown.
 */
export function guardBaseLeg(cfg, args) {
    if (args.baseAmount <= 0n)
        return null; // quote-only deposit: no second leg to bound.
    if (cfg.maxBaseLegPctOfHoldings <= 0) {
        return refuse("POOL_BASE_LEG_CAP", "two-sided deposits are disabled (maxBaseLegPctOfHoldings = 0)");
    }
    if (args.baseHoldings === null || args.baseHoldings === undefined) {
        return refuse("POOL_BASE_LEG_CAP", "wallet holding of the base mint is unknown — cannot bound the second leg");
    }
    if (args.baseHoldings <= 0n) {
        return refuse("POOL_BASE_LEG_CAP", "wallet holds none of the base mint");
    }
    const allowed = (args.baseHoldings * BigInt(Math.floor(cfg.maxBaseLegPctOfHoldings))) /
        100n;
    if (args.baseAmount > allowed) {
        return refuse("POOL_BASE_LEG_CAP", `base leg ${args.baseAmount} exceeds ${cfg.maxBaseLegPctOfHoldings}% of holdings (${allowed})`, {
            amount: args.baseAmount.toString(),
            allowed: allowed.toString(),
        });
    }
    return null;
}
/** Level range sanity: ordered, finite, integral, and no wider than one position holds. */
export function guardLevelRange(cfg, range) {
    const { lowerLevel, upperLevel, activeLevel } = range;
    for (const [name, v] of [
        ["lowerLevel", lowerLevel],
        ["upperLevel", upperLevel],
        ["activeLevel", activeLevel],
    ]) {
        if (!Number.isInteger(v))
            return refuse("POOL_RANGE_INVALID", `${name} must be an integer level, got ${String(v)}`);
    }
    if (upperLevel < lowerLevel) {
        return refuse("POOL_RANGE_INVALID", `upperLevel ${upperLevel} is below lowerLevel ${lowerLevel}`);
    }
    const span = upperLevel - lowerLevel + 1;
    const cap = Math.min(cfg.maxLevelSpan, MAX_LEVELS_PER_POSITION);
    if (span > cap) {
        return refuse("POOL_RANGE_INVALID", `range spans ${span} levels, above the ${cap} maximum`, { span, cap });
    }
    return null;
}
/** Bonding-curve slippage bound. Non-finite / negative slippage is a refusal. */
export function guardCurveSlippage(cfg, slippageBps) {
    if (!Number.isFinite(slippageBps) || slippageBps < 0) {
        return refuse("POOL_SLIPPAGE", `slippage must be a finite non-negative bps value, got ${String(slippageBps)}`);
    }
    if (slippageBps > cfg.maxCurveSlippageBps) {
        return refuse("POOL_SLIPPAGE", `slippage ${slippageBps}bps exceeds the ${cfg.maxCurveSlippageBps}bps bound`, {
            slippageBps,
            bound: cfg.maxCurveSlippageBps,
        });
    }
    return null;
}
/**
 * Minimum-liquidity floor for a bonding curve, read off the curve's *real* SOL
 * reserves — the SOL actually withdrawable, not the virtual reserve that only
 * shapes the price. A fresh curve with 0.1 SOL in it cannot absorb an exit.
 */
export function guardCurveLiquidity(cfg, curve) {
    if (curve.complete) {
        return refuse("POOL_MIGRATED", "this curve has completed and migrated — route it through the Jupiter swap path");
    }
    if (curve.realSolReserves === null || curve.realSolReserves === undefined) {
        return refuse("POOL_LIQUIDITY_FLOOR", "curve reserves unavailable — refusing rather than trading blind");
    }
    if (curve.realSolReserves < cfg.minCurveRealSolLamports) {
        return refuse("POOL_LIQUIDITY_FLOOR", `curve holds ${curve.realSolReserves} lamports, below the ${cfg.minCurveRealSolLamports} floor`, {
            reserves: curve.realSolReserves.toString(),
            floor: cfg.minCurveRealSolLamports.toString(),
        });
    }
    return null;
}
// ── composites ───────────────────────────────────────────────────────────────
/** Run a sequence of checks and return the FIRST refusal. Order is significance order. */
function first(...checks) {
    for (const c of checks)
        if (c)
            return c;
    return null;
}
/** Every guard that must pass before an LP open/add intent may be built. */
export function guardLpOpen(cfg, s) {
    return first(guardTokenAuthorities(cfg, s.mints), guardRugHeat(cfg, s.rugHeat), guardPoolLiquidity(cfg, s.pool), guardSpend(cfg, s.input), guardLpSizing(cfg, s), guardBaseLeg(cfg, {
        baseAmount: s.baseAmount,
        baseHoldings: s.baseHoldings,
    }), guardLevelRange(cfg, {
        lowerLevel: s.lowerLevel,
        upperLevel: s.upperLevel,
        activeLevel: s.pool.activeLevel,
    }));
}
/**
 * Every guard that must pass before a bonding-curve buy intent may be built.
 *
 * Note the deliberate asymmetry with `guardCurveSell`: a buy is discretionary and
 * gets the full gate; a sell is an *exit* and must never be blocked by rug-heat or
 * a liquidity floor — those are exactly the conditions under which you most want
 * out. Blocking exits is how a safety system becomes the rug.
 */
export function guardCurveBuy(cfg, s) {
    return first(guardTokenAuthorities(cfg, s.mints), guardRugHeat(cfg, s.rugHeat), guardCurveLiquidity(cfg, s.curve), guardCurveSlippage(cfg, s.slippageBps), guardSpend(cfg, s.input));
}
/** Exit path: shape checks only. A migrated curve still redirects to Jupiter. */
export function guardCurveSell(cfg, s) {
    if (s.complete) {
        return refuse("POOL_MIGRATED", "this curve has completed and migrated — route the sell through the Jupiter swap path");
    }
    return first(guardCurveSlippage(cfg, s.slippageBps), guardSpend(cfg, s.input));
}
