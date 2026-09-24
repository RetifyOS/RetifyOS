/*
 * Portions of this file are derived from Aetheria (https://github.com/venymlabs/aetheria),
 * Copyright Venym Labs, licensed under the Apache License, Version 2.0.
 * See NOTICE and licenses/APACHE-2.0.txt. Modified for RetifyOS.
 * SPDX-License-Identifier: Apache-2.0
 */
export const BASIS_POINT_MAX = 10_000;
/** Bins a single position account can hold (`DEFAULT_BIN_PER_POSITION`). */
export const MAX_BIN_PER_POSITION = 70;
/** Bins per bin-array account (`MAX_BIN_PER_ARRAY`). */
export const MAX_BIN_PER_ARRAY = 70;
export const MAX_BIN_STEP = 400;
export const MAX_BIN_ID = 351_639;
export const MIN_BIN_ID = -351_639;
export class BinMathError extends RangeError {
}
function assertBinStep(binStep) {
    if (!Number.isInteger(binStep) || binStep <= 0 || binStep > MAX_BIN_STEP) {
        throw new BinMathError(`binStep must be an integer in 1..${MAX_BIN_STEP}, got ${String(binStep)}`);
    }
}
function assertBinId(binId) {
    if (!Number.isInteger(binId) || binId < MIN_BIN_ID || binId > MAX_BIN_ID) {
        throw new BinMathError(`binId must be an integer in ${MIN_BIN_ID}..${MAX_BIN_ID}, got ${String(binId)}`);
    }
}
/** Price of a bin in lamport terms: `(1 + binStep/10_000) ^ binId`. */
export function priceOfBin(binId, binStep) {
    assertBinStep(binStep);
    assertBinId(binId);
    return (1 + binStep / BASIS_POINT_MAX) ** binId;
}
/** UI price (quote per 1 base) of a bin, decimal-adjusted. Display only — never cap math. */
export function uiPriceOfBin(binId, binStep, baseDecimals, quoteDecimals) {
    return priceOfBin(binId, binStep) * 10 ** (baseDecimals - quoteDecimals);
}
/** The bin whose price floor is at or below `price` (lamport terms). Inverse of `priceOfBin`. */
export function binOfPrice(price, binStep) {
    assertBinStep(binStep);
    if (!Number.isFinite(price) || price <= 0) {
        throw new BinMathError(`price must be finite and positive, got ${String(price)}`);
    }
    const raw = Math.log(price) / Math.log(1 + binStep / BASIS_POINT_MAX);
    // Guard the float: log-ratio noise can land a hair under an exact bin boundary.
    const snapped = Math.abs(raw - Math.round(raw)) < 1e-9 ? Math.round(raw) : Math.floor(raw);
    if (snapped < MIN_BIN_ID || snapped > MAX_BIN_ID) {
        throw new BinMathError(`price ${price} maps to bin ${snapped}, outside ${MIN_BIN_ID}..${MAX_BIN_ID}`);
    }
    return snapped;
}
export function binOfUiPrice(uiPrice, binStep, baseDecimals, quoteDecimals) {
    return binOfPrice(uiPrice / 10 ** (baseDecimals - quoteDecimals), binStep);
}
/** Inclusive bin count of a range. */
export function binSpan(lowerBinId, upperBinId) {
    return upperBinId - lowerBinId + 1;
}
/** Price width of a range, as a percentage: `((1+s)^span - 1) * 100`. */
export function rangeWidthPct(lowerBinId, upperBinId, binStep) {
    assertBinStep(binStep);
    const span = upperBinId - lowerBinId;
    return ((1 + binStep / BASIS_POINT_MAX) ** span - 1) * 100;
}
/**
 * A range centred on the active bin, clamped to what one position account holds.
 * `below`/`above` are bin counts; the active bin itself is always included.
 */
