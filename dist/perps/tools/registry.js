/*
 * Portions of this file are derived from Aetheria (https://github.com/venymlabs/aetheria),
 * Copyright Venym Labs, licensed under the Apache License, Version 2.0.
 * See NOTICE and licenses/APACHE-2.0.txt. Modified for RetifyOS.
 * SPDX-License-Identifier: Apache-2.0
 */
import { makePerpsAdjustTool } from "./perps-adjust.js";
import { makePerpsCloseTool } from "./perps-close.js";
import { makePerpsMarketsTool } from "./perps-markets.js";
import { makePerpsOpenTool } from "./perps-open.js";
import { makePerpsPositionsTool } from "./perps-positions.js";
/**
 * Build the perps toolset over a venue.
 *
 * A factory rather than a module-level constant because the tools need a venue
 * and a live policy getter, and `ToolContext` — which is per-invocation state —
 * carries neither. See `tools/deps.ts` for why that split is the right one.
 */
export function createPerpsTools(deps) {
    const reads = [
        makePerpsMarketsTool(deps),
        makePerpsPositionsTool(deps),
    ];
    const proposals = [
        makePerpsOpenTool(deps),
        makePerpsCloseTool(deps),
        makePerpsAdjustTool(deps),
    ];
    const all = [...reads, ...proposals];
    return {
        all,
        reads,
        proposals,
        get: (name) => all.find((t) => t.name === name),
    };
}
export const PERPS_TOOL_NAMES = [
    "perps_markets",
    "perps_positions",
    "perps_open",
    "perps_close",
    "perps_adjust",
];
