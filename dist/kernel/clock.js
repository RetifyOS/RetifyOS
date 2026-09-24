/*
 * Portions of this file are derived from Aetheria (https://github.com/venymlabs/aetheria),
 * Copyright Venym Labs, licensed under the Apache License, Version 2.0.
 * See NOTICE and licenses/APACHE-2.0.txt. Modified for RetifyOS.
 * SPDX-License-Identifier: Apache-2.0
 */
export const systemClock = { now: () => Date.now() };
/** A driveable clock for the selfcheck harness — lets invariants test time windows deterministically. */
export class ManualClock {
    #t;
    constructor(startMs = 0) {
        this.#t = startMs;
    }
    now() {
        return this.#t;
    }
    advance(ms) {
        this.#t += ms;
    }
    set(ms) {
        this.#t = ms;
    }
}
