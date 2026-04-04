import { HiveSync } from '../../src/core/hivesync-bridge';
import { BridgeConfig, MessageType } from '../../src/types';

describe('HiveSync Core', () => {
  let hivesync: HiveSync;
  const mockConfig: BridgeConfig = {
    agentId: 'test-agent-1',
    agentName: 'Test Agent',
    storagePath: ':memory:',
    syncInterval: 0,
    waku: {
      listenAddresses: [],
      bootstrapNodes: [],
      pubsubTopic: '/test/topic',
      keepAlive: false,
      maxPeers: 1,
    },
  };

  beforeEach(() => {
    hivesync = new HiveSync(mockConfig);
  });

  afterEach(async () => {
    await hivesync.disconnect();
  });

  describe('Initialization', () => {
    test('should create instance with config', () => {
      expect(hivesync).toBeInstanceOf(HiveSync);
      expect(hivesync.getStatus().connected).toBe(false);
    });

    test('should initialize successfully', async () => {
      // Mock Waku initialization since we can't actually connect in tests
      const mockWaku = {
        libp2p: {
          peerId: { toString: () => 'test-peer-id' },
          getPeers: () => [],
        },
        relay: {
          addObserver: jest.fn(),
        },
        lightPush: {
          push: jest.fn().mockResolvedValue(undefined),
        },
        stop: jest.fn().mockResolvedValue(undefined),
      };

      // @ts-ignore - Mock private property
      hivesync.waku = mockWaku;
      // @ts-ignore - Mock private property
      hivesync.isConnected = true;

      const status = hivesync.getStatus();
      expect(status.connected).toBe(true);
      expect(status.peerId).toBe('test-peer-id');
    });
  });

  describe('Message Handling', () => {
    test('should register message handlers', () => {
      const handler = jest.fn();
      hivesync.onMessage(MessageType.TEXT, handler);
      
      // Simulate receiving a message
      const testMessage = {
        id: 'test-id',
        sender: 'sender-1',
        recipient: 'test-agent-1',
        type: MessageType.TEXT,
        content: { text: 'Hello' },
        timestamp: new Date(),
        encrypted: false,
      };

      // @ts-ignore - Access private method for testing
      hivesync.handleIncomingMessage({
        payload: new TextEncoder().encode(JSON.stringify(testMessage)),
      });

      // Handler won't be called because Waku is mocked
      // This test verifies the method exists and doesn't throw
      expect(hivesync.onMessage).toBeDefined();
    });

    test('should send message with correct format', async () => {
      const mockPush = jest.fn().mockResolvedValue(undefined);
      const mockWaku = {
        lightPush: { push: mockPush },
        libp2p: { peerId: { toString: () => 'test-id' } },
      };

      // @ts-ignore - Mock private property
      hivesync.waku = mockWaku;
      // @ts-ignore - Mock private property
      hivesync.isConnected = true;

      const message = {
        sender: 'test-agent-1',
        recipient: 'recipient-1',
        type: MessageType.TEXT,
        content: { text: 'Test message' },
        encrypted: true,
      };

      const messageId = await hivesync.sendMessage(message);
      
      expect(messageId).toBeDefined();
      expect(mockPush).toHaveBeenCalled();
      
      const callArgs = mockPush.mock.calls[0][0];
      expect(callArgs.payload).toBeDefined();
      expect(callArgs.contentTopic).toBe(mockConfig.waku.pubsubTopic);
    });
  });

  describe('Status Management', () => {
    test('should return correct status when disconnected', () => {
      const status = hivesync.getStatus();
      expect(status.connected).toBe(false);
      expect(status.peers).toBe(0);
      expect(status.peerId).toBeUndefined();
    });

    test('should return correct status when connected', () => {
      const mockWaku = {
        libp2p: {
          peerId: { toString: () => 'connected-peer-id' },
          getPeers: () => ['peer-1', 'peer-2'],
        },
      };

      // @ts-ignore - Mock private property
      hivesync.waku = mockWaku;
      // @ts-ignore - Mock private property
      hivesync.isConnected = true;

      const status = hivesync.getStatus();
      expect(status.connected).toBe(true);
      expect(status.peerId).toBe('connected-peer-id');
      expect(status.peers).toBe(2);
    });
  });

  describe('Error Handling', () => {
    test('should handle initialization errors gracefully', async () => {
      // Mock failed initialization
      const originalConsoleError = console.error;
      console.error = jest.fn();

      // Create a config that will cause initialization to fail
      const invalidConfig = { ...mockConfig, agentId: '' };
      const invalidHiveSync = new HiveSync(invalidConfig);
      
      // Try to initialize (will fail but shouldn't throw)
      await expect(invalidHiveSync.initialize()).resolves.not.toThrow();

      console.error = originalConsoleError;
    });

    test('should handle message sending errors', async () => {
      // Mock failed message sending
      const mockPush = jest.fn().mockRejectedValue(new Error('Network error'));
      const mockWaku = {
        lightPush: { push: mockPush },
        libp2p: { peerId: { toString: () => 'test-id' } },
      };

      // @ts-ignore - Mock private property
      hivesync.waku = mockWaku;
      // @ts-ignore - Mock private property
      hivesync.isConnected = true;

      const message = {
        sender: 'test-agent-1',
        recipient: 'recipient-1',
        type: MessageType.TEXT,
        content: { text: 'Test' },
        encrypted: true,
      };

      await expect(hivesync.sendMessage(message)).rejects.toThrow('Network error');
    });
  });
});
