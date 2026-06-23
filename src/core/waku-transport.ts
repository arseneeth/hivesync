import { WakuConfig } from '../types';
import { Transport } from './transport';
import { logger } from '../utils/logger';

// `@waku/sdk` is ESM-only and its type exports don't resolve cleanly under the
// CommonJS build. Since the module is loaded dynamically at runtime, we keep the
// node/encoder/decoder loosely typed here rather than coupling to its d.ts.
type WakuNodeLike = any;
type DecodedMessage = { payload?: Uint8Array };

/**
 * `@waku/sdk` is shipped as ESM-only. This project compiles to CommonJS, so a
 * top-level `import`/`require` of it fails at runtime. We load it lazily with a
 * dynamic `import()`, which works from CJS, and cache the module.
 */
type WakuSdk = typeof import('@waku/sdk');
let sdkPromise: Promise<WakuSdk> | null = null;
function loadSdk(): Promise<WakuSdk> {
  if (!sdkPromise) {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    sdkPromise = new Function('return import("@waku/sdk")')() as Promise<WakuSdk>;
  }
  return sdkPromise;
}

export type RawMessageHandler = (payload: Uint8Array) => void;

/**
 * Thin wrapper over a Waku **light node**: connect, publish bytes to the
 * configured content topic, and subscribe to receive bytes.
 *
 * WHY A LIGHT NODE (and not a Relay node):
 * HiveSync agents run on VPSs behind NAT / cloud proxies and are NOT reachable
 * from the outside. A Relay node has to graft itself into the GossipSub mesh,
 * which (a) needs inbound reachability to be useful and (b) fragments into
 * disjoint meshes when only 2-3 of our own nodes are involved. That is the
 * "messages never arrive" failure we hit.
 *
 * A light node instead dials *out* to the public Waku Network's service nodes
 * and uses request/response protocols over those outbound streams:
 *   - LightPush (send): a service node publishes our message into the mesh.
 *   - Filter   (recv): a service node pushes matching messages back to us.
 *   - Store    (recv): poll a service node for anything Filter missed.
 * All three work through outbound connections, so NAT is a non-issue and the
 * well-connected fleet provides the mesh backbone. This is the model Waku
 * designed for resource-restricted / non-reachable nodes, and the one the
 * original HiveSync prototype used successfully.
 *
 * All HiveSync-level concerns (framing, identity, encryption, routing) live
 * above this layer.
 */
export class WakuTransport implements Transport {
  private node: WakuNodeLike | null = null;
  private encoder: any = null;
  private decoder: any = null;
  private readonly config: WakuConfig;
  private handler: RawMessageHandler | null = null;
  private started = false;
  private storePollTimer: NodeJS.Timeout | null = null;
  private filterHealthTimer: NodeJS.Timeout | null = null;
  private lastStoreQueryTime: Date | null = null;
  private storePolling = false;

  constructor(config: WakuConfig) {
    this.config = config;
  }

  isStarted(): boolean {
    return this.started;
  }

  pubsubTopic(): string | undefined {
    return (this.decoder as any)?.pubsubTopic;
  }

