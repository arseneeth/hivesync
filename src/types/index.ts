export interface AgentIdentity {
  id: string;
  name: string;
  publicKey: string;
  createdAt: Date;
}

export interface Message {
  id: string;
  sender: string;
  recipient: string;
  type: MessageType;
  content: any;
  timestamp: Date;
  encrypted: boolean;
  signature?: string;
}

export enum MessageType {
  TEXT = 'text',
  FILE = 'file',
  SYNC_REQUEST = 'sync_request',
  SYNC_RESPONSE = 'sync_response',
  OBSIDIAN_UPDATE = 'obsidian_update',
  COMMAND = 'command',
  ACK = 'ack'
}

export interface FileChunk {
  id: string;
  fileId: string;
  chunkIndex: number;
  totalChunks: number;
  data: Uint8Array;
  hash: string;
}

export interface ObsidianNote {
  id: string;
  path: string;
  content: string;
  lastModified: Date;
  hash: string;
}

export interface SyncState {
  agentId: string;
  lastSync: Date;
  notesSynced: number;
  conflicts: number;
}

export interface WakuConfig {
  listenAddresses: string[];
  bootstrapNodes: string[];
  pubsubTopic: string;
  keepAlive: boolean;
  maxPeers: number;
}

export interface BridgeConfig {
  agentId: string;
  agentName: string;
  storagePath: string;
  waku: WakuConfig;
  syncInterval: number;
}
