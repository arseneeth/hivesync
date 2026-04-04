import { HiveSync } from './hivesync';
import { StorageManager } from '../storage/storage-manager';
import { ObsidianSyncManager } from '../sync/obsidian-sync';
import { BridgeConfig, AgentIdentity, Message, MessageType } from '../types';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';

export class BridgeManager {
  private config: BridgeConfig;
  private wakuBridge: HiveSync;
  private storage: StorageManager;
  private obsidianSync: ObsidianSyncManager | null = null;
  private isRunning: boolean = false;

  constructor(config: BridgeConfig) {
    this.config = config;
    this.wakuBridge = new HiveSync(config);
    this.storage = new StorageManager(config.storagePath);
  }

  async start(): Promise<boolean> {
    try {
      console.log('Starting Waku Bridge Manager...');

      // Initialize storage
      await this.storage.initialize();

      // Initialize Waku bridge
      const wakuStarted = await this.wakuBridge.initialize();
      if (!wakuStarted) {
        throw new Error('Failed to initialize Waku bridge');
      }

      // Register this agent
      await this.registerAgent();

      // Setup message handlers
      this.setupMessageHandlers();

      // Initialize Obsidian sync if vault path is provided
      if (this.config.syncInterval > 0) {
        // For now, we'll create a dummy vault path
        // In real usage, this would be provided by the user
        const vaultPath = '/tmp/obsidian-vault';
        this.obsidianSync = new ObsidianSyncManager(this.wakuBridge, this.storage, vaultPath);
        await this.obsidianSync.startSync(this.config.syncInterval);
      }

      this.isRunning = true;
      console.log('Bridge Manager started successfully');
      console.log('Agent ID:', this.config.agentId);
      console.log('Status:', this.wakuBridge.getStatus());

      return true;
    } catch (error) {
      console.error('Failed to start Bridge Manager:', error);
      this.isRunning = false;
      return false;
    }
  }

  async stop(): Promise<void> {
    console.log('Stopping Bridge Manager...');

    if (this.obsidianSync) {
      await this.obsidianSync.stopSync();
    }

    await this.wakuBridge.disconnect();
    await this.storage.close();

    this.isRunning = false;
    console.log('Bridge Manager stopped');
  }

  private async registerAgent(): Promise<void> {
    // Generate a key pair for this agent
    const keyPair = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem'
      }
    });

    const agent: AgentIdentity = {
      id: this.config.agentId,
      name: this.config.agentName,
      publicKey: keyPair.publicKey,
      createdAt: new Date(),
    };

    await this.storage.saveAgent(agent);
    console.log(`Agent registered: ${agent.name} (${agent.id})`);
  }

  private setupMessageHandlers(): void {
    // Handle text messages
    this.wakuBridge.onMessage(MessageType.TEXT, async (message) => {
      console.log(`Text message from ${message.sender}: ${message.content.text}`);
      await this.storage.saveMessage(message);
      
      // Auto-reply for testing
      if (message.content.text.toLowerCase().includes('ping')) {
        await this.sendTextMessage(message.sender, 'pong');
      }
    });

    // Handle command messages
    this.wakuBridge.onMessage(MessageType.COMMAND, async (message) => {
      console.log(`Command from ${message.sender}: ${message.content.command}`);
      await this.handleCommand(message);
    });

    // Handle ACK messages
    this.wakuBridge.onMessage(MessageType.ACK, async (message) => {
      console.log(`ACK received for message: ${message.content.originalMessageId}`);
    });
  }

  private async handleCommand(message: Message): Promise<void> {
    const { command, args } = message.content;

    switch (command) {
      case 'status':
        const status = this.wakuBridge.getStatus();
        await this.sendTextMessage(message.sender, `Status: ${JSON.stringify(status, null, 2)}`);
        break;

      case 'agents':
        const agents = await this.storage.getAllAgents();
        const agentList = agents.map(a => `${a.name} (${a.id})`).join('\n');
        await this.sendTextMessage(message.sender, `Known agents:\n${agentList}`);
        break;

      case 'sync':
        if (this.obsidianSync) {
          await this.obsidianSync.syncWithAllAgents();
          await this.sendTextMessage(message.sender, 'Sync initiated');
        } else {
          await this.sendTextMessage(message.sender, 'Obsidian sync not configured');
        }
        break;

      case 'help':
        const helpText = `Available commands:
- status: Get bridge status
- agents: List known agents
- sync: Initiate manual sync
- help: Show this help`;
        await this.sendTextMessage(message.sender, helpText);
        break;

      default:
        await this.sendTextMessage(message.sender, `Unknown command: ${command}`);
    }
  }

  async sendTextMessage(recipient: string, text: string): Promise<string> {
    const message: Omit<Message, 'id' | 'timestamp'> = {
      sender: this.config.agentId,
      recipient,
      type: MessageType.TEXT,
      content: { text },
      encrypted: true,
    };

    return await this.wakuBridge.sendMessage(message);
  }

  async sendCommand(recipient: string, command: string, args: any = {}): Promise<string> {
    const message: Omit<Message, 'id' | 'timestamp'> = {
      sender: this.config.agentId,
      recipient,
      type: MessageType.COMMAND,
      content: { command, args },
      encrypted: true,
    };

    return await this.wakuBridge.sendMessage(message);
  }

  async broadcastMessage(text: string): Promise<string> {
    const message: Omit<Message, 'id' | 'timestamp'> = {
      sender: this.config.agentId,
      recipient: 'broadcast',
      type: MessageType.TEXT,
      content: { text },
      encrypted: false, // Broadcast messages are not encrypted
    };

    return await this.wakuBridge.sendMessage(message);
  }

  async getUnreadMessages(): Promise<Message[]> {
    return await this.storage.getUnreadMessages();
  }

  async markMessageAsRead(messageId: string): Promise<void> {
    await this.storage.markMessageAsRead(messageId);
  }

  getStatus(): any {
    const wakuStatus = this.wakuBridge.getStatus();
    return {
      running: this.isRunning,
      agentId: this.config.agentId,
      agentName: this.config.agentName,
      waku: wakuStatus,
      obsidianSync: !!this.obsidianSync,
    };
  }

  async scanObsidianVault(vaultPath: string): Promise<number> {
    if (!this.obsidianSync) {
      throw new Error('Obsidian sync not initialized');
    }

    const notes = await this.obsidianSync.scanVault();
    return notes.length;
  }
}
