import { Secret } from "../kernel/secret.js";
/**
 * The Solana cluster each network name selects.
 *
 * `testnet` maps to `devnet` because that is the cluster operators actually
 * rehearse on — Solana's own `testnet` is a validator-release cluster, not a
 * staging network. The cluster is derived, never configured: an operator who
 * could name the cluster independently of `NETWORK` could point a `mainnet`
 * process at devnet, or the reverse.
 */
export declare const CLUSTER_FOR_NETWORK: {
    readonly mainnet: "mainnet-beta";
    readonly testnet: "devnet";
};
export type Cluster = (typeof CLUSTER_FOR_NETWORK)[keyof typeof CLUSTER_FOR_NETWORK];
/** What RetifyOS needs to know about one OpenAI-compatible LLM endpoint. */
export interface LlmProviderProfile {
    /** Default OpenAI-compatible base URL. `LLM_BASE_URL` overrides it. */
    readonly baseUrl: string;
    /**
     * The endpoint runs on the operator's own machine or LAN.
     *
     * This is a security classification, not a label. A local endpoint may be
     * reached over plain HTTP and may hold no API key at all — which is the point
     * of self-hosting: the model reasoning over your positions never leaves your
     * network, so there is no credential to protect in transit and no vendor to
     * present one to. A hosted endpoint is the opposite on both counts, and
     * {@link loadConfig} refuses one that is missing either.
     */
    readonly local: boolean;
    /**
     * Non-OpenAI request-body fields this provider understands, merged into every
     * chat completion. See {@link LLM_PROVIDERS}.
     */
    readonly extraBody?: Readonly<Record<string, unknown>>;
}
/**
 * The OpenAI-compatible LLM endpoints this process knows how to address.
 *
 * `extraBody` is the per-provider request-body hook, and it is the reason this
 * is a table rather than a switch. llama.cpp-backed local servers accept knobs
 * that are not in the OpenAI schema: Lemonade takes
 * `chat_template_kwargs.enable_thinking = false`, which suppresses a reasoning
 * model's thinking trace — roughly a 4x output-token saving on tool-routing
 * steps, and often the difference between fitting a small context window and
 * overflowing it. Adding a provider is adding a row here; nothing in
 * `src/agent/models/` learns any provider's name, and the transport merges
 * these fields UNDER the canonical OpenAI ones, so no row can redefine `model`,
 * `messages`, `tools` or `stream`.
 *
 * The default `baseUrl` of a local provider is only a convenience for the
 * single-machine case, and is the port the reference deployment happened to
 * listen on rather than a protocol constant. A server on another box — the
 * usual arrangement, since the GPU is rarely the laptop — is named explicitly
 * with `LLM_BASE_URL`, which overrides the default for every provider.
 */
export declare const LLM_PROVIDERS: {
    readonly openai: {
        readonly baseUrl: "https://api.openai.com/v1";
        readonly local: false;
    };
    readonly openrouter: {
        readonly baseUrl: "https://openrouter.ai/api/v1";
        readonly local: false;
    };
    readonly groq: {
        readonly baseUrl: "https://api.groq.com/openai/v1";
        readonly local: false;
    };
    readonly together: {
        readonly baseUrl: "https://api.together.xyz/v1";
        readonly local: false;
    };
    readonly xai: {
        readonly baseUrl: "https://api.x.ai/v1";
        readonly local: false;
    };
    readonly deepseek: {
        readonly baseUrl: "https://api.deepseek.com/v1";
        readonly local: false;
    };
    readonly lemonade: {
        readonly baseUrl: "http://localhost:13305/api/v1";
        readonly local: true;
        readonly extraBody: {
            readonly chat_template_kwargs: {
                readonly enable_thinking: false;
            };
        };
    };
    readonly ollama: {
        readonly baseUrl: "http://localhost:11434/v1";
        readonly local: true;
    };
    readonly "llama-cpp": {
        readonly baseUrl: "http://localhost:8080/v1";
        readonly local: true;
    };
};
export type LlmProvider = keyof typeof LLM_PROVIDERS;
export interface TradingConfig {
    /** The signing wallet: a base58 Ed25519 public key. */
    account: string;
    signerSocketPath?: string;
    signerTokenPath?: string;
    signerPolicyPath?: string;
    maxAmountIn: bigint;
    /** Tradeable assets, as base58 mints. */
    allowedTokens: string[];
    maxSlippageBps: number;
    reconcileIntervalMs: number;
    liveEnabled: boolean;
    approvalOperators?: {
        id: string;
        keyId: string;
        keyPath: string;
    }[];
    approvalOperatorConfigVersion?: string;
    authorizationKeyId?: string;
    authorizationKeyPath?: string;
}
/**
 * A resolved LLM endpoint: where the planner runs and what it may spend.
 *
 * The token and cost figures are the ones `ModelRouter` already understands —
 * they become the single {@link import("../agent/models/index.js").ModelCandidate}
 * the composition root routes through. For a self-hosted server the costs are
 * genuinely zero, which is why they default to 0 rather than to a guess.
 */
