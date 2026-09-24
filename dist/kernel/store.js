/*
 * Portions of this file are derived from Aetheria (https://github.com/venymlabs/aetheria),
 * Copyright Venym Labs, licensed under the Apache License, Version 2.0.
 * See NOTICE and licenses/APACHE-2.0.txt.
 *
 * Modified for RetifyOS: the storage driver is `node:sqlite`'s `DatabaseSync`
 * (the house primitive used by every other RetifyOS store) instead of
 * better-sqlite3, and the reserve transaction is expressed with an explicit
 * BEGIN IMMEDIATE / COMMIT / ROLLBACK block rather than better-sqlite3's
 * `db.transaction()` helper. The schema, the cap semantics, and the
 * single-writer guarantee are unchanged.
 * SPDX-License-Identifier: Apache-2.0
 */
import { DatabaseSync } from "node:sqlite";
import { newReservationId } from "./ids.js";
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
/**
 * The kernel's single-writer store. `node:sqlite` is synchronous, so the reserve
 * transaction is atomic within this process; combined with the engine's
 * boot-time {@link ProcessLock} (one writer per home dir, enforced — see
 * `src/kernel/lock.ts`) this gives race-free reserve-then-settle. The lock is
 * what makes the cross-process half of that guarantee real rather than assumed:
 * without it, a second engine on the same DB could pass the cap check before the
 * first reservation row is visible.
 */