  async start(peerWaitTimeoutMs = 30000): Promise<void> {
    // The SDK logs the REAL LightPush failure reason (e.g. "v3 status code 505:
    // No relay peers available") only through its `debug` logger, and our
    // publish() otherwise sees a bare "Remote peer rejected". Set
    // HIVESYNC_WAKU_DEBUG=1 to surface those lines — invaluable for diagnosing
    // why sending fails on a given host. Must be enabled before the SDK loads.
    if (process.env.HIVESYNC_WAKU_DEBUG && !process.env.DEBUG) {
      process.env.DEBUG = 'waku:*light-push*,waku:*sdk:light-push*,waku:*peer-manager*';
    }
    const sdk = await loadSdk();
    const { createLightNode, waitForRemotePeer, Protocols } = sdk;

    const networkConfig = {
      clusterId: this.config.clusterId,
      numShardsInCluster: this.config.numShardsInCluster,
    };

    const useDefaultBootstrap =
      !this.config.bootstrapNodes || this.config.bootstrapNodes.length === 0;

    // A light node connects OUT to the public fleet; it does not need to listen
    // for inbound dials. defaultBootstrap discovers The Waku Network service
    // nodes via DNS discovery + the static bootstrap list.
    //
    // numPeersToUse: the SDK defaults to 1 — every LightPush goes to a SINGLE
    // service node. If that node can't relay our shard (status 505 NO_PEERS) or
    // its stream is reset (common from NAT'd / proxied VPSs), the whole publish
    // fails. Fanning out to several peers in parallel means the message is sent
    // as long as ANY one of them accepts it — the single most effective fix for
    // "LightPush delivered to 0 peers" on the public fleet.
    // numPeersToUse is honored at runtime (WakuNode -> PeerManager) but is not
    // in the SDK's CreateNodeOptions d.ts, hence the cast.
    this.node = await createLightNode({
      defaultBootstrap: useDefaultBootstrap,
      bootstrapPeers: useDefaultBootstrap ? undefined : this.config.bootstrapNodes,
      networkConfig,
      numPeersToUse: this.config.lightPushPeers ?? 3,
    } as any);

    await this.node.start();

    // Wait for peers that speak the protocols we actually use. We don't hard
    // fail if only some are available — a partial set (e.g. Filter but not yet
    // LightPush) is still useful, and the bridge resends until delivery.
    await waitForRemotePeer(
      this.node,
      [Protocols.LightPush, Protocols.Filter, Protocols.Store],
      peerWaitTimeoutMs
    ).catch(() => {
      logger.warn('Timed out waiting for Waku peers — continuing, will retry on use');
    });

    // The node derives the pubsub topic/shard from its networkConfig + content topic.
    this.encoder = this.node.createEncoder({ contentTopic: this.config.contentTopic });
    this.decoder = this.node.createDecoder({ contentTopic: this.config.contentTopic });

    this.started = true;
    logger.info(`Waku light node connected (peerId ${this.node.peerId.toString()})`);
    logger.info(
      `Protocols — LightPush: ${!!this.node.lightPush}, Filter: ${!!this.node.filter}, Store: ${!!this.node.store}`
    );
  }

  async subscribe(handler: RawMessageHandler): Promise<void> {
    if (!this.node?.filter || !this.decoder) {
      throw new Error('Waku transport not started');
    }
    this.handler = handler;

    // Primary RECEIVE path: Filter. A service node subscribes to the mesh on
    // our behalf and pushes matching messages down our outbound stream.
    await this.filterSubscribe();

    // Safety net: poll Store for anything Filter dropped (subscriptions can be
    // evicted by the service node, especially across reconnects). Cheap and
    // de-duplicated upstream by message id in the bridge.
    if (this.node?.store) {
      this.startStorePolling();
    }

    // Filter subscriptions are not forever — periodically re-subscribe so a
    // silently-dropped subscription self-heals without a restart.
    this.startFilterHealth();
  }

  /** (Re)establish the Filter subscription. Safe to call repeatedly. */
  private async filterSubscribe(): Promise<number> {
    if (!this.node?.filter || !this.decoder || !this.handler) return 0;
    try {
      const result = await this.node.filter.subscribe(this.decoder, (msg: DecodedMessage) => {
        if (msg.payload && msg.payload.length > 0 && this.handler) {
          this.handler(msg.payload);
        }
      });

      if (result?.error) {
        logger.warn(`Waku filter subscribe failed: ${result.error}`);
        return 0;
      }
      const successes = result?.results?.successes?.length ?? 0;
      const failures = result?.results?.failures?.length ?? 0;
      if (successes > 0) {
        logger.info(`Filter subscribed to ${this.config.contentTopic} (${successes} peer(s))`);
      } else if (failures > 0) {
        logger.warn('Filter subscribe: no peer accepted the subscription (Store fallback active)');
      }
      return successes;
    } catch (err) {
      logger.warn(`Filter subscribe error: ${(err as Error).message}`);
      return 0;
    }
  }

