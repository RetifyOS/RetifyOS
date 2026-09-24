/*
 * Portions of this file are derived from Aetheria (https://github.com/venymlabs/aetheria),
 * Copyright Venym Labs, licensed under the Apache License, Version 2.0.
 * See NOTICE and licenses/APACHE-2.0.txt. Modified for RetifyOS.
 * SPDX-License-Identifier: Apache-2.0
 */
// ── Drift fixed-point precisions (documented constants, not read from the SDK) ──
export const BASE_PRECISION = 1000000000n; // 1e9
export const QUOTE_PRECISION = 1000000n; // 1e6
export const PRICE_PRECISION = 1000000n; // 1e6
export const MARGIN_PRECISION = 10000n; // 1e4
export const FUNDING_RATE_BUFFER = 1000n; // 1e3
export const BASE_DECIMALS = 9;
export const QUOTE_DECIMALS = 6;
export function bnToBigInt(value) {
    if (value === undefined || value === null)
        return undefined;
    try {
        const s = value.toString();
        if (!/^-?\d+$/.test(s))
            return undefined;
        return BigInt(s);
    }
    catch {
        return undefined;
    }
}
/** A fixed-point BN → JS number, for display and price maths (never for cap maths). */
export function bnToNumber(value, precision) {
    const raw = bnToBigInt(value);
    if (raw === undefined)
        return undefined;
    const n = Number(raw) / Number(precision);
    return Number.isFinite(n) ? n : undefined;
}
export function absBigInt(x) {
    return x < 0n ? -x : x;
}
/** Decode Drift's space-padded ASCII byte-array market name. */
export function decodeMarketName(name) {
    if (!Array.isArray(name) || name.length === 0)
        return undefined;
    const s = name
        .filter((c) => Number.isInteger(c) && c > 0 && c < 128)
        .map((c) => String.fromCharCode(c))
        .join("")
        .trim();
    return s.length > 0 ? s.toUpperCase() : undefined;
}
/** The single key of an anchor enum object, e.g. `{ reduceOnly: {} }` → 'reduceOnly'. */
export function anchorEnumKey(value) {
    if (!value || typeof value !== "object")
        return undefined;
    const keys = Object.keys(value);
    return keys.length > 0 ? keys[0] : undefined;
}
