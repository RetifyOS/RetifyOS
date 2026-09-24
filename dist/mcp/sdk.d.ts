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
export declare const MCP_SDK_PACKAGE = "@modelcontextprotocol/sdk";
/** What the SDK calls a zod schema for a request type. Opaque to us. */
export type RequestSchema = unknown;
/** The subset of the SDK's low-level `Server` this module drives. */
export interface McpServer {
    setRequestHandler(schema: RequestSchema, handler: (request: McpRequest) => unknown | Promise<unknown>): void;
    connect(transport: unknown): Promise<void>;
    close?(): Promise<void>;
}
export interface McpRequest {
    readonly params?: {
        readonly name?: unknown;
        readonly arguments?: unknown;
    };
}
/** One entry of a `tools/list` response. */
export interface McpToolDescriptor {
    readonly name: string;
    readonly description: string;
    readonly inputSchema: {
        readonly type: "object";
        readonly properties: Record<string, unknown>;
        readonly required?: readonly string[];
    };
}
export interface McpToolResult {
    readonly content: readonly {
        readonly type: "text";
        readonly text: string;
    }[];
    readonly isError?: boolean;
}
/** The pieces of the SDK the server needs, once resolved. */
export interface McpModule {
    readonly createServer: (info: {
        name: string;
        version: string;
    }, options: {
        capabilities: {
            tools: Record<string, unknown>;
        };
    }) => McpServer;
    readonly listToolsSchema: RequestSchema;
    readonly callToolSchema: RequestSchema;
}
export declare class McpSdkMissingError extends Error {
    readonly code = "MCP_SDK_MISSING";
    constructor(cause?: unknown);
}
/**
 * Resolve the SDK's server class and the two request schemas.
 *
 * The specifiers are held in variables so the TypeScript compiler does not try
 * to resolve an absent optional dependency at build time — the same trick the
 * Drift and Meteora loaders use.
 */
export declare function loadMcpModule(): Promise<McpModule>;
/** Resolve the stdio transport. Separate import so `createMcpServer` needs no transport. */
export declare function loadStdioTransport(): Promise<unknown>;
