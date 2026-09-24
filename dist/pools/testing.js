/*
 * Portions of this file are derived from Aetheria (https://github.com/venymlabs/aetheria),
 * Copyright Venym Labs, licensed under the Apache License, Version 2.0.
 * See NOTICE and licenses/APACHE-2.0.txt. Modified for RetifyOS.
 * SPDX-License-Identifier: Apache-2.0
 */
import { PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "../chains/solana/spl.js";
import { BONDING_CURVE_DISCRIMINATOR, GLOBAL_DISCRIMINATOR, PUMP_TOTAL_SUPPLY, } from "./pumpfun/constants.js";
/**
 * Test doubles.
 *
 * Shipped as part of the package rather than hidden in a `__tests__` folder so the
 * engine's own selfcheck can drive this package end-to-end with **zero network and
 * zero keys** — the same property the kernel selfcheck has. Nothing here is used
 * by production code paths.
 */
export const TEST_BLOCKHASH = "GHtXQBsoZHVnNFa9YevAzFr17DJjgHXk3ycTKD5xD3Zi";
/** A synthetic `BondingCurve` account at any of its three historical lengths. */
export function curveAccountBuffer(f = {}) {
    const len = f.length ?? 115;
    const buf = Buffer.alloc(len);
    Buffer.from(BONDING_CURVE_DISCRIMINATOR).copy(buf, 0);
    buf.writeBigUInt64LE(f.virtualTokenReserves ?? 536500000000000n, 8);
    buf.writeBigUInt64LE(f.virtualSolReserves ?? 60000000000n, 16);
    buf.writeBigUInt64LE(f.realTokenReserves ?? 256600000000000n, 24);
    buf.writeBigUInt64LE(f.realSolReserves ?? 30000000000n, 32);
    buf.writeBigUInt64LE(f.tokenTotalSupply ?? PUMP_TOTAL_SUPPLY, 40);
    buf.writeUInt8(f.complete ? 1 : 0, 48);
    if (len >= 81)
        new PublicKey(f.creator ?? "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM")
            .toBuffer()
            .copy(buf, 49);
    if (len >= 82)
        buf.writeUInt8(f.isMayhemMode ? 1 : 0, 81);
    if (len >= 83)
        buf.writeUInt8(f.isCashbackCoin ? 1 : 0, 82);
    if (len >= 115)
        new PublicKey(f.quoteMint ?? PublicKey.default.toBase58())
            .toBuffer()
            .copy(buf, 83);
    return Uint8Array.from(buf);
}
export function globalAccountBuffer(f = {}) {
    const buf = Buffer.alloc(386);
    Buffer.from(GLOBAL_DISCRIMINATOR).copy(buf, 0);
    buf.writeUInt8(1, 8);
    new PublicKey(f.authority ?? "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM")
        .toBuffer()
        .copy(buf, 9);
    const primary = f.feeRecipient ?? "CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM";
    new PublicKey(primary).toBuffer().copy(buf, 41);
    buf.writeBigUInt64LE(1073000000000000n, 73);
    buf.writeBigUInt64LE(30000000000n, 81);
    buf.writeBigUInt64LE(f.initialRealTokenReserves ?? 793100000000000n, 89);
    buf.writeBigUInt64LE(PUMP_TOTAL_SUPPLY, 97);
    buf.writeBigUInt64LE(f.feeBasisPoints ?? 95n, 105);
    buf.writeBigUInt64LE(f.creatorFeeBasisPoints ?? 5n, 154);
    (f.feeRecipients ?? [primary]).forEach((r, i) => {
        if (162 + i * 32 + 32 <= buf.length)
            new PublicKey(r).toBuffer().copy(buf, 162 + i * 32);
    });
    return Uint8Array.from(buf);
}
/** An SPL mint account: `decimals` is the single byte at offset 44. */
export function mintAccountBuffer(decimals = 6) {
    const buf = Buffer.alloc(82);
    buf.writeUInt8(decimals, 44);
    return Uint8Array.from(buf);
}
// ── ChainReader ──────────────────────────────────────────────────────────────
export class FakeChainReader {
    accounts = new Map();
    balances = new Map();
    blockhash = {
        blockhash: TEST_BLOCKHASH,
        lastValidBlockHeight: 1_000,
    };
    calls = [];
    set(address, data, owner = TOKEN_PROGRAM_ID.toBase58(), lamports = 1000000n) {
        this.accounts.set(address, { address, owner, data, lamports });
        return this;
    }
    setBalance(owner, mint, amount) {
        this.balances.set(`${owner}:${mint}`, amount);
        return this;
    }
    async getAccount(address) {
        this.calls.push(`getAccount:${address}`);
        return this.accounts.get(address) ?? null;
    }
    async getMultipleAccounts(addresses) {
        this.calls.push(`getMultipleAccounts:${addresses.length}`);
        return addresses.map((a) => this.accounts.get(a) ?? null);
    }
    async getLatestBlockhash() {
        return this.blockhash;
    }
    async getTokenBalance(owner, mint) {
        return this.balances.get(`${owner}:${mint}`) ?? 0n;
    }
}
/** One `TransactionInstruction`-shaped memo, enough for `compileToV0Message`. */
function memoIx(payer) {
    return {
        programId: new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"),
        keys: [{ pubkey: new PublicKey(payer), isSigner: true, isWritable: true }],
        data: Buffer.from("fake"),
    };
}
export class FakeDlmmPool {
    #opts;
    calls = [];
    constructor(opts) {
        this.#opts = opts;
    }
    get state() {
        return this.#opts.state;
    }
    async refresh() {
        return this.#opts.state;
    }
    async positionsOf(owner) {
        this.calls.push(`positionsOf:${owner}`);
        return (this.#opts.positions ?? []).filter((p) => p.owner === owner);
    }
    async buildAddLiquidity(args) {
        this.calls.push(`add:${args.lowerBinId}..${args.upperBinId}:${args.shape}`);
        const isNew = args.positionAddress === undefined;
        return {
            instructions: [memoIx(args.owner)],
            extraSigners: isNew && this.#opts.requireExtraSignerOnNewPosition !== false
                ? [PublicKey.unique().toBase58()]
                : [],
            description: isNew
                ? "open new position"
                : `add to ${args.positionAddress}`,
        };
    }
    async buildRemoveLiquidity(args) {
        this.calls.push(`remove:${args.bpsToRemove}:${args.claimAndClose}`);
        return {
            instructions: [memoIx(args.owner)],
            extraSigners: [],
            description: `remove ${args.bpsToRemove}bps`,
        };
    }
    async buildClaimFees(args) {
        this.calls.push(`claim:${args.positionAddress}`);
        return {
            instructions: [memoIx(args.owner)],
            extraSigners: [],
            description: "claim fees",
        };
    }
}
export class FakeDlmmSdk {
    #pools = new Map();
    addPool(opts) {
        const pool = new FakeDlmmPool(opts);
        this.#pools.set(opts.state.address, pool);
        return pool;
    }
    async openPool(poolAddress) {
        const pool = this.#pools.get(poolAddress);
        if (!pool)
            throw new Error(`fake sdk has no pool ${poolAddress}`);
        return pool;
    }
    async positionsOfUser(owner) {
        const out = [];
        for (const [address, pool] of this.#pools) {
            for (const p of await pool.positionsOf(owner))
                out.push({ pool: address, position: p });
        }
        return out;
    }
}
/** A gateway that records intents and confirms them. It never signs anything. */
export class RecordingGateway {
    executions = [];
    result = {};
    async execute(intent, opts) {
        this.executions.push({
            intent,
            idempotencyKey: opts.idempotencyKey,
            confirmedByUser: opts.confirmedByUser ?? false,
        });
        return {
            tradeId: "trd_fake",
            state: "confirmed",
            signature: "sig_fake",
            simulated: false,
            summary: intent.summary,
            fill: undefined,
            error: undefined,
            ...this.result,
        };
    }
}
const notImplemented = (what) => () => {
    throw new Error(`fake ToolContext: ${what} is not wired for this test`);
};
export function cleanMintInfo(mint, decimals = 6) {
    return {
        mint,
        decimals,
        programId: TOKEN_PROGRAM_ID.toBase58(),
        isToken2022: false,
        freezeAuthority: null,
        mintAuthority: null,
    };
}
/** A `ToolContext` with only the seams the pools tools actually touch. */
export function fakeToolContext(opts = {}) {
    const gateway = opts.gateway ?? new RecordingGateway();
    const mints = opts.mints ?? {};
    return {
        ownerWallet: opts.ownerWallet ?? "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
        rpcUrl: "http://fake",
        services: {
            solana: {
                getSolLamports: notImplemented("getSolLamports"),
                getTokenHoldings: notImplemented("getTokenHoldings"),
                getMintInfo: async (mint) => {
                    const info = mints[mint];
                    if (!info)
                        throw new Error(`fake ToolContext: no mint record for ${mint}`);
                    return info;
                },
            },
            jupiter: {
                quote: notImplemented("jupiter.quote"),
                buildSwap: notImplemented("jupiter.buildSwap"),
            },
        },
        gateway,
        log: { info: () => { }, warn: () => { }, error: () => { }, debug: () => { } },
        signal: undefined,
    };
}
