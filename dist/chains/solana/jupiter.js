/*
 * Portions of this file are derived from Aetheria (https://github.com/venymlabs/aetheria),
 * Copyright Venym Labs, licensed under the Apache License, Version 2.0.
 * See NOTICE and licenses/APACHE-2.0.txt. Modified for RetifyOS.
 * SPDX-License-Identifier: Apache-2.0
 */
import { VersionedTransaction } from "@solana/web3.js";
const LITE_BASE = "https://lite-api.jup.ag";
const PRO_BASE = "https://api.jup.ag";
/** Jupiter quote→swap with self-RPC landing (the kernel owns the blockhash lifecycle). */
export class JupiterClient {
    #base;
    #apiKey;
    constructor(opts) {
        this.#apiKey = opts?.apiKey;
        this.#base = (opts?.baseUrl ?? (opts?.apiKey ? PRO_BASE : LITE_BASE)).replace(/\/+$/, "");
    }
    #headers(extra) {
        const h = { accept: "application/json", ...extra };
        if (this.#apiKey)
            h["x-api-key"] = this.#apiKey;
        return h;
    }
    async quote(args) {
        const url = `${this.#base}/swap/v1/quote?inputMint=${args.inputMint}&outputMint=${args.outputMint}` +
            `&amount=${args.amount.toString()}&slippageBps=${args.slippageBps}&restrictIntermediateTokens=true`;
        const res = await fetch(url, { headers: this.#headers() });
        if (!res.ok) {
            throw new Error(`Jupiter quote failed ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
        }
        const j = (await res.json());
        const routeLabel = (j.routePlan ?? [])
            .map((p) => p.swapInfo?.label)
            .filter((x) => Boolean(x))
            .join(" → ") || "Jupiter";
        return {
            inputMint: args.inputMint,
            outputMint: args.outputMint,
            inAmount: BigInt(j.inAmount),
            outAmount: BigInt(j.outAmount),
            otherAmountThreshold: BigInt(j.otherAmountThreshold),
            priceImpactPct: Number(j.priceImpactPct ?? 0),
            slippageBps: Number(j.slippageBps ?? args.slippageBps),
            routeLabel,
            contextSlot: j.contextSlot ?? undefined,
            raw: j,
        };
    }
    async buildSwap(args) {
        const res = await fetch(`${this.#base}/swap/v1/swap`, {
            method: "POST",
            headers: this.#headers({ "content-type": "application/json" }),
            body: JSON.stringify({
                quoteResponse: args.quote.raw,
                userPublicKey: args.userPublicKey,
                wrapAndUnwrapSol: true,
                dynamicComputeUnitLimit: true,
                prioritizationFeeLamports: args.priorityFeeLamports,
            }),
        });
        if (!res.ok) {
            throw new Error(`Jupiter swap build failed ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
        }
        const j = (await res.json());
        const tx = VersionedTransaction.deserialize(Buffer.from(j.swapTransaction, "base64"));
        return {
            swapTransactionB64: j.swapTransaction,
            recentBlockhash: tx.message.recentBlockhash,
            lastValidBlockHeight: Number(j.lastValidBlockHeight),
            prioritizationFeeLamports: Number(j.prioritizationFeeLamports ?? args.priorityFeeLamports),
        };
    }
}
