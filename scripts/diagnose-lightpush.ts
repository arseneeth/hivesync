/**
 * LightPush diagnostic — run this ON THE HOST where sending fails (the VPS).
 *
 * "LightPush delivered to 0 peers / Remote peer rejected" can mean very
 * different things, and the SDK hides the real reason (a v3 status code) behind
 * its debug logger. This script connects exactly like the daemon, enables that
 * logger, enumerates the peers we actually have, and attempts real LightPush
 * sends — then prints a plain-English verdict so you stop guessing.
 *
 * Usage (on the VPS):
 *   HIVESYNC_WAKU_DEBUG=1 node -r ts-node/register/transpile-only \
 *     scripts/diagnose-lightpush.ts [contentTopic] [clusterId] [numShards]
 *   # custom bootstrap (your own node): HIVESYNC_BOOTSTRAP=/dns4/.../tcp/443/wss/p2p/16U...
 *
 * Read the v3 status code it prints:
 *   505 NO_PEERS         -> the service node has no relay peers on our shard.
 *                           Fan out to more peers / run your own node.
 *   504 NO_RLN_PROOF     -> the network requires RLN membership to publish.
 *   429 TOO_MANY_REQUESTS-> rate limited (RLN). Back off / get a membership.
 *   421 UNSUPPORTED_TOPIC-> shard/cluster mismatch with the service node.
 *   (stream reset / no response, 0 lightpush peers) -> connectivity/NAT/proxy.
 */
const contentTopic = process.argv[2] || '/hivesync/1/agents/proto';
const clusterId = Number(process.argv[3] || 1);
const numShardsInCluster = Number(process.argv[4] || 8);
const bootstrap = process.env.HIVESYNC_BOOTSTRAP
  ? process.env.HIVESYNC_BOOTSTRAP.split(',').map((s) => s.trim()).filter(Boolean)
  : [];

// Surface the SDK's internal light-push logging (where the v3 status code lives).
if (!process.env.DEBUG) {
  process.env.DEBUG = 'waku:*light-push*,waku:*sdk:light-push*,waku:*peer-manager*';
}

// @waku/sdk is ESM-only; dodge ts-node's CJS transpilation of dynamic import.
const loadSdk = () => new Function('return import("@waku/sdk")')() as Promise<any>;

function log(...a: unknown[]): void {
  // eslint-disable-next-line no-console
  console.log(...a);
}

async function main(): Promise<void> {
  const sdk = await loadSdk();
  const { createLightNode, waitForRemotePeer, Protocols } = sdk;
  const networkConfig = { clusterId, numShardsInCluster };
  const useDefault = bootstrap.length === 0;

  log(`\n=== HiveSync LightPush diagnostic ===`);
  log(`contentTopic=${contentTopic} cluster=${clusterId} shards=${numShardsInCluster}`);
  log(`bootstrap=${useDefault ? 'DEFAULT (sandbox+test fleet)' : bootstrap.join(', ')}\n`);

  const node = await createLightNode({
    defaultBootstrap: useDefault,
    bootstrapPeers: useDefault ? undefined : bootstrap,
    networkConfig,
    numPeersToUse: 5,
  });
  await node.start();
  log(`our peerId: ${node.peerId.toString()}`);

  await waitForRemotePeer(node, [Protocols.LightPush, Protocols.Filter, Protocols.Store], 40000).catch(
    () => log('! timed out waiting for peers (continuing)')
  );

  const encoder = node.createEncoder({ contentTopic });
  const pubsubTopic = encoder.pubsubTopic;
  log(`our shard / pubsubTopic: ${pubsubTopic}\n`);

  // Enumerate peers and what protocols they advertise.
  const conns = node.libp2p.getConnections();
  // Unique remotePeer objects (keyed by string id).
  const uniquePeers = new Map<string, any>();
  for (const c of conns) uniquePeers.set(c.remotePeer.toString(), c.remotePeer);
  log(`connected peers: ${uniquePeers.size}`);
  let lpV3 = 0;
  let lpV2 = 0;
  let filter = 0;
  let store = 0;
  const peerStore = node.libp2p.peerStore;
  for (const peerId of uniquePeers.values()) {
    try {
      const peer = await peerStore.get(peerId);
      const protos: string[] = peer.protocols || [];
      if (protos.some((p) => p.includes('lightpush/3'))) lpV3++;
      if (protos.some((p) => p.includes('lightpush/2'))) lpV2++;
      if (protos.some((p) => p.includes('filter'))) filter++;
      if (protos.some((p) => p.includes('store'))) store++;
    } catch {
      /* ignore peer we can't read */
    }
  }
  log(`  advertising lightpush v3: ${lpV3}`);
  log(`  advertising lightpush v2: ${lpV2}`);
  log(`  advertising filter:       ${filter}`);
  log(`  advertising store:        ${store}`);

  // Attempt real LightPush sends. Watch the DEBUG lines for the v3 status code.
  log(`\n--- attempting 3 LightPush sends (watch for "v3 status code") ---`);
  for (let i = 1; i <= 3; i++) {
    const payload = new TextEncoder().encode(JSON.stringify({ diag: i, t: contentTopic }));
    let res: any;
    try {
      res = await node.lightPush.send(encoder, { payload });
    } catch (e) {
      res = { successes: [], failures: [{ error: (e as Error).message }] };
    }
    const ok = res.successes?.length ?? 0;
    const fail = res.failures?.length ?? 0;
    log(`send ${i}: successes=${ok} failures=${fail} ${fail ? JSON.stringify(res.failures) : ''}`);
    await new Promise((r) => setTimeout(r, 2000));
  }

  log(`\n=== VERDICT ===`);
  if (lpV3 + lpV2 === 0) {
    log('No connected peer advertises LightPush. Discovery/connectivity problem,');
    log('or this fleet does not offer LightPush servers — point at a node that does.');
  } else {
    log('LightPush peers ARE present. If sends still fail, the v3 status code above');
    log('tells you why (505=node has no relay peers on our shard, 504/429=RLN,');
    log('421=shard mismatch). A node-side "no relay peers" / stream reset means the');
    log('public fleet is unreliable for publishing from this host — run your own node.');
  }

  await node.stop();
  process.exit(0);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('diagnostic error:', e);
  process.exit(1);
});
