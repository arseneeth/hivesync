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
type WakuRelayMod = typeof import('@waku/relay');
type WakuUtilsMod = typeof import('@waku/utils');
let sdkPromise: Promise<WakuSdk> | null = null;
let relayModPromise: Promise<WakuRelayMod> | null = null;
let utilsModPromise: Promise<WakuUtilsMod> | null = null;

function loadSdk(): Promise<WakuSdk> {
  if (!sdkPromise) {
    sdkPromise = (new Function('return import("@waku/sdk")')() as Promise<WakuSdk>);
  }
  return sdkPromise;
}

function loadRelayMod(): Promise<WakuRelayMod> {
  if (!relayModPromise) {
    relayModPromise = (new Function('return import("@waku/relay")')() as Promise<WakuRelayMod>);
  }
  return relayModPromise;
}

function loadUtilsMod(): Promise<WakuUtilsMod> {
  if (!utilsModPromise) {
    utilsModPromise = (new Function('return import("@waku/utils")')() as Promise<WakuUtilsMod>);
  }
  return utilsModPromise;
}

export type RawMessageHandler = (payload: Uint8Array) => void;

/**
 * Thin wrapper over a Waku light node: connect, publish bytes to the configured
 * content topic, and subscribe to receive bytes. All HiveSync-level concerns
 * (framing, identity, encryption, routing) live above this layer.
 */
export class WakuTransport implements Transport {
  private node: WakuNodeLike | null = null;
  private encoder: any = null;
  private decoder: any = null;
  private readonly config: WakuConfig;
  private handler: RawMessageHandler | null = null;
  private started = false;
  private storePollTimer: NodeJS.Timeout | null = null;
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
    const sdk = await loadSdk();
    const relayMod = await loadRelayMod();
    const utilsMod = await loadUtilsMod();
    const { waitForRemotePeer, Protocols } = sdk;
    const { createRelayNode } = relayMod;
    const { createRoutingInfo } = utilsMod;

    const networkConfig = {
      clusterId: this.config.clusterId,
      numShardsInCluster: this.config.numShardsInCluster,
    };

    const useDefaultBootstrap = !this.config.bootstrapNodes || this.config.bootstrapNodes.length === 0;

    // Build routing info from network config + content topic.
    // This determines the pubsub topic (shard) our node subscribes to.
    const routingInfo = createRoutingInfo(networkConfig as any, {
      contentTopic: this.config.contentTopic,
    });

    // Use createRelayNode (full node with gossipsub) instead of createLightNode.
    // Relay gives us a mesh network for both sending AND receiving,
    // bypassing the broken LightPush/Filter peers on the testnet.
    this.node = await createRelayNode({
      defaultBootstrap: useDefaultBootstrap,
      bootstrapPeers: useDefaultBootstrap ? undefined : this.config.bootstrapNodes,
      networkConfig,
      routingInfos: [routingInfo],
    } as any);

    await this.node.start();

    // Wait for Relay peers (gossipsub mesh). Also wait for Filter/LightPush
    // as secondary, but don't block if only Relay peers are available.
    await waitForRemotePeer(this.node, [Protocols.Relay], peerWaitTimeoutMs).catch(() => {
      logger.warn('Timed out waiting for Relay peers — will continue anyway');
    });

    // The node derives the pubsub topic/shard from its networkConfig + content topic.
    this.encoder = this.node.createEncoder({ contentTopic: this.config.contentTopic });
    this.decoder = this.node.createDecoder({ contentTopic: this.config.contentTopic });