export interface LlmConfig {
    provider: LlmProvider;
    /** True for a provider whose endpoint is the operator's own machine or LAN. */
    local: boolean;
    /** OpenAI-compatible base URL, without a trailing slash. */
    baseUrl: string;
    model: string;
    /**
     * Absent for a keyless local server, which is the supported case rather than
     * a degraded one. Wrapped so it cannot reach a log, a JSON body or an
     * inspector: the only way out is `.reveal()` at the point of use.
     */
    apiKey?: Secret;
    contextWindow: number;
    maxOutputTokens: number;
    inputCostPerMillion: number;
    outputCostPerMillion: number;
    /** Provider-specific request body fields. See {@link LLM_PROVIDERS}. */
    extraBody?: Readonly<Record<string, unknown>>;
}
export interface AppConfig {
    mode: "development" | "test" | "production";
    network: "testnet" | "mainnet";
    execution: "read-only" | "dry-run" | "live";
    host: string;
    port: number;
    logLevel: string;
    shutdownTimeoutMs: number;
    dataDir: string;
    auth: {
        bearerToken?: string;
        bearerTokenSha256?: string;
        tenantId: string;
        scopes: string[];
    };
    rpc?: {
        url: string;
        cluster: Cluster;
    };
    /** The planner endpoint. Absent means no model is configured at all. */
    llm?: LlmConfig;
    trading?: TradingConfig;
    marketProviderUrls: string[];
    paths: {
        sessions: string;
        runs: string;
        jobs: string;
        events: string;
        triggers: string;
        memory: string;
        skills: string;
        logs: string;
        audit: string;
        executions: string;
        approvals: string;
        reservations: string;
    };
}
export declare function loadConfig(env?: Record<string, string | undefined>, _cwd?: string, requirements?: {
    requireRpc?: boolean;
}): AppConfig;
export declare function sanitizedConfig(c: AppConfig): {
    trading?: {
        account: string;
        liveEnabled: boolean;
        maxAmountIn: string;
        allowedTokens: string[];
        maxSlippageBps: number;
    };
    llm?: {
        provider: "openai" | "openrouter" | "groq" | "together" | "xai" | "deepseek" | "lemonade" | "ollama" | "llama-cpp";
        model: string;
        baseUrlHost: string;
        local: boolean;
        apiKeyConfigured: boolean;
        contextWindow: number;
        maxOutputTokens: number;
        extraBodyFields: string[];
    };
    mode: "development" | "test" | "production";
    network: "mainnet" | "testnet";
    execution: "read-only" | "dry-run" | "live";
    host: string;
    port: number;
    dataDir: string;
    logLevel: string;
    rpcConfigured: boolean;
    cluster: Cluster | null;
    marketProvidersConfigured: number;
};
