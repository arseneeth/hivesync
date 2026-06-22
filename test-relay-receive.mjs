import { createRelayNode } from '@waku/relay';
import { createRoutingInfo } from '@waku/utils';

const contentTopic = '/hivesync/1/agents/proto';
const networkConfig = { clusterId: 1, numShardsInCluster: 8 };

const routingInfo = createRoutingInfo(networkConfig, { contentTopic });
console.log('Routing info:', JSON.stringify(routingInfo, (k,v) => typeof v === 'bigint' ? v.toString() : v));
console.log('Pubsub topic:', routingInfo?.pubsubTopic || 'unknown');

const node = await createRelayNode({
  defaultBootstrap: true,
  networkConfig,
  routingInfos: [routingInfo],
});

await node.start();
console.log('Node started, peerId:', node.peerId.toString());
console.log('Relay pubsub topics:', Array.from(node.relay.pubsubTopics || []));

const decoder = node.createDecoder({ contentTopic });
console.log('Decoder pubsubTopic:', decoder.pubsubTopic);

await node.relay.subscribeWithUnsubscribe([decoder], (msg) => {
  console.log('*** RELAY MESSAGE RECEIVED ***');
  console.log('Payload length:', msg.payload?.length);
  console.log('Content topic:', msg.contentTopic);
  try {
    const text = new TextDecoder().decode(msg.payload);
    console.log('Content:', text.substring(0, 200));
  } catch(e) {
    console.log('Could not decode:', e.message);
  }
});

console.log('Subscribed. Waiting for messages...');
console.log('Mesh peers:', node.relay.getMeshPeers(decoder.pubsubTopic)?.length || 0);

// Check mesh peers every 10 seconds
let elapsed = 0;
const interval = setInterval(() => {
  elapsed += 10;
  const peers = node.relay.getMeshPeers(decoder.pubsubTopic)?.length || 0;
  console.log(`[${elapsed}s] Mesh peers: ${peers}`);
  if (elapsed >= 60) {
    clearInterval(interval);
    console.log('Done.');
    node.stop().then(() => process.exit(0));
  }
}, 10000);
