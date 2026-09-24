/*
 * Portions of this file are derived from Aetheria (https://github.com/venymlabs/aetheria),
 * Copyright Venym Labs, licensed under the Apache License, Version 2.0.
 * See NOTICE and licenses/APACHE-2.0.txt. Modified for RetifyOS.
 * SPDX-License-Identifier: Apache-2.0
 */
export class PoolGuardError extends Error {
    code;
    details;
    constructor(code, message, details) {
        super(message);
        this.name = "PoolGuardError";
        this.code = code;
        this.details = details;
    }
}
export function isPoolGuardError(error) {
    return error instanceof PoolGuardError;
}
export function refuse(code, message, details) {
    return details === undefined ? { code, message } : { code, message, details };
}
/** Turn a data-shaped refusal into the throwable form (used at the tool boundary). */
export function throwRefusal(r) {
    throw new PoolGuardError(r.code, r.message, r.details);
}
