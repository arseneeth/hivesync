// Raw gossipsub listener — logs ALL incoming pubsub messages regardless of topic
import { Protocols, waitForRemotePeer } from '@waku/sdk';
import { createRelayNode } from '@waku/relay';
import { createRoutingInfo } from '@waku/utils';
import { WakuMessage } from '@waku/proto';

const contentTopic = '/hivesync/1/agents/proto';
const networkConfig = { clusterId: 1, numShardsInCluster: 8 };

const routingInfo = createRoutingInfo(networkConfig, { contentTopic });

console.log('Creating relay node...');
const node = await createRelayNode({
  defaultBootstrap: true,
  networkConfig,
  routingInfos: [routingInfo],
});

await node.start();
console.log('Node started:', node.peerId.toString());

await waitForRemotePeer(node, [Protocols.Relay], 15000);

const gs = node.relay.gossipSub;
console.log('Subscribed topics:', gs.getTopics());
console.log('Mesh peers for /waku/2/rs/1/5:', node.relay.getMeshPeers('/waku/2/rs/1/5').length);

// Listen to ALL gossipsub messages
gs.addEventListener('gossipsub:message', async (event) => {
  const msg = event.detail.msg;
  console.log(`[${new Date().toISOString()}] GOSSIPSUB MESSAGE:`);
  console.log(`  topic: ${msg.topic}`);
  console.log(`  from: ${event.detail.from?.toString()?.substring(0, 20) ?? 'unknown'}`);
  console.log(`  data length: ${msg.data?.length ?? 0}`);
  try {
    const proto = WakuMessage.decode(msg.data);
    console.log(`  contentTopic: ${proto.contentTopic}`);
    console.log(`  payload length: ${proto.payload?.length ?? 0}`);
    if (proto.payload && proto.payload.length < 500) {
      const decoded = new TextDecoder().decode(proto.payload);
      console.log(`  payload preview: ${decoded.substring(0, 500)}`);
    }
  } catch(e) {
    console.log(`  decode error: ${e.message}`);
  }
});

// Listen to peer join/leave
gs.addEventListener('subscription-change', (event) => {
  console.log(`[${new Date().toISOString()}] SUBSCRIPTION CHANGE from ${event.detail.peerId.toString().substring(0, 20)}:`);
  for (const s of event.detail.subscriptions) {
    console.log(`  ${s.subscribe ? '+' : '-'} ${s.topic}`);
  }
});

console.log('Listening for ALL gossipsub events for 120 seconds...');
console.log('Ask vibecoder to send a message NOW!');

await new Promise(r => setTimeout(r, 120000));
console.log('Done.');
await node.stop();
process.exit(0);
