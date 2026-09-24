/*
 * Portions of this file are derived from Aetheria (https://github.com/venymlabs/aetheria),
 * Copyright Venym Labs, licensed under the Apache License, Version 2.0.
 * See NOTICE and licenses/APACHE-2.0.txt. Modified for RetifyOS.
 * SPDX-License-Identifier: Apache-2.0
 */
import { PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, } from "../../chains/solana/spl.js";
import { PoolGuardError } from "../errors.js";
import { FALLBACK_CREATOR_FEE_BPS, FALLBACK_PROTOCOL_FEE_BPS, PUMP_FEE_PROGRAM_ID, PUMP_PROGRAM_ID, PUMP_TOKEN_DECIMALS, } from "./constants.js";
import { bondingCurvePda, decodeBondingCurve, decodeFeeConfig, decodeGlobal, feeConfigPda, globalPda, isSolPaired, } from "./curve.js";
import { bondingCurveMarketCap, calculateFeeTier, curveFeeBps, curveProgressPct, curveUiPrice, } from "./math.js";
export class PumpFunClient {
    #chain;
    #programId;
    #feeProgramId;
    constructor(chain, opts = {}) {
        this.#chain = chain;
        this.#programId = opts.programId ?? PUMP_PROGRAM_ID;
        this.#feeProgramId = opts.feeProgramId ?? PUMP_FEE_PROGRAM_ID;
    }
    get programId() {
        return this.#programId;
    }
    /** Curve PDA for a mint. Cheap and offline — safe to call before knowing the curve exists. */
    curveAddressFor(mint) {
        return bondingCurvePda(new PublicKey(mint), this.#programId).toBase58();
    }
    /**
     * Full curve state, or `null` when the mint has no pump.fun curve at all (i.e.
     * it was never a pump launch — a different thing from "migrated", which returns
     * state with `complete: true` so the caller can route it to Jupiter knowingly).
     */
    async readCurve(mint) {
        const mintPk = new PublicKey(mint);
        const curveAddress = bondingCurvePda(mintPk, this.#programId).toBase58();
        const globalAddress = globalPda(this.#programId).toBase58();
        const feeConfigAddress = feeConfigPda(this.#programId, this.#feeProgramId).toBase58();
        const [curveAcc, globalAcc, feeAcc, mintAcc] = await this.#chain.getMultipleAccounts([
            curveAddress,
            globalAddress,
            feeConfigAddress,
            mint,
        ]);
        if (!curveAcc)
            return null;
        if (!globalAcc) {
            throw new PoolGuardError("POOL_VENUE_ERROR", "pump.fun Global account is unreadable — refusing to quote");
        }
        const raw = decodeBondingCurve(curveAcc.data);
        const global = decodeGlobal(globalAcc.data);
        // Fee split: prefer the on-chain tier table, then its flat row, then Global's
        // legacy fields, then a hardcoded fallback. Each step down is recorded in
        // `feeSource` so a caller can see exactly how confident the number is.
        let fees;
        let feeSource;
        const marketCapLamports = bondingCurveMarketCap({
            mintSupply: raw.tokenTotalSupply,
            virtualSolReserves: raw.virtualSolReserves,
            virtualTokenReserves: raw.virtualTokenReserves,
        });
        if (feeAcc) {
            try {
                const cfg = decodeFeeConfig(feeAcc.data);
                if (cfg.feeTiers.length > 0) {
                    fees = calculateFeeTier(cfg.feeTiers, marketCapLamports);
                    feeSource = "tiered";
                }
                else {
                    fees = cfg.flatFees;
                    feeSource = "flat";
                }
            }
            catch {
                fees = {
                    lpFeeBps: 0n,
                    protocolFeeBps: global.feeBasisPoints,
                    creatorFeeBps: global.creatorFeeBasisPoints ?? 0n,
                };
                feeSource = "global";
            }
        }
        else if (global.creatorFeeBasisPoints !== undefined) {
            fees = {
                lpFeeBps: 0n,
                protocolFeeBps: global.feeBasisPoints,
                creatorFeeBps: global.creatorFeeBasisPoints,
            };
            feeSource = "global";
        }
        else {
            fees = {
                lpFeeBps: 0n,
                protocolFeeBps: BigInt(FALLBACK_PROTOCOL_FEE_BPS),
                creatorFeeBps: BigInt(FALLBACK_CREATOR_FEE_BPS),
            };
            feeSource = "fallback";
        }
        const tokenProgramId = mintAcc?.owner ?? TOKEN_PROGRAM_ID.toBase58();
        const tokenDecimals = decodeMintDecimals(mintAcc?.data) ?? PUMP_TOKEN_DECIMALS;
        return {
            mint,
            curveAddress,
            creator: raw.creator,
            virtualSolReserves: raw.virtualSolReserves,
            virtualTokenReserves: raw.virtualTokenReserves,
            realSolReserves: raw.realSolReserves,
            realTokenReserves: raw.realTokenReserves,
            tokenTotalSupply: raw.tokenTotalSupply,
            complete: raw.complete,
            feeBps: curveFeeBps(fees),
            fees,
            feeSource,
            marketCapLamports,
            uiPriceSol: curveUiPrice(raw, tokenDecimals),
            progressPct: curveProgressPct(raw, global.initialRealTokenReserves),
            tokenDecimals,
            tokenProgramId,
            solPaired: isSolPaired(raw),
            isMayhemMode: raw.isMayhemMode,
            isCashbackCoin: raw.isCashbackCoin,
            global,
            raw,
        };
    }
    async getLatestBlockhash() {
        return this.#chain.getLatestBlockhash();
    }
}
/** SPL mint layout: `decimals` is a single byte at offset 44. */
function decodeMintDecimals(data) {
    if (!data || data.length < 45)
        return null;
    return data[44] ?? null;
}
export const TOKEN_2022_PROGRAM = TOKEN_2022_PROGRAM_ID.toBase58();
