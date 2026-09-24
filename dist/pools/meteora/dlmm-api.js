/*
 * Portions of this file are derived from Aetheria (https://github.com/venymlabs/aetheria),
 * Copyright Venym Labs, licensed under the Apache License, Version 2.0.
 * See NOTICE and licenses/APACHE-2.0.txt. Modified for RetifyOS.
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Meteora's keyless public data API — pool discovery without an RPC bill.
 *
 * Base URL is `https://dlmm.datapi.meteora.ag` (the older `dlmm-api.meteora.ag`
 * host now 404s on every path). Two endpoints are used: `GET /pools` (paginated,
 * ~122k pools, sorted by TVL) and `GET /pools/{address}`.
 *
 * **Known limitation, stated rather than hidden:** the list endpoint accepts no
 * mint filter — every filter parameter that looks plausible (`search_term`,
 * `token_mints`, `include_token_mints`, `mint`, …) is silently ignored and the
 * unfiltered set comes back. So `listPools` fetches the deepest `maxPages` pages
 * and filters client-side, and reports how many pools it actually examined via
 * `scannedPools`. A pool for a small memecoin will fall outside that window; the
 * answer for those is `getPool(address)` with an address the caller already has,
 * which always works. Discovery by on-chain `getProgramAccounts` scan would be
 * exhaustive but needs a paid RPC, so it is deliberately not the default.
 */
const DEFAULT_BASE = "https://dlmm.datapi.meteora.ag";
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_MAX_PAGES = 5;
export class MeteoraDataApiError extends Error {
}
export class MeteoraDataApi {
    #base;
    #fetch;
    #maxPages;
    #pageSize;
    #timeoutMs;
    constructor(opts = {}) {
        this.#base = (opts.baseUrl ?? DEFAULT_BASE).replace(/\/+$/, "");
        this.#fetch = opts.fetchImpl ?? fetch;
        this.#maxPages = Math.max(1, opts.maxPages ?? DEFAULT_MAX_PAGES);
        this.#pageSize = Math.max(1, Math.min(200, opts.pageSize ?? DEFAULT_PAGE_SIZE));
        this.#timeoutMs = opts.timeoutMs ?? 12_000;
    }
    async #json(path) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.#timeoutMs);
        try {
            const res = await this.#fetch(`${this.#base}${path}`, {
                headers: { accept: "application/json" },
                signal: controller.signal,
            });
            if (!res.ok) {
                throw new MeteoraDataApiError(`Meteora data API ${res.status} for ${path}`);
            }
            return (await res.json());
        }
        finally {
            clearTimeout(timer);
        }
    }
    async getPool(address) {
        return this.#json(`/pools/${encodeURIComponent(address)}`);
    }
    /**
     * Deepest pools containing `mint` on either side. Scans at most
     * `maxPages × pageSize` pools ordered by TVL and filters locally — see the file
     * header for why. Blacklisted pools are dropped unconditionally.
     */
    async listPoolsForMint(mint, limit = 10) {
        const matched = [];
        let scanned = 0;
        let truncated = true;
        for (let page = 1; page <= this.#maxPages; page++) {
            const res = await this.#json(`/pools?page=${page}&page_size=${this.#pageSize}&sort_key=tvl&order_by=desc`);
            const rows = res.data ?? [];
            scanned += rows.length;
            for (const p of rows) {
                if (p.is_blacklisted)
                    continue;
                if (p.token_x?.address === mint || p.token_y?.address === mint)
                    matched.push(p);
            }
            if (matched.length >= limit)
                return {
                    pools: matched.slice(0, limit),
                    scannedPools: scanned,
                    truncated: true,
                };
            if (rows.length < this.#pageSize || page >= (res.pages ?? page)) {
                truncated = false;
                break;
            }
        }
        return { pools: matched.slice(0, limit), scannedPools: scanned, truncated };
    }
}