export function rangeAroundActive(activeBinId, below, above, maxSpan = MAX_BIN_PER_POSITION) {
    assertBinId(activeBinId);
    if (!Number.isInteger(below) ||
        below < 0 ||
        !Number.isInteger(above) ||
        above < 0) {
        throw new BinMathError(`below/above must be non-negative integers, got ${String(below)}/${String(above)}`);
    }
    const cap = Math.max(1, Math.min(maxSpan, MAX_BIN_PER_POSITION));
    let lo = below;
    let hi = above;
    // Shrink symmetrically (widest side first) until the span fits one position.
    while (lo + hi + 1 > cap) {
        if (lo >= hi)
            lo -= 1;
        else
            hi -= 1;
    }
    const lowerBinId = Math.max(MIN_BIN_ID, activeBinId - lo);
    const upperBinId = Math.min(MAX_BIN_ID, activeBinId + hi);
    return { lowerBinId, upperBinId };
}
export function isActiveInRange(range, activeBinId) {
    return activeBinId >= range.lowerBinId && activeBinId <= range.upperBinId;
}
/**
 * Signed drift of the active bin relative to a range, **in bins**.
 *  - `0`  active bin is inside the range (position is earning)
 *  - `>0` active bin is above `upperBinId` by that many bins (position went 100% base)
 *  - `<0` active bin is below `lowerBinId` (position went 100% quote)
 */
export function binDrift(range, activeBinId) {
    if (activeBinId > range.upperBinId)
        return activeBinId - range.upperBinId;
    if (activeBinId < range.lowerBinId)
        return activeBinId - range.lowerBinId;
    return 0;
}
/**
 * How far through the range the active bin sits, 0..1 (0 = at the lower edge).
 * Returns `null` when the active bin is outside the range. Used by the rebalancer
 * to fire on *approaching* an edge, not only on having already fallen out of it.
 */
export function activePositionInRange(range, activeBinId) {
    if (!isActiveInRange(range, activeBinId))
        return null;
    const span = binSpan(range.lowerBinId, range.upperBinId);
    if (span <= 1)
        return 0.5;
    return (activeBinId - range.lowerBinId) / (span - 1);
}
/**
 * Bin-array indices a range touches. Bin arrays are the on-chain accounts that
 * must exist (and be rent-paid) before liquidity can live in a bin, so the count
 * of *new* arrays a range needs is a real cost input to the rebalance decision.
 */
export function binArrayIndicesFor(range) {
    const first = Math.floor(range.lowerBinId / MAX_BIN_PER_ARRAY);
    const last = Math.floor(range.upperBinId / MAX_BIN_PER_ARRAY);
    const out = [];
    for (let i = first; i <= last; i++)
        out.push(i);
    return out;
}
// ── liquidity shaping ────────────────────────────────────────────────────────
/**
 * Relative weight per bin for a shape. Weights are unnormalised and strictly
 * positive; `distributeAmount` turns them into exact base-unit amounts.
 *
 * These mirror the *shape* of Meteora's `StrategyType` (Spot / Curve / BidAsk) so
 * previews and rebalance economics are computed against the right silhouette. They
 * are not a bit-for-bit reimplementation of the on-chain weight math — the actual
 * per-bin amounts are produced by the SDK from `strategyType`, and this package
 * never sends its own weights on-chain.
 */
export function shapeWeights(shape, range, activeBinId) {
    const span = binSpan(range.lowerBinId, range.upperBinId);
    if (span <= 0)
        throw new BinMathError(`empty range ${range.lowerBinId}..${range.upperBinId}`);
    // The distribution centres on the active bin when it is inside the range, and on
    // the nearest edge otherwise — matching how the SDK picks its gaussian mean.
    const centre = Math.min(Math.max(activeBinId, range.lowerBinId), range.upperBinId);
    if (shape === "spot")
        return new Array(span).fill(1);
    if (shape === "curve") {
        // Gaussian with 2σ at the range edges; the normalising constant cancels.
        const sigma = Math.max(span / 4, 0.5);
        return Array.from({ length: span }, (_, i) => {
            const z = (range.lowerBinId + i - centre) / sigma;
            return Math.exp(-0.5 * z * z) + 1e-9;
        });
    }
    // bid-ask: the inverse silhouette — thin at the centre, heavy at the edges.
    const reach = Math.max(centre - range.lowerBinId, range.upperBinId - centre, 1);
    return Array.from({ length: span }, (_, i) => Math.abs(range.lowerBinId + i - centre) / reach + 0.05);
}
/** Fixed-point scale for turning float weights into exact integers. */
const WEIGHT_SCALE = 1000000000n;
/**
 * Split `total` base units across `weights` with **no dust lost or invented**.
 *
 * Largest-remainder apportionment, entirely in `bigint`: floor each share against
 * the integer weight sum, then hand the shortfall out one unit at a time to the
 * bins with the largest truncated remainder. Because every share is floored, the
 * assigned sum is never above `total` and the shortfall is strictly smaller than
 * the bin count — so the loop terminates and the result sums to exactly `total`.
 * (Scaling each weight independently and hoping the rounding cancels does *not*
 * have that property; 70 equal bins overshoot by 2e-5 that way.)
 */
