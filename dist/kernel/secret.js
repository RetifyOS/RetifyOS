/*
 * Portions of this file are derived from Aetheria (https://github.com/venymlabs/aetheria),
 * Copyright Venym Labs, licensed under the Apache License, Version 2.0.
 * See NOTICE and licenses/APACHE-2.0.txt. Modified for RetifyOS.
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Secret<T> — a value that is structurally unloggable.
 *
 * The raw value lives in a true `#private` field, so it is never enumerable,
 * never serialized by JSON.stringify, and never printed by console.log /
 * util.inspect. The ONLY way to get the value out is `.reveal()`, which you call
 * at the exact point of use and never store. This keeps API keys and wallet
 * material out of logs by construction rather than by a redaction list someone
 * forgets to update.
 */
export class Secret {
    #value;
    label;
    /** Last 4 chars — only for high-entropy strings (>= 32 chars). Never for short/low-entropy values. */
    last4;
    constructor(value, label = "secret") {
        this.#value = value;
        this.label = label;
        this.last4 =
            typeof value === "string" && value.length >= 32
                ? value.slice(-4)
                : undefined;
    }
    /** Reveal the raw value. Call ONLY at the point of use; never assign the result to a field. */
    reveal() {
        return this.#value;
    }
    /** Derive a new Secret without ever exposing the value to the caller. */
    map(fn, label = this.label) {
        return new Secret(fn(this.#value), label);
    }
    toString() {
        return `[redacted:${this.label}]`;
    }
    toJSON() {
        return `[redacted:${this.label}]`;
    }
    [Symbol.for("nodejs.util.inspect.custom")]() {
        return this.toString();
    }
}
export function isSecret(value) {
    return value instanceof Secret;
}
