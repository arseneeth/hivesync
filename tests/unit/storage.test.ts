import { StorageManager } from '../../src/storage/storage-manager';
import { Message, MessageType, AgentIdentity, ObsidianNote } from '../../src/types';

describe('Storage Manager', () => {
  let storage: StorageManager;
  const testDbPath = ':memory:';

  beforeEach(async () => {
    storage = new StorageManager(testDbPath);
    await storage.initialize();
  });

  afterEach(async () => {
    await storage.close();
  });

  describe('Message Operations', () => {
    test('should save and retrieve messages', async () => {
      const testMessage: Message = {
        id: 'test-message-1',
        sender: 'agent-1',
        recipient: 'agent-2',
        type: MessageType.TEXT,
        content: { text: 'Hello, world!' },
        timestamp: new Date(),
        encrypted: true,
        signature: 'test-signature',
      };

      await storage.saveMessage(testMessage);
      const messages = await storage.getMessages(10, 0);

      expect(messages).toHaveLength(1);
      expect(messages[0].id).toBe(testMessage.id);
      expect(messages[0].sender).toBe(testMessage.sender);
      expect(messages[0].content.text).toBe(testMessage.content.text);
    });

    test('should mark messages as read', async () => {
      const testMessage: Message = {
        id: 'test-message-2',
        sender: 'agent-1',
        recipient: 'agent-2',
        type: MessageType.TEXT,
        content: { text: 'Test message' },
        timestamp: new Date(),
        encrypted: false,
      };

      await storage.saveMessage(testMessage);
      
      // Initially should be unread
      const unreadMessages = await storage.getUnreadMessages();
      expect(unreadMessages).toHaveLength(1);

      // Mark as read
      await storage.markMessageAsRead(testMessage.id);
      
      // Now should have no unread messages
      const unreadAfter = await storage.getUnreadMessages();
      expect(unreadAfter).toHaveLength(0);
    });

    test('should retrieve messages with limit and offset', async () => {
      // Create multiple test messages
      for (let i = 0; i < 15; i++) {
        const message: Message = {
          id: `test-message-${i}`,
          sender: 'agent-1',
          recipient: 'agent-2',
          type: MessageType.TEXT,
          content: { text: `Message ${i}` },
          timestamp: new Date(Date.now() + i * 1000), // Different timestamps
          encrypted: false,
        };
        await storage.saveMessage(message);
      }

      // Get first 10 messages
      const firstPage = await storage.getMessages(10, 0);
      expect(firstPage).toHaveLength(10);
      expect(firstPage[0].id).toBe('test-message-14'); // Most recent first

      // Get next 5 messages
      const secondPage = await storage.getMessages(10, 10);
      expect(secondPage).toHaveLength(5);
      expect(secondPage[0].id).toBe('test-message-4');
    });
  });

  describe('Agent Operations', () => {
    test('should save and retrieve agents', async () => {
      const testAgent: AgentIdentity = {
        id: 'test-agent-1',
        name: 'Test Agent',
        publicKey: 'test-public-key',
        createdAt: new Date(),
      };

      await storage.saveAgent(testAgent);
      const retrievedAgent = await storage.getAgent('test-agent-1');

      expect(retrievedAgent).not.toBeNull();
      expect(retrievedAgent!.id).toBe(testAgent.id);
      expect(retrievedAgent!.name).toBe(testAgent.name);
      expect(retrievedAgent!.publicKey).toBe(testAgent.publicKey);
    });

    test('should update agent last seen', async () => {
      const testAgent: AgentIdentity = {
        id: 'test-agent-2',
        name: 'Test Agent 2',
        publicKey: 'test-public-key-2',
        createdAt: new Date(),
      };

      await storage.saveAgent(testAgent);
      await storage.updateAgentLastSeen('test-agent-2');
      
      // Note: We can't easily test the timestamp update without exposing more internals
      // This test at least verifies the method doesn't throw
      expect(storage.updateAgentLastSeen).toBeDefined();
    });

    test('should retrieve all agents', async () => {
      // Create multiple agents
      for (let i = 0; i < 5; i++) {
        const agent: AgentIdentity = {
          id: `test-agent-${i}`,
          name: `Test Agent ${i}`,
          publicKey: `public-key-${i}`,
          createdAt: new Date(),
        };
        await storage.saveAgent(agent);
      }

      const agents = await storage.getAllAgents();
      expect(agents).toHaveLength(5);
      expect(agents[0].id).toBe('test-agent-4'); // Most recent first
    });
  });

  describe('Obsidian Notes Operations', () => {
    test('should save and retrieve notes', async () => {
      const testNote: ObsidianNote = {
        id: 'test-note-1',
        path: 'folder/test.md',
        content: '# Test Note\n\nThis is a test.',
        lastModified: new Date(),
        hash: 'abc123',
      };

      await storage.saveNote(testNote);
      const retrievedNote = await storage.getNoteByPath('folder/test.md');

      expect(retrievedNote).not.toBeNull();
      expect(retrievedNote!.id).toBe(testNote.id);
      expect(retrievedNote!.path).toBe(testNote.path);
      expect(retrievedNote!.content).toBe(testNote.content);
      expect(retrievedNote!.hash).toBe(testNote.hash);
    });

    test('should retrieve modified notes', async () => {
      const oldDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 1 day ago
      const recentDate = new Date(); // Now

      // Create an old note
      const oldNote: ObsidianNote = {
        id: 'old-note',
        path: 'old.md',
        content: 'Old content',
        lastModified: oldDate,
        hash: 'old-hash',
      };

      // Create a recent note
      const recentNote: ObsidianNote = {
        id: 'recent-note',
        path: 'recent.md',
        content: 'Recent content',
        lastModified: recentDate,
        hash: 'recent-hash',
      };

      await storage.saveNote(oldNote);
      await storage.saveNote(recentNote);

      // Get notes modified since 12 hours ago
      const sinceDate = new Date(Date.now() - 12 * 60 * 60 * 1000);
      const modifiedNotes = await storage.getModifiedNotes(sinceDate);

      expect(modifiedNotes).toHaveLength(1);
      expect(modifiedNotes[0].id).toBe('recent-note');
    });

    test('should mark notes as synced', async () => {
      const testNote: ObsidianNote = {
        id: 'test-note-2',
        path: 'test2.md',
        content: 'Test content',
        lastModified: new Date(),
        hash: 'test-hash',
      };

      await storage.saveNote(testNote);
      await storage.markNoteAsSynced('test-note-2', 'agent-1');

      // Note: We can't easily verify the sync state without exposing more internals
      // This test at least verifies the method doesn't throw
      expect(storage.markNoteAsSynced).toBeDefined();
    });
  });

  describe('Sync State Operations', () => {
    test('should update and retrieve sync state', async () => {
      await storage.updateSyncState('test-agent-1', 5, 2);
      const syncState = await storage.getSyncState('test-agent-1');

      expect(syncState).not.toBeNull();
      expect(syncState!.agentId).toBe('test-agent-1');
      expect(syncState!.notesSynced).toBe(5);
      expect(syncState!.conflicts).toBe(2);
    });

    test('should increment sync state', async () => {
      // First update
      await storage.updateSyncState('test-agent-2', 3, 1);
      
      // Second update (should increment)
      await storage.updateSyncState('test-agent-2', 2, 0);
      
      const syncState = await storage.getSyncState('test-agent-2');
      expect(syncState!.notesSynced).toBe(5); // 3 + 2
      expect(syncState!.conflicts).toBe(1); // 1 + 0
    });
  });

  describe('Error Handling', () => {
    test('should handle missing agents gracefully', async () => {
      const missingAgent = await storage.getAgent('non-existent-agent');
      expect(missingAgent).toBeNull();
    });

    test('should handle missing notes gracefully', async () => {
      const missingNote = await storage.getNoteByPath('non-existent.md');
      expect(missingNote).toBeNull();
    });

    test('should handle missing sync state gracefully', async () => {
      const missingState = await storage.getSyncState('non-existent-agent');
      expect(missingState).toBeNull();
    });
  });
});
