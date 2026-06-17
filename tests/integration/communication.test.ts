import { BridgeManager } from '../../src/core/bridge-manager';
import { InMemoryTransport } from '../../src/core/transport';
import { BridgeConfig, MessageType } from '../../src/types';

const TOPIC = '/hivesync-test/1/integration/proto';

function makeConfig(agentId: string, agentName: string): BridgeConfig {
  return {
    agentId,
    agentName,
    storagePath: ':memory:', // => ephemeral identity, in-memory db
    syncInterval: 0,
    waku: {
      listenAddresses: [],
      bootstrapNodes: [],
      clusterId: 1,
      numShardsInCluster: 8,
      contentTopic: TOPIC,
      keepAlive: false,
      maxPeers: 2,
    },
  };
}

async function waitFor(pred: () => boolean | Promise<boolean>, ms = 2000): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await pred()) return true;
    await new Promise((r) => setTimeout(r, 30));
  }
  return Boolean(await pred());
}

describe('BridgeManager communication (in-memory transport)', () => {
  let alpha: BridgeManager;
  let beta: BridgeManager;

  beforeEach(async () => {
    alpha = new BridgeManager(makeConfig('agent-alpha', 'Agent Alpha'), new InMemoryTransport(TOPIC, 'agent-alpha'));
    beta = new BridgeManager(makeConfig('agent-beta', 'Agent Beta'), new InMemoryTransport(TOPIC, 'agent-beta'));
  });

  afterEach(async () => {
    await alpha.stop();
    await beta.stop();
  });

  test('both agents start and report running', async () => {
    expect(await alpha.start()).toBe(true);
    expect(await beta.start()).toBe(true);
    const status = await alpha.getStatus();
    expect(status.running).toBe(true);
    expect(status.agentId).toBe('agent-alpha');
    expect(status.hivesync).toHaveProperty('connected', true);
    expect(status.hivesync).toHaveProperty('knownAgents');
  });

  test('agents discover each other', async () => {
    await alpha.start();
    await beta.start();
    expect(await waitFor(() => alpha.getKnownAgents().some((a) => a.id === 'agent-beta'))).toBe(true);
    expect(await waitFor(() => beta.getKnownAgents().some((a) => a.id === 'agent-alpha'))).toBe(true);
  });

  test('delivers an encrypted directed text message end to end', async () => {
    await alpha.start();
    await beta.start();
    expect(await alpha.waitForAgent('agent-beta', 2000)).toBe(true);

    await alpha.sendTextMessage('agent-beta', 'hello beta');

    const received = await waitFor(async () => {
      const msgs = await beta.getUnreadMessages();
      return msgs.some((m) => m.type === MessageType.TEXT && m.content.text === 'hello beta');
    });
    expect(received).toBe(true);

    const msgs = await beta.getUnreadMessages();
    const text = msgs.find((m) => m.content.text === 'hello beta')!;
    expect(text.sender).toBe('agent-alpha');
    expect(text.encrypted).toBe(true); // beta's key was known => encrypted
  });

  test('auto-replies pong to a ping (round trip)', async () => {
    await alpha.start();
    await beta.start();
    expect(await alpha.waitForAgent('agent-beta', 2000)).toBe(true);
    expect(await beta.waitForAgent('agent-alpha', 2000)).toBe(true);

    await alpha.sendTextMessage('agent-beta', 'ping');

    const gotPong = await waitFor(async () => {
      const msgs = await alpha.getUnreadMessages();
      return msgs.some((m) => m.content.text === 'pong');
    });
    expect(gotPong).toBe(true);
  });

  test('broadcast reaches the other agent but not the sender', async () => {
    await alpha.start();
    await beta.start();
    await alpha.waitForAgent('agent-beta', 2000);

    await alpha.broadcastMessage('hello everyone');

    expect(
      await waitFor(async () => {
        const msgs = await beta.getUnreadMessages();
        return msgs.some((m) => m.content.text === 'hello everyone');
      })
    ).toBe(true);

    const alphaMsgs = await alpha.getUnreadMessages();
    expect(alphaMsgs.some((m) => m.content.text === 'hello everyone')).toBe(false);
  });

  test('command messages trigger handled responses', async () => {
    await alpha.start();
    await beta.start();
    await alpha.waitForAgent('agent-beta', 2000);

    await alpha.sendCommand('agent-beta', 'help');

    // beta should respond with a text message back to alpha
    expect(
      await waitFor(async () => {
        const msgs = await alpha.getUnreadMessages();
        return msgs.some((m) => typeof m.content.text === 'string' && m.content.text.includes('Commands'));
      })
    ).toBe(true);
  });

  describe('lifecycle', () => {
    test('stop is safe before start and idempotent', async () => {
      await expect(alpha.stop()).resolves.not.toThrow();
      await alpha.start();
      await alpha.stop();
      await expect(alpha.stop()).resolves.not.toThrow();
    });
  });
});