  private startFilterHealth(): void {
    if (this.filterHealthTimer) return;
    // Re-subscribe every 20s. js-waku de-dupes identical subscriptions, so this
    // is a no-op when healthy and a recovery when the subscription was dropped.
    this.filterHealthTimer = setInterval(() => void this.filterSubscribe(), 20000);
    this.filterHealthTimer.unref?.();
  }

  /**
   * Poll the Waku Store protocol every 5 seconds for messages on our content
   * topic since the last query — a backstop for whatever Filter misses.
   */
  private startStorePolling(): void {
    if (this.storePollTimer) return;
    this.lastStoreQueryTime = new Date();
    this.storePollTimer = setInterval(() => void this.pollStore(), 5000);
    this.storePollTimer.unref?.();
    logger.info('Started Store polling backstop for message retrieval');
  }

  private async pollStore(): Promise<void> {
    if (this.storePolling || !this.node?.store || !this.decoder || !this.handler) return;
    this.storePolling = true;
    const queryStart = new Date();
    try {
      const queryOpts: any = { paginationLimit: 50, paginationForward: true };
      if (this.lastStoreQueryTime) {
        queryOpts.timeStart = this.lastStoreQueryTime;
      }
      await this.node.store.queryWithOrderedCallback(
        [this.decoder],
        (msg: DecodedMessage) => {
          if (msg.payload && msg.payload.length > 0 && this.handler) {
            this.handler(msg.payload);
          }
        },
        queryOpts
      );
      // Advance the window only after a successful query so a failed poll
      // doesn't create a gap.
      this.lastStoreQueryTime = queryStart;
    } catch (error) {
      logger.warn(`Store polling error: ${(error as Error).message}`);
    } finally {
      this.storePolling = false;
    }
  }

  /**
   * Publish bytes via LightPush. The public fleet has peers that reject pushes
   * (e.g. RLN rate limiting), so a partial success (>=1 peer) counts as sent;
   * we only retry/back off when every peer rejects.
   */
  async publish(payload: Uint8Array, retries = 5): Promise<void> {
    if (!this.node?.lightPush || !this.encoder) {
      throw new Error('Waku transport not started');
    }

    let lastFailures = 'unknown error';
    for (let attempt = 1; attempt <= retries; attempt++) {
      let result: any;
      try {
        result = await this.node.lightPush.send(this.encoder, { payload });
      } catch (error) {
        lastFailures = (error as Error).message;
        result = { successes: [] };
      }
      if ((result.successes?.length ?? 0) > 0) {
        return;
      }
      if (result.failures?.length) lastFailures = JSON.stringify(result.failures);
      logger.warn(`LightPush attempt ${attempt}/${retries} delivered to 0 peers: ${lastFailures}`);
      if (attempt < retries) {
        await delay(1500 * attempt);
      }
    }

    // Don't crash — push failures are a transient network condition, not fatal.
    // The bridge resends, and the peer can still reach us via Filter/Store.
    logger.warn(`LightPush failed after ${retries} attempts (will be retried): ${lastFailures}`);
  }

  async getPeerCount(): Promise<number> {
    if (!this.node) return 0;
    try {
      const peers = await this.node.libp2p.getPeers();
      return peers.length;
    } catch {
      return 0;
    }
  }

  peerId(): string | undefined {
    return this.node?.peerId.toString();
  }

  async stop(): Promise<void> {
    if (this.storePollTimer) {
      clearInterval(this.storePollTimer);
      this.storePollTimer = null;
    }
    if (this.filterHealthTimer) {
      clearInterval(this.filterHealthTimer);
      this.filterHealthTimer = null;
    }
    if (this.node) {
      try {
        await this.node.stop();
      } catch (error) {
        logger.warn('Error stopping Waku node:', error);
      }
      this.node = null;
    }
    this.encoder = null;
    this.decoder = null;
    this.handler = null;
    this.started = false;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
