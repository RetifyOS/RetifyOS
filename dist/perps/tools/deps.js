/*
 * Portions of this file are derived from Aetheria (https://github.com/venymlabs/aetheria),
 * Copyright Venym Labs, licensed under the Apache License, Version 2.0.
 * See NOTICE and licenses/APACHE-2.0.txt. Modified for RetifyOS.
 * SPDX-License-Identifier: Apache-2.0
 */
import { exposureFrom, positionIn, staleExposure, } from "../exposure.js";
export const DEFAULT_PERPS_PRIORITY_FEE_LAMPORTS = 200_000;
export const DEFAULT_SLIPPAGE_BPS = 50;
export function accountRef(deps, ctx) {
    return { owner: ctx.ownerWallet, subAccountId: deps.subAccountId?.() ?? 0 };
}
export function priorityFee(deps) {
    return deps.priorityFeeLamports?.() ?? DEFAULT_PERPS_PRIORITY_FEE_LAMPORTS;
}
/**
 * Read everything the guards need, in one place, with EVERY failure mapped to a
 * fail-closed snapshot: an unreadable venue yields a stale exposure and an
 * uninitialised account, both of which the guards refuse to open into.
 */
export async function readSnapshot(deps, account) {
    let positions = [];
    let exposure;
    try {
        positions = await deps.venue.getPositions(account);
        exposure = exposureFrom(positions);
    }
    catch (err) {
        exposure = staleExposure(`could not read positions: ${err instanceof Error ? err.message : String(err)}`);
    }
    let accountInitialized;
    try {
        accountInitialized = (await deps.venue.getAccountStatus(account))
            .initialized;
    }
    catch {
        accountInitialized = false;
    }
    return { positions, exposure, accountInitialized };
}
export function guardContext(deps, snapshot, market, dryRun) {
    return {
        policy: deps.policy(),
        killSwitch: deps.killSwitch(),
        executionEnabled: deps.executionEnabled(),
        exposure: snapshot.exposure,
        position: positionIn(snapshot.positions, market),
        accountInitialized: snapshot.accountInitialized,
        dryRun,
    };
}
export function errMsg(err) {
    return err instanceof Error ? err.message : String(err);
}
