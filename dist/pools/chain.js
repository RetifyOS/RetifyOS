/*
 * Portions of this file are derived from Aetheria (https://github.com/venymlabs/aetheria),
 * Copyright Venym Labs, licensed under the Apache License, Version 2.0.
 * See NOTICE and licenses/APACHE-2.0.txt. Modified for RetifyOS.
 * SPDX-License-Identifier: Apache-2.0
 */
import { Connection, PublicKey } from "@solana/web3.js";
/** `ChainReader` over a web3.js `Connection`. Accepts anything Connection-shaped. */
export class RpcChainReader {
    #connection;
    constructor(connectionOrUrl) {
        this.#connection =
            typeof connectionOrUrl === "string"
                ? new Connection(connectionOrUrl, "confirmed")
                : connectionOrUrl;
    }
    async getAccount(address) {
        const info = await this.#connection.getAccountInfo(new PublicKey(address), "confirmed");
        if (!info)
            return null;
        return {
            address,
            owner: info.owner.toBase58(),
            data: Uint8Array.from(info.data),
            lamports: BigInt(info.lamports),
        };
    }
    async getMultipleAccounts(addresses) {
        if (addresses.length === 0)
            return [];
        const infos = await this.#connection.getMultipleAccountsInfo(addresses.map((a) => new PublicKey(a)), "confirmed");
        return infos.map((info, i) => info
            ? {
                address: addresses[i],
                owner: info.owner.toBase58(),
                data: Uint8Array.from(info.data),
                lamports: BigInt(info.lamports),
            }
            : null);
    }
    async getLatestBlockhash() {
        const r = await this.#connection.getLatestBlockhash("confirmed");
        return {
            blockhash: r.blockhash,
            lastValidBlockHeight: r.lastValidBlockHeight,
        };
    }
    async getTokenBalance(owner, mint) {
        const res = await this.#connection.getParsedTokenAccountsByOwner(new PublicKey(owner), { mint: new PublicKey(mint) });
        let total = 0n;
        for (const { account } of res.value) {
            const data = account.data;
            if (data instanceof Buffer || !("parsed" in data))
                continue;
            const info = data.parsed.info;
            const amount = info?.tokenAmount?.amount;
            if (amount)
                total += BigInt(amount);
        }
        return total;
    }
}
