/*
 * Portions of this file are derived from Aetheria (https://github.com/venymlabs/aetheria),
 * Copyright Venym Labs, licensed under the Apache License, Version 2.0.
 * See NOTICE and licenses/APACHE-2.0.txt. Modified for RetifyOS.
 * SPDX-License-Identifier: Apache-2.0
 */
import { SOL_DECIMALS, USDC_DECIMALS, USDC_MINT, WSOL_MINT, toBaseUnits, } from "../kernel/money.js";
export function capsFor(policy, bucket) {
    return bucket === "sol" ? policy.capsSol : policy.capsUsdc;
}
/**
 * Conservative defaults: perps disarmed, 3× leverage, 20% minimum liquidation
 * distance, 1 SOL / 200 USDC of collateral per position.
 */
export function defaultPerpsPolicy() {
    return {
        perpsEnabled: false,
        windDownOnly: false,
        maxLeverage: 3,
        minLiquidationDistanceBps: 2_000,
        maxFundingRateBpsPerHour: 5,
        maxAdverseFundingBpsPerHour: 2,
        maxSlippageBps: 100,
        maxOracleDivergenceBps: 100,
        liquidationToleranceBps: 500,
        maxOpenPositions: 3,
        capsSol: {
            maxCollateralPerPosition: toBaseUnits(1, SOL_DECIMALS),
            maxNotionalPerPosition: toBaseUnits(3, SOL_DECIMALS),
            maxPortfolioNotional: toBaseUnits(10, SOL_DECIMALS),
        },
        capsUsdc: {
            maxCollateralPerPosition: toBaseUnits(200, USDC_DECIMALS),
            maxNotionalPerPosition: toBaseUnits(600, USDC_DECIMALS),
            maxPortfolioNotional: toBaseUnits(2000, USDC_DECIMALS),
        },
        marketAllowlist: null,
        marketDenylist: [],
        allowedCollateralMints: [USDC_MINT, WSOL_MINT],
        allowAccountCreation: false,
    };
}
export function applyPerpsPolicyOverrides(base, o) {
    return {
        perpsEnabled: o.perpsEnabled ?? base.perpsEnabled,
        windDownOnly: o.windDownOnly ?? base.windDownOnly,
        maxLeverage: o.maxLeverage ?? base.maxLeverage,
        minLiquidationDistanceBps: o.minLiquidationDistanceBps ?? base.minLiquidationDistanceBps,
        maxFundingRateBpsPerHour: o.maxFundingRateBpsPerHour ?? base.maxFundingRateBpsPerHour,
        maxAdverseFundingBpsPerHour: o.maxAdverseFundingBpsPerHour ?? base.maxAdverseFundingBpsPerHour,
        maxSlippageBps: o.maxSlippageBps ?? base.maxSlippageBps,
        maxOracleDivergenceBps: o.maxOracleDivergenceBps ?? base.maxOracleDivergenceBps,
        liquidationToleranceBps: o.liquidationToleranceBps ?? base.liquidationToleranceBps,
        maxOpenPositions: o.maxOpenPositions ?? base.maxOpenPositions,
        capsSol: {
            maxCollateralPerPosition: o.solCollateralPerPosition != null
                ? toBaseUnits(o.solCollateralPerPosition, SOL_DECIMALS)
                : base.capsSol.maxCollateralPerPosition,
            maxNotionalPerPosition: o.solNotionalPerPosition != null
                ? toBaseUnits(o.solNotionalPerPosition, SOL_DECIMALS)
                : base.capsSol.maxNotionalPerPosition,
            maxPortfolioNotional: o.solPortfolioNotional != null
                ? toBaseUnits(o.solPortfolioNotional, SOL_DECIMALS)
                : base.capsSol.maxPortfolioNotional,
        },
        capsUsdc: {
            maxCollateralPerPosition: o.usdcCollateralPerPosition != null
                ? toBaseUnits(o.usdcCollateralPerPosition, USDC_DECIMALS)
                : base.capsUsdc.maxCollateralPerPosition,
            maxNotionalPerPosition: o.usdcNotionalPerPosition != null
                ? toBaseUnits(o.usdcNotionalPerPosition, USDC_DECIMALS)
                : base.capsUsdc.maxNotionalPerPosition,
            maxPortfolioNotional: o.usdcPortfolioNotional != null
                ? toBaseUnits(o.usdcPortfolioNotional, USDC_DECIMALS)
                : base.capsUsdc.maxPortfolioNotional,
        },
        marketAllowlist: o.marketAllowlist !== undefined
            ? o.marketAllowlist
            : base.marketAllowlist,
        marketDenylist: o.marketDenylist ?? base.marketDenylist,
        allowedCollateralMints: o.allowedCollateralMints ?? base.allowedCollateralMints,
        allowAccountCreation: o.allowAccountCreation ?? base.allowAccountCreation,
    };
}
/**
 * Leverage as integer basis points, so notional maths stays in bigint and never
 * touches a float. Rejects anything non-finite or non-positive.
 */
export function leverageToBps(leverage) {
    if (!Number.isFinite(leverage) || leverage <= 0)
        return undefined;
    const bps = Math.round(leverage * 10_000);
    return bps > 0 ? bps : undefined;
}
/**
 * Notional in the INPUT LEG's base units: collateral × leverage, in integer maths.
 * This is the number every notional cap compares against. No oracle, no float.
 */
export function notionalFromCollateral(collateralBaseUnits, leverage) {
    const bps = leverageToBps(leverage);
    if (bps === undefined)
        return undefined;
    if (collateralBaseUnits < 0n)
        return undefined;
    return (collateralBaseUnits * BigInt(bps)) / 10000n;
}
