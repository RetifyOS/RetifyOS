#!/usr/bin/env node
import type { Capability } from "../agent/types.js";
/**
 * Stdio entry point: point an MCP client at this binary and it exposes RetifyOS's
 * read-side tools.
 *
 * **Read-only by default, and not by accident.** The granted capability set
 * below is market data, risk analysis, simulation and portfolio reads —
 * everything that answers a question and nothing that moves value. An MCP
 * client is an IDE talking to a process over a pipe; it is not the operator
 * console, it has no session, no scope check and no approvals path, so it does
 * not get `ORDER_WRITE` or `POSITION_WRITE`. Widening this is a deliberate
 * edit to this file by whoever runs the daemon, not a flag a client can pass.
 *
 * Custody is likewise not mounted here: `createApplication` is called with no
 * wallet, so the venue toolsets are not registered at all.
 *
 * Every diagnostic goes to stderr — stdout is the JSON-RPC channel.
 */
export declare const MCP_CAPABILITIES: readonly Capability[];
export declare function main(): Promise<number>;
