/*
 * Portions of this file are derived from Aetheria (https://github.com/venymlabs/aetheria),
 * Copyright Venym Labs, licensed under the Apache License, Version 2.0.
 * See NOTICE and licenses/APACHE-2.0.txt. Modified for RetifyOS.
 * SPDX-License-Identifier: Apache-2.0
 */
export { oppositeSide } from "./types.js";
// ── errors ──
export { isPerpGuardError, kernelCodeFor, PERP_GUARD_CODES, PerpGuardError, PerpsVenueError, } from "./errors.js";
// ── liquidation maths ──
export { isUsablePrice, liquidationDistanceBps, maxLeverageForDistance, modelLiquidationPrice, oracleDivergenceBps, reconcileLiquidation, } from "./liquidation.js";
// ── policy ──
export { applyPerpsPolicyOverrides, capsFor, defaultPerpsPolicy, leverageToBps, notionalFromCollateral, } from "./policy.js";
// ── exposure ──
export { emptyExposure, exposureFrom, positionIn, staleExposure, } from "./exposure.js";
// ── intents ──
export { assertPerpIntentShape, asTradeIntent, buildPerpIntent, isOpeningKind, isReducingKind, PERP_INTENT_KINDS, summarizePerpIntent, } from "./intent.js";
// ── guards ──
export { evaluatePerpGuards, PERP_RULES, perpGuards, positionLiquidationDistanceBps, } from "./guards.js";
// ── Drift adapter ──
export { DriftVenue, readOnlyWallet } from "./drift/drift-venue.js";
export { DRIFT_SETTLEMENT_MINT, DRIFT_VENUE_ID, driftMarketStatus, fundingBpsPerHour, marginRatioToFraction, maxLeverageFromInitialMargin, notionalQuoteUnits, toPerpMarket, } from "./drift/convert.js";
// ── tools ──
export { createPerpsTools, PERPS_TOOL_NAMES } from "./tools/registry.js";
export { makePerpsMarketsTool } from "./tools/perps-markets.js";
export { makePerpsPositionsTool } from "./tools/perps-positions.js";
export { makePerpsOpenTool } from "./tools/perps-open.js";
export { makePerpsCloseTool } from "./tools/perps-close.js";
export { makePerpsAdjustTool } from "./tools/perps-adjust.js";
// ── kernel settle adapter ──
export { positionReaderFor, positionReaderOver } from "./settle.js";
// ── testing helpers (network-free) ──
export { fakeFunding, fakeMarket, FakePerpsVenue, fakePosition, fakePrices, usdc, } from "./testing/fake-venue.js";
