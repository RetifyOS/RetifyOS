/*
 * Portions of this file are derived from Aetheria (https://github.com/venymlabs/aetheria),
 * Copyright Venym Labs, licensed under the Apache License, Version 2.0.
 * See NOTICE and licenses/APACHE-2.0.txt. Modified for RetifyOS.
 * SPDX-License-Identifier: Apache-2.0
 */
export class TradeTape {
    /** Newest-last per-mint ring buffers. */
    #byMint = new Map();
    #maxPerMint;
    constructor(maxPerMint = 500) {
        this.#maxPerMint = Math.max(1, Math.floor(maxPerMint));
    }
    /** Append a trade, evicting the oldest once a mint's buffer is over cap. */
    addTrade(t) {
        let buf = this.#byMint.get(t.mint);
        if (!buf) {
            buf = [];
            this.#byMint.set(t.mint, buf);
        }
        buf.push(t);
        // Drop from the front (oldest) until back under the cap.
        while (buf.length > this.#maxPerMint)
            buf.shift();
    }
    /** A copy of the current tape for a mint, oldest-first. Empty when unseen. */
    trades(mint) {
        const buf = this.#byMint.get(mint);
        return buf ? buf.slice() : [];
    }
    /** Mints currently tracked on the tape. */
    mints() {
        return [...this.#byMint.keys()];
    }
    /** Total trades held across every mint — the feed's liveness proxy. */
    size() {
        let n = 0;
        for (const buf of this.#byMint.values())
            n += buf.length;
        return n;
    }
    /**
     * Pure signal roll-up over the trailing `windowMs`. Trades with `ts` older
     * than the window are ignored; `lastPriceSol` reflects the most recent
     * in-window trade that carried a price.
     */
    signals(mint, windowMs = 300_000) {
        const buf = this.#byMint.get(mint);
        const cutoff = Date.now() - Math.max(0, windowMs);
        let buys = 0;
        let sells = 0;
        let buyVol = 0;
        let sellVol = 0;
        let largestTradeSol = 0;
        const buyers = new Set();
        const sellers = new Set();
        let lastPriceSol;
        let lastTs = -Infinity;
        let firstPriceSol;
        let firstTs = Infinity;
        if (buf) {
            for (const t of buf) {
                if (t.ts < cutoff)
                    continue;
                if (t.isBuy) {
                    buys += 1;
                    buyVol += t.solAmount;
                    if (t.trader)
                        buyers.add(t.trader);
                }
                else {
                    sells += 1;
                    sellVol += t.solAmount;
                    if (t.trader)
                        sellers.add(t.trader);
                }
                if (t.solAmount > largestTradeSol)
                    largestTradeSol = t.solAmount;
                if (t.priceSol !== undefined) {
                    // Newest in-window price (buffer is newest-last, but guard ts anyway).
                    if (t.ts >= lastTs) {
                        lastTs = t.ts;
                        lastPriceSol = t.priceSol;
                    }
                    // Earliest in-window price, for the window's price change.
                    if (t.ts <= firstTs) {
                        firstTs = t.ts;
                        firstPriceSol = t.priceSol;
                    }
                }
            }
        }
        const trades = buys + sells;
        const buyPressurePct = trades > 0 ? (buys / trades) * 100 : 0;
        const volume = buyVol + sellVol;
        const volumeWeightedBuyPressurePct = volume > 0 ? (buyVol / volume) * 100 : 0;
        const priceChangePct = firstPriceSol !== undefined &&
            lastPriceSol !== undefined &&
            firstPriceSol > 0 &&
            firstTs < lastTs
            ? ((lastPriceSol - firstPriceSol) / firstPriceSol) * 100
            : undefined;
        return {
            mint,
            buys,
            sells,
            netSolFlow: buyVol - sellVol,
            volumeSol: volume,
            uniqueBuyers: buyers.size,
            uniqueSellers: sellers.size,
            buyPressurePct,
            volumeWeightedBuyPressurePct,
            largestTradeSol,
            priceChangePct,
            lastPriceSol,
            trades,
        };
    }
}