export class KernelStore {
    #db;
    #closed = false;
    constructor(dbPath = ":memory:") {
        this.#db = new DatabaseSync(dbPath);
        this.#db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;");
        this.#migrate();
    }
    #migrate() {
        this.#db.exec(`
      CREATE TABLE IF NOT EXISTS trades (
        id TEXT PRIMARY KEY,
        idempotency_key TEXT UNIQUE NOT NULL,
        state TEXT NOT NULL,
        intent_json TEXT NOT NULL,
        signature TEXT,
        input_mint TEXT NOT NULL,
        output_mint TEXT NOT NULL,
        input_amount TEXT NOT NULL,
        last_valid_block_height INTEGER NOT NULL,
        signed_wire TEXT,
        error TEXT,
        reservation_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS spends (
        id TEXT PRIMARY KEY,
        trade_id TEXT NOT NULL,
        bucket TEXT NOT NULL,
        amount TEXT NOT NULL,
        state TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_spends_window ON spends (bucket, state, created_at);
      CREATE TABLE IF NOT EXISTS idempotency (
        key TEXT PRIMARY KEY,
        trade_id TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS journal (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        trade_id TEXT,
        type TEXT NOT NULL,
        payload TEXT NOT NULL,
        at INTEGER NOT NULL
      );
    `);
    }
    /**
     * Run `fn` inside a BEGIN IMMEDIATE transaction. `node:sqlite` is synchronous
     * and `fn` must be too — that is precisely what makes the read-then-insert in
     * {@link reserve} indivisible against other in-process callers.
     */
    #transaction(fn) {
        this.#db.exec("BEGIN IMMEDIATE");
        try {
            const value = fn();
            this.#db.exec("COMMIT");
            return value;
        }
        catch (err) {
            this.#db.exec("ROLLBACK");
            throw err;
        }
    }
    #sumActive(bucket, since) {
        const rows = this.#db
            .prepare("SELECT amount FROM spends WHERE bucket = ? AND state IN ('reserved','consumed') AND created_at >= ?")
            .all(bucket, since);
        let sum = 0n;
        for (const row of rows)
            sum += BigInt(row.amount);
        return sum;
    }
    /** Cumulative active spend in the rolling hour and day windows for a bucket. */
    usage(bucket, now) {
        return {
            hour: this.#sumActive(bucket, now - HOUR_MS),
            day: this.#sumActive(bucket, now - DAY_MS),
        };
    }
    /** Claim an idempotency key. Returns false if it was already used (a duplicate). */
    claimIdempotency(key, tradeId, now) {
        const info = this.#db
            .prepare("INSERT OR IGNORE INTO idempotency (key, trade_id, created_at) VALUES (?, ?, ?)")
            .run(key, tradeId, now);
        return Number(info.changes) > 0;
    }
    getTradeByIdempotency(key) {
        return this.#db
            .prepare("SELECT * FROM trades WHERE idempotency_key = ?")
            .get(key);
    }
    getTrade(id) {
        return this.#db.prepare("SELECT * FROM trades WHERE id = ?").get(id);
    }
    /**
     * Reserve against the input-leg cap. The window sums and the insert happen in
     * one transaction so two concurrent intents cannot both observe the same
     * pre-reservation usage and jointly exceed the cap.
     */
    reserve(args) {
        return this.#transaction(() => {
            const usedHour = this.#sumActive(args.bucket, args.now - HOUR_MS);
            const usedDay = this.#sumActive(args.bucket, args.now - DAY_MS);
            if (args.amount > args.caps.perTrade) {
                return {
                    ok: false,
                    reason: "perTrade",
                    cap: args.caps.perTrade,
                    would: args.amount,
                };
            }
            if (usedHour + args.amount > args.caps.perHour) {
                return {
                    ok: false,
                    reason: "perHour",
                    cap: args.caps.perHour,
                    would: usedHour + args.amount,
                };
            }
            if (usedDay + args.amount > args.caps.perDay) {
                return {
                    ok: false,
                    reason: "perDay",
                    cap: args.caps.perDay,
                    would: usedDay + args.amount,
                };
            }
            const reservationId = newReservationId();
            this.#db
                .prepare("INSERT INTO spends (id, trade_id, bucket, amount, state, created_at) VALUES (?, ?, ?, ?, ?, ?)")
                .run(reservationId, args.tradeId, args.bucket, args.amount.toString(), "reserved", args.now);
            return { ok: true, reservationId, usedHour, usedDay };
        });
    }
    releaseReservation(reservationId) {
        this.#db
            .prepare("UPDATE spends SET state = 'released' WHERE id = ? AND state = 'reserved'")
            .run(reservationId);
    }
    consumeReservation(reservationId) {
        this.#db
            .prepare("UPDATE spends SET state = 'consumed' WHERE id = ?")
            .run(reservationId);
    }
    insertTrade(row, reservationId) {
        this.#db
            .prepare(`INSERT INTO trades
          (id, idempotency_key, state, intent_json, input_mint, output_mint, input_amount,
           last_valid_block_height, reservation_id, created_at, updated_at)
         VALUES (?, ?, 'reserved', ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(row.id, row.idempotencyKey, row.intentJson, row.inputMint, row.outputMint, row.inputAmount.toString(), row.lastValidBlockHeight, reservationId, row.now, row.now);
    }
    /** Persist the fully-signed wire tx BEFORE broadcast (so a crash can be reconciled, never re-signed). */
    persistSigned(id, signedWire, signature, now) {
        this.#db
            .prepare("UPDATE trades SET signed_wire = ?, signature = ?, updated_at = ? WHERE id = ?")
            .run(signedWire, signature, now, id);
    }
    setState(id, state, now) {
        this.#db
            .prepare("UPDATE trades SET state = ?, updated_at = ? WHERE id = ?")
            .run(state, now, id);
    }
    setSignature(id, signature, now) {
        this.#db
            .prepare("UPDATE trades SET signature = ?, updated_at = ? WHERE id = ?")
            .run(signature, now, id);
    }
    fail(id, state, error, now) {
        this.#db
            .prepare("UPDATE trades SET state = ?, error = ?, updated_at = ? WHERE id = ?")
            .run(state, error, now, id);
    }
    /** Trades that were broadcast but never reached a terminal state — the reconciler's work list. */
    pendingSent() {
        return this.#db
            .prepare("SELECT * FROM trades WHERE state = 'sent'")
            .all();
    }
    /** The most recent trades, newest-first — for the agent's "what did I trade" read tool. */
    recentTrades(limit = 10) {
        return this.#db
            .prepare("SELECT * FROM trades ORDER BY created_at DESC LIMIT ?")
            .all(Math.max(1, Math.min(100, Math.floor(limit))));
    }
    appendJournal(event) {
        this.#db
            .prepare("INSERT INTO journal (trade_id, type, payload, at) VALUES (?, ?, ?, ?)")
            .run(event.tradeId, event.type, JSON.stringify(event), event.at);
    }
    /**
     * The newest journal rows across every trade, newest-first.
     *
     * {@link readJournal} answers "what happened to THIS trade"; the operator
     * console needs "what has the kernel been doing", which is the same table
     * read the other way round. `seq` comes back with the event because it is the
     * only stable, total ordering the journal has — `at` can collide.
     */
    recentJournal(limit = 200) {
        const rows = this.#db
            .prepare("SELECT seq, payload FROM journal ORDER BY seq DESC LIMIT ?")
            .all(Math.max(1, Math.min(1000, Math.floor(limit))));
        return rows.map((r) => ({
            seq: Number(r.seq),
            event: JSON.parse(r.payload),
        }));
    }
    readJournal(tradeId) {
        const rows = this.#db
            .prepare("SELECT payload FROM journal WHERE trade_id = ? ORDER BY seq ASC")
            .all(tradeId);
        return rows.map((r) => JSON.parse(r.payload));
    }
    close() {
        if (this.#closed)
            return;
        this.#db.close();
        this.#closed = true;
    }
}
