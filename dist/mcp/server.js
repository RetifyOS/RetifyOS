/*
 * Portions of this file are derived from Aetheria (https://github.com/venymlabs/aetheria),
 * Copyright Venym Labs, licensed under the Apache License, Version 2.0.
 * See NOTICE and licenses/APACHE-2.0.txt. Modified for RetifyOS: the tool set is
 * RetifyOS's `ToolRegistry` (which already owns validation, capability checks,
 * timeouts and the audit trail) rather than Aetheria's `AnyTool[]`, so the
 * handler delegates to `registry.invoke()` instead of re-validating and calling
 * `tool.execute()` itself. Aetheria's hand-rolled zod→JSON-Schema shim is NOT
 * ported: RetifyOS already depends on `zod-to-json-schema`, and the registry's
 * `schemas()` emits the JSON Schema this advertises.
 * SPDX-License-Identifier: Apache-2.0
 */
import { loadMcpModule, } from "./sdk.js";
export const MCP_SERVER_NAME = "RetifyOS";
/** The default sink. stderr, deliberately: stdout belongs to the protocol. */
const stderrLog = (message) => {
    console.error(message);
};
function textResult(text, isError = false) {
    return { content: [{ type: "text", text }], isError };
}
/** Render a registry result as the text an MCP client shows. */
function renderResult(result) {
    if (!result.ok) {
        const detail = result.error.details === undefined
            ? ""
            : ` ${safeJson(result.error.details)}`;
        return textResult(`${result.tool} failed: ${result.error.code} — ${result.error.message}${detail}`, true);
    }
    return textResult(safeJson(result.data));
}
function safeJson(value) {
    try {
        return (JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2) ?? String(value));
    }
    catch {
        return String(value);
    }
}
/**
 * The tool descriptors this server advertises, without needing the SDK.
 *
 * Exported so the catalogue can be inspected — and tested — with the optional
 * peer dependency absent, which is how CI runs.
 */
export function mcpToolDescriptors(options) {
    const filter = {
        ...(options.toolset ? { toolset: options.toolset } : {}),
        capabilities: options.capabilities ?? [],
    };
    return options.registry.schemas(filter).map((schema) => {
        const input = schema.inputSchema;
        const properties = input.properties ?? {};
        const required = input.required ?? [];
        return {
            name: schema.name,
            description: schema.description,
            inputSchema: required.length > 0
                ? { type: "object", properties, required }
                : { type: "object", properties },
        };
    });
}
/**
 * Build an MCP server that advertises RetifyOS's tool registry.
 *
 * `tools/list` returns each eligible tool's name, description and JSON Schema;
 * `tools/call` hands the arguments to `registry.invoke()`, which validates the
 * input against the tool's own zod schema, checks capabilities, enforces the
 * timeout and emits the audit event. Nothing is re-implemented here, so the MCP
 * surface cannot drift from what the agent itself is allowed to do — and, for
 * anything that moves value, `ctx.gateway.execute()` is still the only route.
 *
 * The handler never throws on a tool failure: it returns `isError: true`
 * content so the IDE can render it and the session survives.
 */
export async function createMcpServer(options) {
    const log = options.log ?? stderrLog;
    const capabilities = options.capabilities ?? [];
    const sdk = await loadMcpModule();
    const server = sdk.createServer({ name: MCP_SERVER_NAME, version: options.version ?? "0.1.0" }, { capabilities: { tools: {} } });
    server.setRequestHandler(sdk.listToolsSchema, () => {
        const tools = mcpToolDescriptors(options);
        log(`[RetifyOS mcp] tools/list → ${tools.length} tool(s)`);
        return { tools };
    });
    server.setRequestHandler(sdk.callToolSchema, async (request) => {
        const name = request.params?.name;
        if (typeof name !== "string" || !name) {
            return textResult("tools/call is missing a tool name", true);
        }
        // stderr. A `console.log` here would inject a line into the JSON-RPC
        // stream and desynchronise the client.
        log(`[RetifyOS mcp] tools/call ${name}`);
        try {
            const result = await options.registry.invoke(name, request.params?.arguments ?? {}, { capabilities });
            return renderResult(result);
        }
        catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            log(`[RetifyOS mcp] tools/call ${name} threw: ${message}`);
            return textResult(`'${name}' failed: ${message}`, true);
        }
    });
    return server;
}
