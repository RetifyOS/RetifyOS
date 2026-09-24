/*
 * Portions of this file are derived from Aetheria (https://github.com/venymlabs/aetheria),
 * Copyright Venym Labs, licensed under the Apache License, Version 2.0.
 * See NOTICE and licenses/APACHE-2.0.txt. Modified for RetifyOS.
 * SPDX-License-Identifier: Apache-2.0
 */
import { PublicKey, TransactionMessage, VersionedTransaction, } from "@solana/web3.js";
import { PoolGuardError } from "../errors.js";
export const DLMM_PACKAGE = "@meteora-ag/dlmm";
/**
 * Load `@meteora-ag/dlmm` at runtime.
 *
 * The specifier is held in a variable so TypeScript treats the import as `any`
 * rather than failing to resolve a module that is intentionally not a build-time
 * dependency. A missing package produces `POOL_SDK_MISSING` naming the install
 * command — not a stack trace from deep inside Anchor.
 */
export async function loadDlmmModule() {
    const specifier = DLMM_PACKAGE;
    try {
        return (await import(specifier));
    }
    catch (e) {
        throw new PoolGuardError("POOL_SDK_MISSING", `${DLMM_PACKAGE} is not installed. Run "npm install ${DLMM_PACKAGE}" ` +
            "to enable Meteora liquidity actions — it is an OPTIONAL peer dependency, " +
            "deliberately kept out of the production install so it adds no audit surface " +
            "to a deployment that does not use it.", { cause: e instanceof Error ? e.message : String(e) });
    }
}
/** SDK `StrategyType` names for our venue-agnostic shapes. */
export const STRATEGY_NAME = {
    spot: "Spot",
    curve: "Curve",
    "bid-ask": "BidAsk",
};
/**
 * Compile instructions into an unsigned v0 transaction, base64 wire.
 *
 * The SDK emits legacy `Transaction` objects; recompiling their instructions to v0
 * keeps one wire format across this whole package and matches what the kernel's
 * simulator and signer already handle. No address-lookup tables are resolved,
 * which caps how many bins fit in one transaction — the `maxLevelSpan` guard is
 * what stops a caller walking into that wall.
 */
export function compileV0(args) {
    const message = new TransactionMessage({
        payerKey: new PublicKey(args.payer),
        recentBlockhash: args.recentBlockhash,
        instructions: [...args.instructions],
    }).compileToV0Message();
    return Buffer.from(new VersionedTransaction(message).serialize()).toString("base64");
}
