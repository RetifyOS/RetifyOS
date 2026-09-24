/*
 * Portions of this file are derived from Aetheria (https://github.com/venymlabs/aetheria),
 * Copyright Venym Labs, licensed under the Apache License, Version 2.0.
 * See NOTICE and licenses/APACHE-2.0.txt. Modified for RetifyOS.
 * SPDX-License-Identifier: Apache-2.0
 */
import { randomUUID } from "node:crypto";
import { WSOL_MINT } from "../money.js";
/** A tiny in-memory "chain" the mock ports share, so a broadcast actually moves mock balances. */
export class MockChain {
    balances = new Map();
    fill = null;
    confirmStatus = "confirmed";
    simOk = true;
    /** When set, MockBroadcaster.broadcast throws — models an RPC send failure. */
    broadcastError = null;
    /** Signed venue positions, keyed by {@link positionKey}. Positive = long. */
    positions = new Map();
    /** Signed base-unit change a confirmed broadcast applies to `positionFillKey`. */
    positionFill = null;
    /** When set, MockPositions.readPosition throws — models an unreadable venue. */
    positionError = null;
    applyFill() {
        if (this.fill) {
            const f = this.fill;
            this.balances.set(f.inMint, (this.balances.get(f.inMint) ?? 0n) - f.inAmt);
            this.balances.set(f.outMint, (this.balances.get(f.outMint) ?? 0n) + f.outAmt);
        }
        if (this.positionFill) {
            const p = this.positionFill;
            this.positions.set(p.key, (this.positions.get(p.key) ?? 0n) + p.delta);
        }
    }
}
export function positionKey(ref) {
    return `${ref.venue}:${ref.market}:${ref.subAccountId}`;
}
/** A venue position book the gateway's perp settle check can diff against. */
export class MockPositions {
    #chain;
    constructor(chain) {
        this.#chain = chain;
    }
    async readPosition(ref) {
        if (this.#chain.positionError)
            throw new Error(this.#chain.positionError);
        return this.#chain.positions.get(positionKey(ref)) ?? 0n;
    }
}
export class MockMints {
    #token2022;
    constructor(token2022 = []) {
        this.#token2022 = new Set(token2022);
    }
    async inspect(mint) {
        const is = this.#token2022.has(mint);
        return {
            mint,
            decimals: mint === WSOL_MINT ? 9 : 6,
            programId: is ? "TokenzQdBJM (token-2022)" : "TokenkegQfeZ (spl-token)",
            isToken2022: is,
            freezeAuthority: null,
            mintAuthority: null,
        };
    }
}
export class MockBalances {
    #chain;
    constructor(chain) {
        this.#chain = chain;
    }
    async readBalance(_owner, mint) {
        return this.#chain.balances.get(mint) ?? 0n;
    }
}
export class MockSimulator {
    #chain;
    constructor(chain) {
        this.#chain = chain;
    }
    async simulate(_wireBase64) {
        return {
            ok: this.#chain.simOk,
            err: this.#chain.simOk ? undefined : "sim failed",
            logs: undefined,
            unitsConsumed: undefined,
        };
    }
}
export class MockBroadcaster {
    #chain;
    constructor(chain) {
        this.#chain = chain;
    }
    async broadcast(signed, _landHandle) {
        if (this.#chain.broadcastError)
            throw new Error(this.#chain.broadcastError);
        if (this.#chain.confirmStatus === "confirmed")
            this.#chain.applyFill();
        return { signature: signed.signature };
    }
}
export class MockConfirmer {
    #chain;
    constructor(chain) {
        this.#chain = chain;
    }
    async confirm(_signature, _lastValidBlockHeight) {
        return { status: this.#chain.confirmStatus, slot: 1, err: undefined };
    }
}
export class MockWallet {
    pubkey = "MockWa11et1111111111111111111111111111111111";
    async sign(unsignedTxBase64) {
        return {
            wireBase64: unsignedTxBase64,
            signature: `mocksig_${randomUUID()}`,
        };
    }
}
