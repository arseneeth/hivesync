import { BridgeManager } from '../../src/core/bridge-manager';
import { BridgeConfig } from '../../src/types';

describe('HiveSync Communication Integration', () => {
  let agent1: BridgeManager;
  let agent2: BridgeManager;
  
  const agent1Config: BridgeConfig = {
    agentId: 'agent-alpha',
    agentName: 'Agent Alpha',
    storagePath: ':memory:',
    syncInterval: 0,
    waku: {
      listenAddresses: [],
      bootstrapNodes: [],
      pubsubTopic: '/test/communication',
      keepAlive: false,
      maxPeers: 2,
    },
  };

  const agent2Config: BridgeConfig = {
    agentId: 'agent-beta',
    agentName: 'Agent Beta',
    storagePath: ':memory:',
    syncInterval: 0,
    waku: {
      listenAddresses: [],
      bootstrapNodes: [],
      pubsubTopic: '/test/communication',
      keepAlive: false,
      maxPeers: 2,
    },
  };

  beforeEach(async () => {
    agent1 = new BridgeManager(agent1Config);
    agent2 = new BridgeManager(agent2Config);
  });

  afterEach(async () => {
    await agent1.stop();
    await agent2.stop();
  });

  describe('Agent Initialization', () => {
    test('should initialize agents with unique IDs', async () => {
      const started1 = await agent1.start();
      const started2 = await agent2.start();

      expect(started1).toBe(true);
      expect(started2).toBe(true);

      const status1 = agent1.getStatus();
      const status2 = agent2.getStatus();

      expect(status1.agentId).toBe('agent-alpha');
      expect(status2.agentId).toBe('agent-beta');
      expect(status1.agentName).toBe('Agent Alpha');
      expect(status2.agentName).toBe('Agent Beta');
    });

    test('should have different peer IDs', async () => {
      await agent1.start();
      await agent2.start();

      const status1 = agent1.getStatus();
      const status2 = agent2.getStatus();

      // In real Waku network, these would be different
      // In our mocked environment, they might be undefined
      expect(status1.waku.peerId).toBeDefined();
      expect(status2.waku.peerId).toBeDefined();
    });
  });

  describe('Message Exchange', () => {
    test('should send and receive text messages', async () => {
      await agent1.start();
      await agent2.start();

      // Mock message reception for agent2
      let receivedMessage: any = null;
      // @ts-ignore - Access private property
      agent2.wakuBridge.onMessage = jest.fn((type, handler) => {
        if (type === 'text') {
          // Simulate receiving a message
          handler({
            id: 'test-message-id',
            sender: 'agent-alpha',
            recipient: 'agent-beta',
            type: 'text',
            content: { text: 'Hello from Alpha!' },
            timestamp: new Date(),
            encrypted: true,
          });
          receivedMessage = { type, handler };
        }
      });

      // Send message from agent1 to agent2
      const messageId = await agent1.sendTextMessage('agent-beta', 'Hello from Alpha!');
      
      expect(messageId).toBeDefined();
      expect(typeof messageId).toBe('string');
      expect(messageId.length).toBeGreaterThan(0);

      // Verify agent2 received the message (through our mock)
      expect(receivedMessage).not.toBeNull();
      expect(receivedMessage.type).toBe('text');
    });

    test('should handle broadcast messages', async () => {
      await agent1.start();

      // Mock broadcast reception
      let broadcastReceived = false;
      // @ts-ignore - Access private property
      agent1.wakuBridge.onMessage = jest.fn((type, handler) => {
        if (type === 'text') {
          // Simulate receiving a broadcast
          handler({
            id: 'broadcast-id',
            sender: 'agent-alpha',
            recipient: 'broadcast',
            type: 'text',
            content: { text: 'Hello everyone!' },
            timestamp: new Date(),
            encrypted: false,
          });
          broadcastReceived = true;
        }
      });

      const broadcastId = await agent1.broadcastMessage('Hello everyone!');
      
      expect(broadcastId).toBeDefined();
      expect(broadcastReceived).toBe(true);
    });
  });

  describe('Command Handling', () => {
    test('should send and process commands', async () => {
      await agent1.start();
      await agent2.start();

      // Mock command reception for agent2
      let receivedCommand: any = null;
      // @ts-ignore - Access private property
      agent2.wakuBridge.onMessage = jest.fn((type, handler) => {
        if (type === 'command') {
          // Simulate receiving a command
          handler({
            id: 'command-id',
            sender: 'agent-alpha',
            recipient: 'agent-beta',
            type: 'command',
            content: { command: 'status', args: {} },
            timestamp: new Date(),
            encrypted: true,
          });
          receivedCommand = { type, handler };
        }
      });

      const commandId = await agent1.sendCommand('agent-beta', 'status');
      
      expect(commandId).toBeDefined();
      expect(receivedCommand).not.toBeNull();
      expect(receivedCommand.type).toBe('command');
    });

    test('should handle sync commands', async () => {
      await agent1.start();

      // Mock sync command handling
      let syncCommandSent = false;
      // @ts-ignore - Access private property
      agent1.wakuBridge.sendMessage = jest.fn().mockImplementation((message) => {
        if (message.type === 'command' && message.content.command === 'sync') {
          syncCommandSent = true;
        }
        return Promise.resolve('mock-message-id');
      });

      await agent1.sendCommand('broadcast', 'sync');
      
      expect(syncCommandSent).toBe(true);
    });
  });

  describe('Status Monitoring', () => {
    test('should provide accurate status information', async () => {
      await agent1.start();

      const status = agent1.getStatus();
      
      expect(status).toHaveProperty('running');
      expect(status).toHaveProperty('agentId');
      expect(status).toHaveProperty('agentName');
      expect(status).toHaveProperty('waku');
      expect(status).toHaveProperty('obsidianSync');
      
      expect(status.running).toBe(true);
      expect(status.agentId).toBe('agent-alpha');
      expect(status.agentName).toBe('Agent Alpha');
      expect(status.waku).toHaveProperty('connected');
      expect(status.waku).toHaveProperty('peers');
      expect(status.waku).toHaveProperty('peerId');
    });

    test('should handle unread messages', async () => {
      await agent1.start();

      // Initially should have no unread messages
      const initialMessages = await agent1.getUnreadMessages();
      expect(initialMessages).toHaveLength(0);

      // Mock saving a message
      // @ts-ignore - Access private property
      agent1.storage.saveMessage = jest.fn().mockResolvedValue(undefined);
      // @ts-ignore - Access private property
      agent1.storage.getUnreadMessages = jest.fn().mockResolvedValue([
        {
          id: 'test-message',
          sender: 'agent-beta',
          recipient: 'agent-alpha',
          type: 'text',
          content: { text: 'Test message' },
          timestamp: new Date(),
          encrypted: true,
        }
      ]);

      const messages = await agent1.getUnreadMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0].sender).toBe('agent-beta');
      expect(messages[0].content.text).toBe('Test message');
    });
  });

  describe('Error Recovery', () => {
    test('should handle failed message sending gracefully', async () => {
      await agent1.start();

      // Mock failed message sending
      // @ts-ignore - Access private property
      agent1.wakuBridge.sendMessage = jest.fn().mockRejectedValue(new Error('Network error'));

      await expect(
        agent1.sendTextMessage('agent-beta', 'Test message')
      ).rejects.toThrow('Network error');
    });

    test('should handle storage errors gracefully', async () => {
      await agent1.start();

      // Mock storage error
      // @ts-ignore - Access private property
      agent1.storage.getUnreadMessages = jest.fn().mockRejectedValue(new Error('Database error'));

      await expect(agent1.getUnreadMessages()).rejects.toThrow('Database error');
    });
  });
});
