import type { BalanceReader, Broadcaster, Clock, Confirmer, ExecuteOptions, ExecuteResult, LandMode, MintInspector, PolicyConfig, PositionReader, Simulator, TradeGateway, TradeIntent, WalletProvider } from "./contracts.js";
import type { KernelStore } from "./store.js";
export interface TradeGatewayDeps {
    readonly store: KernelStore;
    readonly wallet: WalletProvider;
    /** A getter so the gateway always reads the CURRENT policy (e.g. after arming). */
    readonly policy: () => PolicyConfig;
    readonly mints: MintInspector;
    readonly balances: BalanceReader;
    readonly simulator: Simulator;
    readonly broadcasters: Readonly<Record<LandMode, Broadcaster>>;
    readonly confirmer: Confirmer;
    readonly clock: Clock;
    /**
     * Required only to execute perp kinds — a perp fill is verified against the
     * venue position, not a token balance. Leaving it unmounted does not make
     * perps unchecked, it makes them impossible: the gateway refuses a perp
     * intent it cannot verify, before broadcast.
     */
    readonly positions?: PositionReader;
}
/**
 * The single deterministic money path. Re-validates every intent from scratch,
 * reserves the input-leg cap atomically, persists the signed tx before
 * broadcast, and releases the reservation on every non-confirmed terminal state.
 * Non-throwing: failures come back as ExecuteResult.error.
 *
 * The wallet seam is a {@link WalletProvider}; RetifyOS satisfies it either with
 * the in-process keystore-backed wallet or with the isolated signer daemon, so
 * key custody stays outside this module either way.
 */
export declare class TradeGatewayImpl implements TradeGateway {
    #private;
    constructor(deps: TradeGatewayDeps);
    execute(intent: TradeIntent, opts: ExecuteOptions): Promise<ExecuteResult>;
}
