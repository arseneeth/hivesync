import { Waku } from 'js-waku';
import { createLightNode } from 'js-waku';
import { waitForRemotePeer } from 'js-waku';
import { Protocols } from 'js-waku';
import type { WakuMessage } from 'js-waku';
import { utf8ToBytes } from 'js-waku';
import { bytesToUtf8 } from 'js-waku';
import { v4 as uuidv4 } from 'uuid';
import { Message, MessageType, BridgeConfig } from '../types';

export class HiveSync {
  private waku: Waku | null = null;
  private config: BridgeConfig;
  private messageHandlers: Map<MessageType, (message: Message) => void> = new Map();
  private isConnected: boolean = false;

  constructor(config: BridgeConfig) {
    this.config = config;
  }

  async initialize(): Promise<boolean> {
    try {
      console.log('Initializing Waku bridge...');
      
      // Create a light node for efficiency
      this.waku = await createLightNode({
        defaultBootstrap: this.config.waku.bootstrapNodes.length === 0,
      });

      // Add bootstrap nodes if provided
      if (this.config.waku.bootstrapNodes.length > 0) {
        for (const node of this.config.waku.bootstrapNodes) {
          await this.waku.addPeerToAddressBook(node);
        }
      }

      // Wait for connection to peers
      await waitForRemotePeer(this.waku, [Protocols.Store, Protocols.Filter, Protocols.LightPush]);

      this.isConnected = true;
      console.log('Waku bridge initialized successfully');
      console.log('Peer ID:', this.waku.libp2p.peerId.toString());
      
      // Subscribe to the pubsub topic
      await this.subscribeToTopic();
      
      return true;
    } catch (error) {
      console.error('Failed to initialize Waku bridge:', error);
      this.isConnected = false;
      return false;
    }
  }

  private async subscribeToTopic(): Promise<void> {
    if (!this.waku) return;

    const topic = this.config.waku.pubsubTopic;
    
    // Subscribe to messages
    await this.waku.relay.addObserver(
      (wakuMessage: WakuMessage) => {
        this.handleIncomingMessage(wakuMessage);
      },
      [topic]
    );

    console.log(`Subscribed to topic: ${topic}`);
  }

  private async handleIncomingMessage(wakuMessage: WakuMessage): Promise<void> {
    try {
      if (!wakuMessage.payload) return;

      const payload = bytesToUtf8(wakuMessage.payload);
      const message: Message = JSON.parse(payload);

      // Verify the message is for this agent
      if (message.recipient !== this.config.agentId && message.recipient !== 'broadcast') {
        return;
      }

      console.log(`Received message from ${message.sender}: ${message.type}`);

      // Call the appropriate handler
      const handler = this.messageHandlers.get(message.type);
      if (handler) {
        handler(message);
      }

      // Send acknowledgment if needed
      if (message.type !== MessageType.ACK) {
        await this.sendAck(message.id, message.sender);
      }
    } catch (error) {
      console.error('Error handling incoming message:', error);
    }
  }

  async sendMessage(message: Omit<Message, 'id' | 'timestamp'>): Promise<string> {
    if (!this.waku || !this.isConnected) {
      throw new Error('Waku bridge not initialized or connected');
    }

    const fullMessage: Message = {
      ...message,
      id: uuidv4(),
      timestamp: new Date(),
    };

    try {
      const payload = utf8ToBytes(JSON.stringify(fullMessage));
      
      await this.waku.lightPush.push({
        payload,
        timestamp: new Date(),
        contentTopic: this.config.waku.pubsubTopic,
      });

      console.log(`Message sent: ${fullMessage.id} to ${fullMessage.recipient}`);
      return fullMessage.id;
    } catch (error) {
      console.error('Failed to send message:', error);
      throw error;
    }
  }

  async sendAck(messageId: string, recipient: string): Promise<void> {
    const ackMessage: Omit<Message, 'id' | 'timestamp'> = {
      sender: this.config.agentId,
      recipient,
      type: MessageType.ACK,
      content: { originalMessageId: messageId },
      encrypted: false,
    };

    await this.sendMessage(ackMessage);
  }

  onMessage(type: MessageType, handler: (message: Message) => void): void {
    this.messageHandlers.set(type, handler);
  }

  async disconnect(): Promise<void> {
    if (this.waku) {
      await this.waku.stop();
      this.waku = null;
      this.isConnected = false;
      console.log('Waku bridge disconnected');
    }
  }

  getStatus(): { connected: boolean; peerId?: string; peers: number } {
    if (!this.waku) {
      return { connected: false, peers: 0 };
    }

    const peers = this.waku.libp2p.getPeers().length;
    return {
      connected: this.isConnected,
      peerId: this.waku.libp2p.peerId.toString(),
      peers,
    };
  }
}
