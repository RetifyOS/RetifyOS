import type { ToolRegistry } from "../agent/tools/registry.js";
import type { Capability } from "../agent/types.js";
import { type McpServer, type McpToolDescriptor } from "./sdk.js";
export declare const MCP_SERVER_NAME = "RetifyOS";
export interface McpServerOptions {
    readonly registry: ToolRegistry;
    /**
     * The capability set every `tools/call` runs under.
     *
     * This is the authority boundary of the whole surface and it is set by the
     * COMPOSITION ROOT, never by the MCP client. An IDE connecting over stdio
     * gets exactly what the operator started the process with — it cannot ask for
     * more, and there is no request field it could ask with. Omit it and the
     * server exposes nothing, because a tool whose capabilities are not all
     * granted is neither listed nor invocable.
     */
    readonly capabilities?: readonly Capability[];
    /** Restrict to a named toolset. Omitted, every registered tool is eligible. */
    readonly toolset?: string;
    readonly version?: string;
    /**
     * Diagnostics sink. Defaults to `console.error` — **stderr, never stdout**,
     * because stdout is the JSON-RPC channel and a single stray `console.log`
     * corrupts the protocol stream.
     */
    readonly log?: (message: string) => void;
}
/**
 * The tool descriptors this server advertises, without needing the SDK.
 *
 * Exported so the catalogue can be inspected — and tested — with the optional
 * peer dependency absent, which is how CI runs.
 */
export declare function mcpToolDescriptors(options: Pick<McpServerOptions, "registry" | "capabilities" | "toolset">): McpToolDescriptor[];
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
export declare function createMcpServer(options: McpServerOptions): Promise<McpServer>;
