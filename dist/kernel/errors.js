/*
 * Portions of this file are derived from Aetheria (https://github.com/venymlabs/aetheria),
 * Copyright Venym Labs, licensed under the Apache License, Version 2.0.
 * See NOTICE and licenses/APACHE-2.0.txt. Modified for RetifyOS.
 * SPDX-License-Identifier: Apache-2.0
 */
export class GuardError extends Error {
    code;
    details;
    constructor(code, message, details) {
        super(message);
        this.name = "GuardError";
        this.code = code;
        this.details = details;
    }
}
export function isGuardError(error) {
    return error instanceof GuardError;
}
