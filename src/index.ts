import { BridgeManager } from './core/bridge-manager';
import { BridgeConfig } from './types';
import * as readline from 'readline';
import { v4 as uuidv4 } from 'uuid';

// Default configuration
const defaultConfig: BridgeConfig = {
  agentId: `agent-${uuidv4().substring(0, 8)}`,
  agentName: 'Kai-Waku-Bridge',
  storagePath: '/tmp/hivesync.db',
  syncInterval: 5, // minutes
  waku: {
    listenAddresses: ['/ip4/0.0.0.0/tcp/0/ws'],
    bootstrapNodes: [
      '/dns4/node-01.do-ams3.wakuv2.test.status.im/tcp/443/wss/p2p/16Uiu2HAmPLe7Mzm8TsYUubgCAW1aJoeFScxrLj8ppHFivPo97bUZ',
      '/dns4/node-01.gc-us-central1-a.wakuv2.test.status.im/tcp/443/wss/p2p/16Uiu2HAmJb2e28qLXxT5kZxVUUoJt72EMzNGXB47Rxx5hw3q4YjS',
    ],
    pubsubTopic: '/waku/2/default-waku/proto',
    keepAlive: true,
    maxPeers: 10,
  },
};

// Create readline interface for interactive mode
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

class HiveSyncCLI {
  private bridge: BridgeManager;
  private config: BridgeConfig;

  constructor(config: BridgeConfig) {
    this.config = config;
    this.bridge = new BridgeManager(config);
  }

  async start(): Promise<void> {
    console.log('=== Waku Bridge for Kai ===');
    console.log(`Agent ID: ${this.config.agentId}`);
    console.log(`Agent Name: ${this.config.agentName}`);
    console.log('Initializing...');

    const started = await this.bridge.start();
    if (!started) {
      console.error('Failed to start bridge');
      process.exit(1);
    }

    console.log('\nBridge started successfully!');
    console.log('Type "help" for available commands\n');

    this.setupInteractiveMode();
  }

  private setupInteractiveMode(): void {
    rl.on('line', async (input) => {
      const [command, ...args] = input.trim().split(' ');

      switch (command.toLowerCase()) {
        case 'help':
          this.showHelp();
          break;

        case 'status':
          const status = this.bridge.getStatus();
          console.log(JSON.stringify(status, null, 2));
          break;

        case 'send':
          if (args.length < 2) {
            console.log('Usage: send <recipient> <message>');
            break;
          }
          const recipient = args[0];
          const message = args.slice(1).join(' ');
          try {
            const msgId = await this.bridge.sendTextMessage(recipient, message);
            console.log(`Message sent: ${msgId}`);
          } catch (error) {
            console.error('Failed to send message:', error);
          }
          break;

        case 'broadcast':
          if (args.length === 0) {
            console.log('Usage: broadcast <message>');
            break;
          }
          const broadcastMsg = args.join(' ');
          try {
            const msgId = await this.bridge.broadcastMessage(broadcastMsg);
            console.log(`Broadcast sent: ${msgId}`);
          } catch (error) {
            console.error('Failed to broadcast:', error);
          }
          break;

        case 'messages':
          try {
            const messages = await this.bridge.getUnreadMessages();
            if (messages.length === 0) {
              console.log('No unread messages');
            } else {
              console.log(`Unread messages (${messages.length}):`);
              messages.forEach((msg, i) => {
                console.log(`${i + 1}. From: ${msg.sender}`);
                console.log(`   Type: ${msg.type}`);
                console.log(`   Time: ${msg.timestamp.toLocaleString()}`);
                if (msg.type === 'text') {
                  console.log(`   Content: ${msg.content.text}`);
                }
                console.log();
              });
            }
          } catch (error) {
            console.error('Failed to get messages:', error);
          }
          break;

        case 'sync':
          try {
            await this.bridge.sendCommand('broadcast', 'sync');
            console.log('Sync command sent');
          } catch (error) {
            console.error('Failed to send sync command:', error);
          }
          break;

        case 'exit':
        case 'quit':
          console.log('Shutting down...');
          await this.bridge.stop();
          rl.close();
          process.exit(0);
          break;

        default:
          console.log(`Unknown command: ${command}`);
          console.log('Type "help" for available commands');
      }

      rl.prompt();
    });

    rl.setPrompt('waku> ');
    rl.prompt();
  }

  private showHelp(): void {
    console.log(`
Available commands:
  help                    - Show this help
  status                  - Show bridge status
  send <recipient> <msg>  - Send a text message
  broadcast <msg>         - Broadcast a message to all agents
  messages                - Show unread messages
  sync                    - Initiate manual sync
  exit/quit              - Exit the bridge
    `);
  }
}

// Parse command line arguments
function parseArgs(): BridgeConfig {
  const config = { ...defaultConfig };
  const args = process.argv.slice(2);

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--name':
        config.agentName = args[++i];
        break;
      case '--id':
        config.agentId = args[++i];
        break;
      case '--storage':
        config.storagePath = args[++i];
        break;
      case '--sync-interval':
        config.syncInterval = parseInt(args[++i]);
        break;
      case '--topic':
        config.waku.pubsubTopic = args[++i];
        break;
    }
  }

  return config;
}

// Main entry point
async function main() {
  const config = parseArgs();
  const cli = new HiveSyncCLI(config);
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nReceived SIGINT, shutting down...');
    await cli['bridge'].stop();
    rl.close();
    process.exit(0);
  });

  await cli.start();
}

// Run the application
if (require.main === module) {
  main().catch(console.error);
}

// Export for use as a library
export { BridgeManager, BridgeConfig };
export * from './types';
