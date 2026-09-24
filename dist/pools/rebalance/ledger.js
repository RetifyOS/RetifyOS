/*
 * Portions of this file are derived from Aetheria (https://github.com/venymlabs/aetheria),
 * Copyright Venym Labs, licensed under the Apache License, Version 2.0.
 * See NOTICE and licenses/APACHE-2.0.txt. Modified for RetifyOS.
 * SPDX-License-Identifier: Apache-2.0
 */
export const EMPTY_HISTORY = {
    lastAt: null,
    countInWindow: 0,
};
const DAY_MS = 86_400_000;
/** In-memory rolling-window ledger. One instance per engine; keyed by position address. */
export class RebalanceLedger {
    #windowMs;
    #byPosition = new Map();
    constructor(windowMs = DAY_MS) {
        this.#windowMs = Math.max(1, Math.floor(windowMs));
    }
    /** Record a rebalance that actually executed. Never record a rejected decision. */
    record(positionAddress, at) {
        const list = this.#byPosition.get(positionAddress) ?? [];
        list.push(at);
        this.#prune(list, at);
        this.#byPosition.set(positionAddress, list);
    }
    history(positionAddress, now) {
        const list = this.#byPosition.get(positionAddress);
        if (!list || list.length === 0)
            return EMPTY_HISTORY;
        this.#prune(list, now);
        if (list.length === 0)
            return EMPTY_HISTORY;
        return { lastAt: Math.max(...list), countInWindow: list.length };
    }
    /** Positions with any activity still inside the window. */
    tracked() {
        return [...this.#byPosition.keys()];
    }
    #prune(list, now) {
        const cutoff = now - this.#windowMs;
        while (list.length > 0 && list[0] < cutoff)
            list.shift();
    }
}
