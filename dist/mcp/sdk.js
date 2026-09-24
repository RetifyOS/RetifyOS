/*
 * Portions of this file are derived from Aetheria (https://github.com/venymlabs/aetheria),
 * Copyright Venym Labs, licensed under the Apache License, Version 2.0.
 * See NOTICE and licenses/APACHE-2.0.txt. Modified for RetifyOS: Aetheria imported
 * `@modelcontextprotocol/sdk` statically, as a hard dependency. RetifyOS declares
 * it an OPTIONAL PEER dependency and loads it lazily behind these structural
 * types, so it stays out of the lockfile and out of `npm audit --omit=dev`.
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Structural types for the lazily-imported `@modelcontextprotocol/sdk`.
 *
 * Same reasoning, and the same trade-off, as `src/perps/drift/sdk-types.ts` and
 * `src/pools/meteora/sdk-port.ts`. The SDK is a peer dependency marked optional
 * and is never imported statically, because:
 *
 *   · RetifyOS's production dependency set is deliberately small and sits under a
 *     CI gate that runs `npm audit --omit=dev`. An IDE-integration transport is
 *     not something a headless trading daemon should be forced to install, let
 *     alone audit.
 *   · `src/mcp` typechecks, lints and tests with the SDK absent.
 *   · Nothing outside this directory ever sees an MCP type.
 *
 * Stated plainly: these declarations are written against the SDK's documented
 * 1.x low-level `Server` surface and have NOT been verified against an
 * installed build. Every value crossing the boundary is therefore treated
 * defensively — an unexpected shape becomes an `isError` tool result, never a
 * thrown exception that would take the transport down mid-session.
 */
export const MCP_SDK_PACKAGE = "@modelcontextprotocol/sdk";
export class McpSdkMissingError extends Error {
    code = "MCP_SDK_MISSING";
    constructor(cause) {
        super(`${MCP_SDK_PACKAGE} is not installed. Run "npm install ${MCP_SDK_PACKAGE}" ` +
            "to expose RetifyOS's tools over MCP — it is an OPTIONAL peer dependency, " +
            "deliberately kept out of the production install so it adds no audit " +
            "surface to a deployment that does not use it." +
            (cause
                ? ` (${cause instanceof Error ? cause.message : String(cause)})`
                : ""));
        this.name = "McpSdkMissingError";
    }
}
/**
 * Resolve the SDK's server class and the two request schemas.
 *
 * The specifiers are held in variables so the TypeScript compiler does not try
 * to resolve an absent optional dependency at build time — the same trick the
 * Drift and Meteora loaders use.
 */
export async function loadMcpModule() {
    const serverEntry = `${MCP_SDK_PACKAGE}/server/index.js`;
    const typesEntry = `${MCP_SDK_PACKAGE}/types.js`;
    try {
        const server = (await import(serverEntry));
        const types = (await import(typesEntry));
        const Server = server.Server;
        if (typeof Server !== "function" ||
            !types.ListToolsRequestSchema ||
            !types.CallToolRequestSchema) {
            throw new Error("the installed SDK does not expose Server / ListToolsRequestSchema / CallToolRequestSchema");
        }
        return {
            createServer: (info, options) => new Server(info, options),
            listToolsSchema: types.ListToolsRequestSchema,
            callToolSchema: types.CallToolRequestSchema,
        };
    }
    catch (e) {
        if (e instanceof McpSdkMissingError)
            throw e;
        throw new McpSdkMissingError(e);
    }
}
/** Resolve the stdio transport. Separate import so `createMcpServer` needs no transport. */
export async function loadStdioTransport() {
    const stdioEntry = `${MCP_SDK_PACKAGE}/server/stdio.js`;
    try {
        const mod = (await import(stdioEntry));
        const Transport = mod.StdioServerTransport;
        if (typeof Transport !== "function") {
            throw new Error("the installed SDK does not expose StdioServerTransport");
        }
        return new Transport();
    }
    catch (e) {
        if (e instanceof McpSdkMissingError)
            throw e;
        throw new McpSdkMissingError(e);
    }
}