export function distributeAmount(total, weights) {
    if (weights.length === 0)
        throw new BinMathError("cannot distribute across zero bins");
    if (total < 0n)
        throw new BinMathError("total must be non-negative");
    const floatSum = weights.reduce((a, b) => a + b, 0);
    if (!Number.isFinite(floatSum) || floatSum <= 0)
        throw new BinMathError("weights must sum to a finite positive number");
    if (total === 0n)
        return weights.map(() => 0n);
    const scaled = weights.map((w) => {
        if (!Number.isFinite(w) || w < 0)
            throw new BinMathError(`weight must be finite and non-negative, got ${String(w)}`);
        return BigInt(Math.round((w / floatSum) * Number(WEIGHT_SCALE)));
    });
    const weightSum = scaled.reduce((a, b) => a + b, 0n);
    if (weightSum <= 0n)
        throw new BinMathError("weights round to zero at the working precision");
    const out = [];
    const remainders = [];
    let assigned = 0n;
    for (let i = 0; i < scaled.length; i++) {
        const numerator = total * scaled[i];
        const share = numerator / weightSum;
        out.push(share);
        assigned += share;
        remainders.push({ rem: numerator % weightSum, i });
    }
    // Shortfall < weights.length by construction; hand it to the largest remainders.
    remainders.sort((a, b) => b.rem === a.rem ? a.i - b.i : b.rem > a.rem ? 1 : -1);
    let k = 0;
    while (assigned < total && k < remainders.length) {
        const idx = remainders[k].i;
        out[idx] = out[idx] + 1n;
        assigned += 1n;
        k += 1;
    }
    return out;
}
/**
 * Preview a deposit's per-bin breakdown. DLMM funds bins strictly below the active
 * bin with **quote** and strictly above it with **base**; the active bin can take
 * both. `side` selects which asset this call is laying out.
 */
export function planDeposit(args) {
    const { range, activeBinId, binStep, shape, amount, side } = args;
    const bins = [];
    for (let b = range.lowerBinId; b <= range.upperBinId; b++) {
        // Quote funds the bid side (at/below active); base funds the ask side (at/above).
        if (side === "quote" && b <= activeBinId)
            bins.push(b);
        if (side === "base" && b >= activeBinId)
            bins.push(b);
    }
    if (bins.length === 0)
        return [];
    const subRange = {
        lowerBinId: bins[0],
        upperBinId: bins[bins.length - 1],
    };
    const amounts = distributeAmount(amount, shapeWeights(shape, subRange, activeBinId));
    return bins.map((binId, i) => ({
        binId,
        uiPrice: uiPriceOfBin(binId, binStep, args.baseDecimals, args.quoteDecimals),
        amount: amounts[i],
    }));
}
/**
 * Divergence ("impermanent") loss versus simply holding, for a price that moved by
 * ratio `r = priceNow / priceEntry`, as a **negative** percentage.
 *
 *     IL(r) = 2·√r / (1 + r) − 1
 *
 * This is the constant-product closed form. A DLMM position over a finite range is
 * *more* divergent than this inside the range and stops diverging once price exits
 * it, so treating this as the estimate is deliberately conservative-ish rather than
 * exact — it is used to make a rebalance harder to justify, never easier.
 */
export function divergenceLossPct(priceRatio) {
    if (!Number.isFinite(priceRatio) || priceRatio <= 0) {
        throw new BinMathError(`priceRatio must be finite and positive, got ${String(priceRatio)}`);
    }
    return ((2 * Math.sqrt(priceRatio)) / (1 + priceRatio) - 1) * 100;
}