    this.started = true;
    logger.info(`Waku transport connected (peerId ${this.node.peerId.toString()})`);
    logger.info(`Relay enabled: ${!!this.node.relay}, Filter: ${!!this.node.filter}, LightPush: ${!!this.node.lightPush}, Store: ${!!this.node.store}`);
  }

  async subscribe(handler: RawMessageHandler): Promise<void> {
    if (!this.decoder) {
      throw new Error('Waku transport not started');
    }
    this.handler = handler;

    // Primary: Relay (gossipsub) subscribe — most reliable on the testnet.
    if (this.node?.relay) {
      try {
        await this.node.relay.subscribeWithUnsubscribe([this.decoder], (msg: DecodedMessage) => {
          if (msg.payload && this.handler) {
            this.handler(msg.payload);
          }
        });
        logger.info(`Relay subscribed to ${this.config.contentTopic}`);
      } catch (err) {
        logger.warn(`Relay subscribe error: ${(err as Error).message}`);
      }
    }

    // Secondary: Filter subscribe (if available on light/relay hybrid nodes).
    let filterPeers = 0;
    if (this.node?.filter) {
      try {
        const result = await this.node.filter.subscribe(this.decoder, (msg: DecodedMessage) => {
          if (msg.payload && this.handler) {
            this.handler(msg.payload);
          }
        });

        if (result.error) {
          logger.warn(`Waku filter subscribe failed: ${result.error}`);
        }
        const failures = result.results?.failures?.length ?? 0;
        const successes = result.results?.successes?.length ?? 0;
        filterPeers = successes;
        if (successes === 0 && failures > 0) {
          logger.warn('Waku filter subscribe: no peer accepted the subscription');
        } else if (successes > 0) {
          logger.info(`Filter subscribed to ${this.config.contentTopic} (${successes} peer(s))`);
        }
      } catch (err) {
        logger.warn(`Filter subscribe error: ${(err as Error).message}`);
      }
    }

    // Tertiary: Store polling as a last-resort fallback for message retrieval.
    if (!this.node?.relay && filterPeers === 0) {
      this.startStorePolling();
      logger.info('No Relay or Filter — relying on Store polling for message retrieval');
    } else if (this.node?.store) {
      // Even with Relay, use Store polling to catch messages missed during reconnects.
      this.startStorePolling();
    }
  }

  /**
   * Poll the Waku Store protocol every 5 seconds for messages on our content
   * topic that we may have missed (e.g. when Filter subscribe has 0 peers).
   */
  private startStorePolling(): void {
    if (this.storePollTimer) return;
    this.lastStoreQueryTime = new Date();
    this.storePollTimer = setInterval(() => void this.pollStore(), 5000);
    this.storePollTimer.unref?.();
    logger.info('Started Store polling fallback for message retrieval');
  }

  private async pollStore(): Promise<void> {
    if (this.storePolling || !this.node?.store || !this.decoder || !this.handler) return;
    this.storePolling = true;
    try {
      const queryOpts: any = { pageSize: 50 };
      if (this.lastStoreQueryTime) {
        queryOpts.startTime = this.lastStoreQueryTime;
      }
      let receivedAny = false;
      await this.node.store.queryWithOrderedCallback(
        [this.decoder],
        (msg: DecodedMessage) => {
          if (msg.payload && this.handler) {
            receivedAny = true;
            this.handler(msg.payload);
          }
        },
        queryOpts
      );
      if (receivedAny) {
        logger.info('Store polling retrieved messages');
      }
    } catch (error) {
      logger.warn(`Store polling error: ${(error as Error).message}`);
    } finally {
      this.lastStoreQueryTime = new Date();
      this.storePolling = false;
    }
  }

  /**
   * Publish bytes to the configured content topic.
   * Primary: Relay (gossipsub) broadcast — messages go to all mesh peers.
   * Fallback: LightPush if Relay is not available or fails.
   */
  async publish(payload: Uint8Array, retries = 5): Promise<void> {
    if (!this.encoder) {
      throw new Error('Waku transport not started');
    }

    // Primary: Relay broadcast — most reliable on the testnet.
    if (this.node?.relay) {
      try {
        await this.node.relay.send(this.encoder, { payload });
        return;
      } catch (relayError) {
        logger.warn(`Relay send failed: ${(relayError as Error).message}, falling back to LightPush`);
      }
    }

    // Fallback: LightPush with retries.
    if (!this.node?.lightPush) {
      logger.warn('No Relay or LightPush available — message could not be sent');
      return;
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

    // Don't crash — failures are a Waku network condition, not fatal.
    logger.warn(`LightPush failed after ${retries} attempts (agent can still receive): ${lastFailures}`);
  }

  async getPeerCount(): Promise<number> {
    if (!this.node) return 0;
    try {
      const peers = await this.node.getConnectedPeers();
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
