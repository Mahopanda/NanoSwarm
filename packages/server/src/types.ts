import type { LanguageModel } from 'ai';
import type { Stores, AgentConfig } from '@nanoswarm/core';
import type { CLIChannelConfig, TelegramChannelConfig } from '@nanoswarm/channels';

export interface ChannelsConfig {
  cli?: CLIChannelConfig;
  telegram?: TelegramChannelConfig;
}

export interface AgentDefinition {
  id: string;
  name: string;
  description?: string;
  model?: LanguageModel;
  workspace?: string;
  agentConfig?: Partial<Omit<AgentConfig, 'model' | 'workspace' | 'stores'>>;
  default?: boolean;
}

export interface ServerConfig {
  name?: string;        // default: 'NanoSwarm'
  description?: string; // default: 'A NanoSwarm agent'
  version?: string;     // default: '0.1.0'
  port?: number;        // default: 4000
  host?: string;        // default: 'localhost'
  model: LanguageModel;
  workspace: string;
  stores?: Stores;
  agentConfig?: Partial<Omit<AgentConfig, 'model' | 'workspace' | 'stores'>>;
  agents?: AgentDefinition[];
  channels?: ChannelsConfig;
}
