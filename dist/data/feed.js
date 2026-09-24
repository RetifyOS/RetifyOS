/*
 * Portions of this file are derived from Aetheria (https://github.com/venymlabs/aetheria),
 * Copyright Venym Labs, licensed under the Apache License, Version 2.0.
 * See NOTICE and licenses/APACHE-2.0.txt. Modified for RetifyOS: NEW in this
 * repo — Aetheria wired the tape, the watcher and the engine together inside
 * its engine package, which RetifyOS does not have. This is that wiring, given a
 * lifecycle the composition root can own.
 * SPDX-License-Identifier: Apache-2.0
 */
import { PumpPortalWatcher } from "./pumpportal.js";
import { SignalsEngine } from "./signals-engine.js";
import { TradeTape } from "./tape.js";
export class SignalsFeed {
    #tape;
    #engine;
    #watcher;
    #maxAutoFollow;
    /** Auto-followed launches, oldest-first. Explicit watches are not in here. */
    #autoFollowed = [];
    #pinned = new Set();
    #started = false;
    constructor(options = {}) {
        this.#tape = new TradeTape(options.maxPerMint ?? 500);
        this.#engine = new SignalsEngine(this.#tape);
        this.#maxAutoFollow = Math.max(0, options.maxAutoFollow ?? 64);
        this.#watcher = new PumpPortalWatcher({
            ...options.watcher,
            onTrade: (t) => this.#tape.addTrade(t),
            onNewToken: (mint) => this.#autoFollow(mint),
        });
    }
    /** The `RugHeatSource` to mount on the pools tools. Always present. */
    get engine() {
        return this.#engine;
    }
    get tape() {
        return this.#tape;
    }
    /** True while the socket is open — the console's "connected" light. */
    get connected() {
        return this.#watcher.connected;
    }
    get started() {
        return this.#started;
    }
    /** Open the feed. Idempotent. */
    start() {
        if (this.#started)
            return;
        this.#started = true;
        this.#watcher.start();
    }
    /** Close the feed. The engine keeps answering off whatever the tape holds. */
    stop() {
        if (!this.#started)
            return;
        this.#started = false;
        this.#watcher.stop();
    }
    /**
     * Follow a specific mint for as long as the feed runs. Pinned: never evicted
     * by the auto-follow budget, because a mint someone is about to trade matters
     * more than the newest launch.
     */
    watch(mint) {
        if (this.#pinned.has(mint))
            return;
        this.#pinned.add(mint);
        this.#watcher.subscribeTokenTrade(mint);
    }
    /** Mints currently subscribed on the socket. */
    watching() {
        return this.#watcher.subscriptions();
    }
    #autoFollow(mint) {
        if (this.#maxAutoFollow === 0)
            return;
        if (this.#pinned.has(mint) || this.#autoFollowed.includes(mint))
            return;
        this.#autoFollowed.push(mint);
        this.#watcher.subscribeTokenTrade(mint);
        while (this.#autoFollowed.length > this.#maxAutoFollow) {
            const evicted = this.#autoFollowed.shift();
            if (evicted !== undefined && !this.#pinned.has(evicted)) {
                this.#watcher.unsubscribeTokenTrade(evicted);
            }
        }
    }
}
