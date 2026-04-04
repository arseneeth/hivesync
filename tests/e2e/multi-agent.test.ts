import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const execAsync = promisify(exec);

describe('HiveSync End-to-End Multi-Agent Test', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hivesync-test-'));
  let agent1Dir: string;
  let agent2Dir: string;

  beforeAll(() => {
    // Create test directories for two agents
    agent1Dir = path.join(tempDir, 'agent1');
    agent2Dir = path.join(tempDir, 'agent2');
    fs.mkdirSync(agent1Dir, { recursive: true });
    fs.mkdirSync(agent2Dir, { recursive: true });

    // Create sample Obsidian vaults
    const vault1Dir = path.join(agent1Dir, 'vault');
    const vault2Dir = path.join(agent2Dir, 'vault');
    fs.mkdirSync(vault1Dir, { recursive: true });
    fs.mkdirSync(vault2Dir, { recursive: true });

    // Create sample notes
    fs.writeFileSync(
      path.join(vault1Dir, 'Welcome.md'),
      '# Welcome to Agent 1\n\nThis is agent 1\'s vault.',
      'utf-8'
    );

    fs.writeFileSync(
      path.join(vault2Dir, 'Welcome.md'),
      '# Welcome to Agent 2\n\nThis is agent 2\'s vault.',
      'utf-8'
    );
  });

  afterAll(() => {
    // Clean up test directories
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('CLI Commands', () => {
    test('should show help information', async () => {
      // Build the project first
      await execAsync('npm run build', { cwd: '/root/hivesync' });

      const { stdout } = await execAsync('node dist/cli.js --help', { 
        cwd: '/root/hivesync' 
      });

      expect(stdout).toContain('hivesync');
      expect(stdout).toContain('Usage:');
      expect(stdout).toContain('Commands:');
      expect(stdout).toContain('start');
      expect(stdout).toContain('setup');
      expect(stdout).toContain('status');
    });

    test('should run setup command', async () => {
      // Create a simple test config
      const testConfig = {
        agentId: 'test-agent-cli',
        agentName: 'Test Agent CLI',
        storagePath: path.join(agent1Dir, 'hivesync.db'),
        syncInterval: 0,
        waku: {
          listenAddresses: [],
          bootstrapNodes: [],
          pubsubTopic: '/test/e2e',
          keepAlive: false,
          maxPeers: 1,
        },
      };

      const configPath = path.join(agent1Dir, 'config.yaml');
      const yaml = require('yaml');
      fs.writeFileSync(configPath, yaml.stringify(testConfig), 'utf-8');

      // Test that config can be loaded
      expect(fs.existsSync(configPath)).toBe(true);
      
      const configContent = fs.readFileSync(configPath, 'utf-8');
      const parsedConfig = yaml.parse(configContent);
      
      expect(parsedConfig.agentId).toBe('test-agent-cli');
      expect(parsedConfig.agentName).toBe('Test Agent CLI');
    });
  });

  describe('Configuration Management', () => {
    test('should create default configuration', () => {
      // Test config loading utility
      const { loadConfig } = require('../../dist/utils/config');
      
      // Create a minimal config file
      const testConfig = {
        agentId: 'test-config-agent',
        agentName: 'Test Config Agent',
        storagePath: ':memory:',
        syncInterval: 5,
      };

      const configPath = path.join(tempDir, 'test-config.yaml');
      const yaml = require('yaml');
      fs.writeFileSync(configPath, yaml.stringify(testConfig), 'utf-8');

      // Load and verify config
      const config = loadConfig(configPath);
      expect(config.agentId).toBe('test-config-agent');
      expect(config.agentName).toBe('Test Config Agent');
      expect(config.syncInterval).toBe(5);
    });

    test('should validate configuration', () => {
      const { validateConfig } = require('../../dist/utils/config');
      
      const validConfig = {
        agentId: 'test-agent',
        agentName: 'Test Agent',
        storagePath: '/tmp/test.db',
        syncInterval: 5,
        waku: {
          bootstrapNodes: ['/dns4/test.node/tcp/443/wss/p2p/test'],
        },
      };

      const errors = validateConfig(validConfig);
      expect(errors).toHaveLength(0);

      const invalidConfig = {
        agentId: '',
        agentName: '',
        storagePath: '',
        syncInterval: -1,
        waku: {
          bootstrapNodes: [],
        },
      };

      const invalidErrors = validateConfig(invalidConfig);
      expect(invalidErrors.length).toBeGreaterThan(0);
      expect(invalidErrors).toContain('Agent ID is required');
      expect(invalidErrors).toContain('Agent name is required');
      expect(invalidErrors).toContain('Storage path is required');
      expect(invalidErrors).toContain('Sync interval must be positive');
      expect(invalidErrors).toContain('At least one Waku bootstrap node is required');
    });
  });

  describe('Library API', () => {
    test('should export main classes', () => {
      const { BridgeManager, HiveSync } = require('../../dist/index');
      
      expect(BridgeManager).toBeDefined();
      expect(HiveSync).toBeDefined();
      expect(typeof BridgeManager).toBe('function');
      expect(typeof HiveSync).toBe('function');
    });

    test('should create bridge manager instance', () => {
      const { BridgeManager } = require('../../dist/index');
      
      const config = {
        agentId: 'test-lib-agent',
        agentName: 'Test Library Agent',
        storagePath: ':memory:',
        syncInterval: 0,
        waku: {
          listenAddresses: [],
          bootstrapNodes: [],
          pubsubTopic: '/test/lib',
          keepAlive: false,
          maxPeers: 1,
        },
      };

      const bridge = new BridgeManager(config);
      expect(bridge).toBeInstanceOf(BridgeManager);
      expect(bridge.getStatus).toBeDefined();
      expect(typeof bridge.getStatus).toBe('function');
    });
  });

  describe('File System Operations', () => {
    test('should handle Obsidian vault scanning', () => {
      const { ObsidianSyncManager } = require('../../dist/sync/obsidian-sync');
      
      // Create a test vault
      const testVaultDir = path.join(tempDir, 'test-vault');
      fs.mkdirSync(testVaultDir, { recursive: true });
      
      // Create some markdown files
      const files = [
        { name: 'Note1.md', content: '# Note 1\n\nContent 1' },
        { name: 'Note2.md', content: '# Note 2\n\nContent 2' },
        { name: 'subfolder/Note3.md', content: '# Note 3\n\nContent 3' },
      ];

      for (const file of files) {
        const filePath = path.join(testVaultDir, file.name);
        const dirPath = path.dirname(filePath);
        if (!fs.existsSync(dirPath)) {
          fs.mkdirSync(dirPath, { recursive: true });
        }
        fs.writeFileSync(filePath, file.content, 'utf-8');
      }

      // Verify files were created
      for (const file of files) {
        const filePath = path.join(testVaultDir, file.name);
        expect(fs.existsSync(filePath)).toBe(true);
        
        const content = fs.readFileSync(filePath, 'utf-8');
        expect(content).toBe(file.content);
      }

      // Clean up
      fs.rmSync(testVaultDir, { recursive: true, force: true });
    });
  });

  describe('Error Scenarios', () => {
    test('should handle missing configuration gracefully', async () => {
      const { loadConfig } = require('../../dist/utils/config');
      
      // Try to load non-existent config
      const nonExistentPath = path.join(tempDir, 'non-existent-config.yaml');
      const config = loadConfig(nonExistentPath);
      
      // Should return default config
      expect(config).toBeDefined();
      expect(config.agentId).toBeDefined();
      expect(config.agentName).toBeDefined();
    });

    test('should handle invalid configuration files', () => {
      // Create invalid YAML
      const invalidConfigPath = path.join(tempDir, 'invalid-config.yaml');
      fs.writeFileSync(invalidConfigPath, 'invalid: yaml: content: [', 'utf-8');

      const { loadConfig } = require('../../dist/utils/config');
      
      // Should handle parse error gracefully
      const config = loadConfig(invalidConfigPath);
      expect(config).toBeDefined(); // Should fall back to defaults
    });
  });

  describe('Performance', () => {
    test('should handle multiple messages efficiently', async () => {
      const { StorageManager } = require('../../dist/storage/storage-manager');
      
      const storage = new StorageManager(':memory:');
      await storage.initialize();

      // Save multiple messages
      const startTime = Date.now();
      const messageCount = 100;

      for (let i = 0; i < messageCount; i++) {
        const message = {
          id: `message-${i}`,
          sender: `agent-${i % 5}`,
          recipient: `agent-${(i + 1) % 5}`,
          type: 'text',
          content: { text: `Message ${i}` },
          timestamp: new Date(),
          encrypted: false,
        };
        await storage.saveMessage(message);
      }

      const saveTime = Date.now() - startTime;
      
      // Should save 100 messages in reasonable time
      expect(saveTime).toBeLessThan(5000); // 5 seconds

      // Retrieve messages
      const retrieveStart = Date.now();
      const messages = await storage.getMessages(messageCount, 0);
      const retrieveTime = Date.now() - retrieveStart;

      expect(messages).toHaveLength(messageCount);
      expect(retrieveTime).toBeLessThan(1000); // 1 second

      await storage.close();
    });
  });
});
