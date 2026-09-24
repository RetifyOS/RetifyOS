/*
 * Portions of this file are derived from Aetheria (https://github.com/venymlabs/aetheria),
 * Copyright Venym Labs, licensed under the Apache License, Version 2.0.
 * See NOTICE and licenses/APACHE-2.0.txt. Modified for RetifyOS: the Aetheria
 * `@aetheria/shared` package (enums, policy, intent, wallet, kernel, services,
 * events) is folded into this single contracts module.
 * SPDX-License-Identifier: Apache-2.0
 */
// ── Lifecycle enums ──────────────────────────────────────────────────────────
/**
 * Trade lifecycle. The reconciler is the single writer of these transitions.
 *   reserved → sent → (confirmed | expired | errored)
 *   reserved → rejected            (a guard refused before broadcast)
 * `expired` is TERMINAL — the kernel never re-signs the same intent under a new
 * blockhash (that is how you double-spend).
 */
export const TRADE_STATES = [
    "reserved",
    "sent",
    "confirmed",
    "expired",
    "errored",
    "rejected",
];
/**
 * The four perpetuals kinds. `perp_reduce` / `perp_close` are *reducing*: they
 * shrink risk, post no new collateral, and must stay reachable when an opening
 * intent would be refused — an agent must always be able to get flat.
 */
export const PERP_INTENT_KINDS = [
    "perp_open",
    "perp_increase",
    "perp_reduce",
    "perp_close",
];
/** Concentrated-liquidity and bonding-curve kinds. */
export const POOL_INTENT_KINDS = [
    "lp_open",
    "lp_add",
    "lp_remove",
    "lp_close",
    "lp_claim",
    "lp_rebalance",
    "curve_buy",
    "curve_sell",
];
/**
 * Every shape of value movement the kernel knows how to chokepoint. The kind is
 * declared by the tool and re-validated here; it selects the settle strategy
 * (see {@link settleModeFor}) and nothing else. It never relaxes a cap.
 */
export const INTENT_KINDS = [
    "swap",
    ...PERP_INTENT_KINDS,
    ...POOL_INTENT_KINDS,
];
export function isIntentKind(kind) {
    return INTENT_KINDS.includes(kind);
}
export function isPerpIntentKind(kind) {
    return PERP_INTENT_KINDS.includes(kind);
}
/**
 * Kinds that post zero collateral. A perp reduce or close hands the venue an
 * order, not money: its input leg is legitimately `0n`, so the "input must be
 * positive" rule is gated on this rather than removed. Every other kind still
 * has to declare a real outflow — that is what the spend caps bind to.
 */
export function postsZeroCollateral(kind) {
    return kind === "perp_reduce" || kind === "perp_close";
}
export function settleModeFor(kind) {
    return isPerpIntentKind(kind) ? "venue-position" : "token-delta";
}
// ── The intent-tool contract ─────────────────────────────────────────────────
/**
 * The contract for tools that can reach the money path.
 *
 * This is deliberately NOT `src/agent/types.ts`'s `ToolDefinition`, which is the
 * model-facing registry contract (JSON schema in, JSON out). The two differ in
 * the one way that matters here: a tool defined below has a `simulate()` that
 * returns a real, executable {@link TradeIntent} without signing anything, and
 * an `execute()` whose ONLY route to value movement is `ctx.gateway.execute()`.
 * That is what keeps "the model cannot move money" a structural property rather
 * than a convention. `src/tools/` adapts these onto the agent registry.
 */
export const TOOL_CAPABILITIES = [
    "read",
    "sign",
    "spend",
    "network",
    "read_state",
    "write_state",
];
export const TOOL_CATEGORIES = [
    "data",
    "swap",
    "perps",
    "lending",
    "lp",
    "launchpad",
    "staking",
    "nft",
    "wallet",
    "notify",
];
export function hasToolCapability(tool, cap) {
    return tool.capabilities.includes(cap);
}
/** A tool moves value iff it declares `sign` or `spend`. */
export function movesValue(caps) {
    return caps.includes("sign") || caps.includes("spend");
}
