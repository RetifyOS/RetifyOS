import type { SignedTx, WalletProvider } from "../../kernel/contracts.js";
import { Keystore } from "../../vault/index.js";
export interface GeneratedWallet {
    readonly pubkey: string;
    readonly secretKey: Uint8Array;
}
/** Generate a fresh Solana keypair locally. The secret never leaves this process. */
export declare function generateWallet(): GeneratedWallet;
/** Persist a generated wallet's secret key into the (unlocked) keystore, then zero the source. */
export declare function storeWallet(ks: Keystore, secretKey: Uint8Array): void;
/**
 * Explicit acknowledgement that in-process signing is being used instead of the
 * isolated signer. Required positionally so that no call site can construct a
 * {@link LocalWallet} without the reader of that line seeing what it opted into.
 */
export interface UnsafeInProcessSigning {
    readonly allowUnsafeInProcessSigning: true;
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
export declare class LocalWallet implements WalletProvider {
    #private;
    readonly pubkey: string;
    constructor(ks: Keystore, pubkey: string, opts: UnsafeInProcessSigning);
    /** Derive the provider from a keystore that already holds a wallet secret. */
    static fromKeystore(ks: Keystore, opts: UnsafeInProcessSigning): LocalWallet;
    sign(unsignedTxBase64: string): Promise<SignedTx>;
}
