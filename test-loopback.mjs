// Loopback test: create a relay node, subscribe, send a message, check if we receive our own message
import { waitForRemotePeer, Protocols } from '@waku/sdk';
import { createRelayNode } from '@waku/relay';
import { createRoutingInfo } from '@waku/utils';

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

// Wait for relay peers
await waitForRemotePeer(node, [Protocols.Relay], 15000);

const encoder = node.createEncoder({ contentTopic });
const decoder = node.createDecoder({ contentTopic });

let received = false;
console.log('Subscribing...');
await node.relay.subscribeWithUnsubscribe([decoder], (msg) => {
  console.log('RECEIVED! payload length:', msg.payload?.length, 'payload:', new TextDecoder().decode(msg.payload || new Uint8Array()));
  received = true;
});

// Wait a bit for subscription to settle
await new Promise(r => setTimeout(r, 2000));

// Send a test message
const testPayload = new TextEncoder().encode('LOOPBACK_TEST_12345');
console.log('Sending test message...');
await node.relay.send(encoder, { payload: testPayload });
console.log('Sent. Waiting 10s for loopback...');

await new Promise(r => setTimeout(r, 10000));

console.log('Received own message:', received);

await node.stop();
process.exit(received ? 0 : 1);
