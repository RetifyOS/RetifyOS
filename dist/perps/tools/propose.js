/*
 * Portions of this file are derived from Aetheria (https://github.com/venymlabs/aetheria),
 * Copyright Venym Labs, licensed under the Apache License, Version 2.0.
 * See NOTICE and licenses/APACHE-2.0.txt. Modified for RetifyOS.
 * SPDX-License-Identifier: Apache-2.0
 */
import { evaluatePerpGuards } from "../guards.js";
import { asTradeIntent } from "../intent.js";
import { errMsg, guardContext, } from "./deps.js";
export function proposalPreview(proposal) {
    const lines = renderProposal(proposal);
    return {
        summary: lines,
        quote: proposal.intent.quote,
        warnings: proposal.warnings,
        // Typed as TradeIntent for the shared contract; it is the full PerpIntent
        // object, `perp` leg included. Handing it to the kernel today yields
        // INVALID_INTENT, which is the correct fail-closed answer until the kernel
        // learns the perp kinds.
        intent: asTradeIntent(proposal.intent),
        data: proposal,
    };
}
export function proposalResult(proposal) {
    return {
        isError: !proposal.verdict.ok,
        text: renderProposal(proposal),
        data: proposal,
    };
}
export function renderProposal(proposal) {
    const lines = [proposal.intent.summary];
    if (proposal.warnings.length > 0) {
        lines.push("", ...proposal.warnings.map((w) => `! ${w}`));
    }
    if (!proposal.verdict.ok) {
        lines.push("", "REFUSED by the perps guards:");
        for (const v of proposal.verdict.violations)
            lines.push(`  ${v.code}: ${v.message}`);
    }
    else {
        lines.push("", "PROPOSAL ONLY — this tool never executes. The kernel re-validates before anything moves.");
    }
    return lines.join("\n");
}
export function makeProposal(deps, snapshot, intent, venueWarnings, dryRun) {
    const verdict = evaluatePerpGuards(intent, guardContext(deps, snapshot, intent.perp.market, dryRun));
    return {
        kind: "perp_proposal",
        intent,
        verdict,
        warnings: venueWarnings,
        executed: false,
    };
}
/**
 * Funding is fetched separately and is allowed to fail — but the failure is
 * carried as `undefined`, never as zero. `fundingSane` refuses an opening intent
 * with no reading, so a funding outage becomes a refusal rather than a blind
 * trade.
 */
export async function readFunding(deps, symbol) {
    try {
        return {
            funding: await deps.venue.getFundingRate(symbol),
            warning: undefined,
        };
    }
    catch (err) {
        return {
            funding: undefined,
            warning: `funding rate unavailable: ${errMsg(err)}`,
        };
    }
}
export function ctxUnused(_ctx) {
    /* the proposing tools need only ownerWallet, taken in accountRef */
}
