import * as fs from 'fs';
import * as path from 'path';
import yaml from 'yaml';
import { BridgeConfig } from '../types';
import { logger } from './logger';

const DEFAULT_CONFIG: BridgeConfig = {
  agentId: `agent-${Date.now().toString(36)}`,
  agentName: 'Kai Waku Bridge',
  storagePath: path.join(process.cwd(), 'data', 'hivesync.db'),
  syncInterval: 5,
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

export async function loadConfig(configPath?: string): Promise<BridgeConfig> {
  const pathsToTry = [
    configPath,
    path.join(process.cwd(), 'config', 'hivesync.yaml'),
    path.join(process.cwd(), 'hivesync.yaml'),
    path.join(process.cwd(), 'config.yaml'),
    path.join(process.cwd(), 'config', 'config.yaml'),
  ].filter(Boolean) as string[];

  for (const tryPath of pathsToTry) {
    if (fs.existsSync(tryPath)) {
      try {
        const content = fs.readFileSync(tryPath, 'utf-8');
        const config = yaml.parse(content) as BridgeConfig;
        
        // Merge with defaults
        const mergedConfig = {
          ...DEFAULT_CONFIG,
          ...config,
          waku: {
            ...DEFAULT_CONFIG.waku,
            ...config.waku,
          },
        };
        
        logger.info(`Loaded configuration from: ${tryPath}`);
        return mergedConfig;
      } catch (error) {
        logger.warn(`Failed to load config from ${tryPath}:`, error);
      }
    }
  }

  // Try environment variables
  const envConfig: Partial<BridgeConfig> = {};
  
  if (process.env.AGENT_ID) envConfig.agentId = process.env.AGENT_ID;
  if (process.env.AGENT_NAME) envConfig.agentName = process.env.AGENT_NAME;
  if (process.env.STORAGE_PATH) envConfig.storagePath = process.env.STORAGE_PATH;
  if (process.env.SYNC_INTERVAL) envConfig.syncInterval = parseInt(process.env.SYNC_INTERVAL);
  
  if (Object.keys(envConfig).length > 0) {
    logger.info('Loaded configuration from environment variables');
    return {
      ...DEFAULT_CONFIG,
      ...envConfig,
    };
  }

  logger.warn('No configuration file found, using defaults');
  return DEFAULT_CONFIG;
}

export async function saveConfig(config: BridgeConfig, configPath?: string): Promise<void> {
  const savePath = configPath || path.join(process.cwd(), 'config', 'hivesync.yaml');
  
  // Ensure directory exists
  const dir = path.dirname(savePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  const yamlStr = yaml.stringify(config);
  fs.writeFileSync(savePath, yamlStr, 'utf-8');
  
  logger.info(`Configuration saved to: ${savePath}`);
}

export function validateConfig(config: BridgeConfig): string[] {
  const errors: string[] = [];
  
  if (!config.agentId || config.agentId.trim() === '') {
    errors.push('Agent ID is required');
  }
  
  if (!config.agentName || config.agentName.trim() === '') {
    errors.push('Agent name is required');
  }
  
  if (!config.storagePath || config.storagePath.trim() === '') {
    errors.push('Storage path is required');
  }
  
  if (config.syncInterval < 0) {
    errors.push('Sync interval must be positive');
  }
  
  if (!config.waku.bootstrapNodes || config.waku.bootstrapNodes.length === 0) {
    errors.push('At least one Waku bootstrap node is required');
  }
  
  return errors;
}

export function getDefaultConfigPath(): string {
  return path.join(process.cwd(), 'config', 'hivesync.yaml');
}
