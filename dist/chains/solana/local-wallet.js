/*
 * Portions of this file are derived from Aetheria (https://github.com/venymlabs/aetheria),
 * Copyright Venym Labs, licensed under the Apache License, Version 2.0.
 * See NOTICE and licenses/APACHE-2.0.txt. Modified for RetifyOS.
 * SPDX-License-Identifier: Apache-2.0
 */
import { Keypair, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import { WALLET_SECRET_ID } from "../../vault/index.js";
/** Generate a fresh Solana keypair locally. The secret never leaves this process. */
export function generateWallet() {
    const kp = Keypair.generate();
    return { pubkey: kp.publicKey.toBase58(), secretKey: kp.secretKey };
}
/** Persist a generated wallet's secret key into the (unlocked) keystore, then zero the source. */
export function storeWallet(ks, secretKey) {
    const buf = Buffer.from(secretKey);
    ks.put(WALLET_SECRET_ID, "wallet", buf);
    buf.fill(0);
}
/**
 * Refuse in-process signing unless it has been opted into twice: once in code,
 * and once in the environment. Mirrors the double/triple opt-in that guards
 * mainnet execution in `src/config/`.
 */
function assertInProcessSigningAllowed(opts) {
    if (opts?.allowUnsafeInProcessSigning !== true) {
        throw new Error("LocalWallet performs unpoliced in-process signing and must be opted into explicitly");
    }
    if (process.env.UNSAFE_ALLOW_INPROCESS_SIGNER !== "true") {
        throw new Error("LocalWallet requires UNSAFE_ALLOW_INPROCESS_SIGNER=true; production custody is the isolated signer");
    }
}
/**
 * A development and test {@link WalletProvider} that signs in-process. It holds
 * only the public key; the private key is loaded transiently from the keystore
 * inside `sign()` and zeroed immediately after. Transactions use base64 wire via
 * web3.js `VersionedTransaction`, round-tripping both legacy and v0.
 *
 * **This is not RetifyOS's custody model and must never be wired into a production
 * execution path.** `sign()` signs whatever bytes it is handed: it does not
 * decode the transaction, re-check policy, or require an authorization envelope.
 * Substituting it for the isolated signer silently removes the entire custody
 * boundary — the property the whole system exists to provide.
 *
 * The isolated signer daemon (`src/signer/`) satisfies the same `WalletProvider`
 * seam while decoding independently, re-checking policy in its own process, and
 * enforcing a one-time authorization fence. The kernel cannot tell the two
 * apart, which is exactly why this one is gated rather than merely documented.
 */
export class LocalWallet {
    pubkey;
    #ks;
    constructor(ks, pubkey, opts) {
        assertInProcessSigningAllowed(opts);
        this.#ks = ks;
        this.pubkey = pubkey;
    }
    /** Derive the provider from a keystore that already holds a wallet secret. */
    static fromKeystore(ks, opts) {
        assertInProcessSigningAllowed(opts);
        const pubkey = ks.use(WALLET_SECRET_ID, (bytes) => Keypair.fromSecretKey(Uint8Array.from(bytes)).publicKey.toBase58());
        return new LocalWallet(ks, pubkey, opts);
    }
    async sign(unsignedTxBase64) {
        return this.#ks.use(WALLET_SECRET_ID, (bytes) => {
            const kp = Keypair.fromSecretKey(Uint8Array.from(bytes));
            const tx = VersionedTransaction.deserialize(Buffer.from(unsignedTxBase64, "base64"));
            tx.sign([kp]);
            const wireBase64 = Buffer.from(tx.serialize()).toString("base64");
            const sig = tx.signatures[0];
            if (!sig || sig.length === 0) {
                throw new Error("transaction has no signature after signing");
            }
            return { wireBase64, signature: bs58.encode(sig) };
        });
    }
}
