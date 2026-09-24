/*
 * Portions of this file are derived from Aetheria (https://github.com/venymlabs/aetheria),
 * Copyright Venym Labs, licensed under the Apache License, Version 2.0.
 * See NOTICE and licenses/APACHE-2.0.txt. Modified for RetifyOS.
 * SPDX-License-Identifier: Apache-2.0
 */
import { defaultPoolGuardConfig } from "../guards.js";
import { defaultRebalancePolicy, } from "../rebalance/decide.js";
import { RebalanceLedger } from "../rebalance/ledger.js";
export const DEFAULT_PRIORITY_FEE_LAMPORTS = 200_000;
export function resolveDeps(input) {
    return {
        ...input,
        guards: input.guards ?? defaultPoolGuardConfig(),
        rebalancePolicy: input.rebalancePolicy ?? defaultRebalancePolicy(),
        ledger: input.ledger ?? new RebalanceLedger(),
        now: input.now ?? (() => Date.now()),
        priorityFeeLamports: input.priorityFeeLamports ?? DEFAULT_PRIORITY_FEE_LAMPORTS,
    };
}
/** Rug-heat for a mint, or null when no signals engine is wired (⇒ a refusal upstream). */
export function readRugHeat(deps, mint) {
    if (!deps.signals)
        return null;
    try {
        return deps.signals.rugHeatScore(mint);
    }
    catch {
        return null;
    }
}
