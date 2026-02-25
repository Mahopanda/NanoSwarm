import { readFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import type { LanguageModel } from 'ai';

export interface ExternalAgentRef {
  id: string;
  name: string;
  url: string;
  description?: string;
}

export interface NanoSwarmConfig {
  agents: {
    defaults: {
      model: string;
      workspace?: string;
    };
  };
  providers: {
    anthropic?: { apiKey: string };
    google?: { apiKey: string };
    gemini?: { apiKey: string };
    openai?: { apiKey: string };
  };
  server?: {
    port?: number;
    host?: string;
    name?: string;
    adminApiKey?: string;
  };
  externalAgents?: ExternalAgentRef[];
  channels?: {
    cli?: { enabled: boolean; prompt?: string; allowFrom?: string[] };
    telegram?: {
      enabled: boolean;
      token: string;
      allowFrom?: string[];
      adminUsers?: string[];
      proxy?: string;
      replyToMessage?: boolean;
      sttProvider?: 'groq' | 'whisper';
      sttApiKey?: string;
      group?: {
        requireMention?: boolean;
        policy?: 'open' | 'allowlist' | 'disabled';
        allowGroups?: string[];
        cooldownSeconds?: number;
      };
      mediaDir?: string;
      /** Sub-bot accounts keyed by bot ID, e.g. { "finance": { token: "...", boundAgent: "finance-agent" } } */
      accounts?: Record<string, {
        token: string;
        boundAgent: string;
        allowFrom?: string[];
        proxy?: string;
        replyToMessage?: boolean;
        sttProvider?: 'groq' | 'whisper';
        sttApiKey?: string;
        group?: {
          requireMention?: boolean;
          policy?: 'open' | 'allowlist' | 'disabled';
          allowGroups?: string[];
          cooldownSeconds?: number;
        };
        mediaDir?: string;
      }>;
    };
  };
  tools?: {
    web?: { search?: { apiKey: string } };
    exec?: { timeout?: number };
    restrictToWorkspace?: boolean;
  };
}

const CONFIG_DIR = join(homedir(), '.nanoswarm');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

/** Replace `${VAR_NAME}` placeholders with `process.env.VAR_NAME` */
function interpolateEnv(raw: string): string {
  return raw.replace(/\$\{([^}]+)\}/g, (_match, varName: string) => {
    return process.env[varName] ?? '';
  });
}

export async function loadConfig(path?: string): Promise<NanoSwarmConfig> {
  const configPath = path ?? CONFIG_PATH;
  try {
    const raw = await readFile(configPath, 'utf-8');
    const interpolated = interpolateEnv(raw);
    return JSON.parse(interpolated) as NanoSwarmConfig;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(
        `Config not found at ${configPath}\n` +
          `Create it with your API keys. See config.example.json for reference.`,
      );
    }
    throw error;
  }
}

export function resolveModel(config: NanoSwarmConfig): LanguageModel {
  const modelString = config.agents.defaults.model;
  const slashIndex = modelString.indexOf('/');
  if (slashIndex === -1) {
    throw new Error(
      `Invalid model format: "${modelString}". Expected "provider/model-id" (e.g. "gemini/gemini-2.0-flash").`,
    );
  }

  const provider = modelString.slice(0, slashIndex);
  const modelId = modelString.slice(slashIndex + 1);

  switch (provider) {
    case 'anthropic': {
      const apiKey = config.providers.anthropic?.apiKey;
      if (!apiKey) throw new Error('Missing providers.anthropic.apiKey in config.');
      // Dynamic import avoided — use require-style for Bun compatibility
      const { createAnthropic } = require('@ai-sdk/anthropic');
      return createAnthropic({ apiKey })(modelId);
    }
    case 'gemini':
    case 'google': {
      const apiKey = config.providers.gemini?.apiKey ?? config.providers.google?.apiKey;
      if (!apiKey) throw new Error('Missing providers.gemini.apiKey (or providers.google.apiKey) in config.');
      const { createGoogleGenerativeAI } = require('@ai-sdk/google');
      return createGoogleGenerativeAI({ apiKey })(modelId);
    }
    case 'openai': {
      const apiKey = config.providers.openai?.apiKey;
      if (!apiKey) throw new Error('Missing providers.openai.apiKey in config.');
      const { createOpenAI } = require('@ai-sdk/openai');
      return createOpenAI({ apiKey })(modelId);
    }
    default:
      throw new Error(
        `Unknown provider: "${provider}". Supported: anthropic, gemini, google, openai.`,
      );
  }
}

function expandHome(p: string): string {
  if (p.startsWith('~/')) {
    return join(homedir(), p.slice(2));
  }
  return p;
}

export async function resolveWorkspace(config: NanoSwarmConfig): Promise<string> {
  const raw = config.agents.defaults.workspace ?? '~/.nanoswarm/workspace';
  const absolute = resolve(expandHome(raw));
  await mkdir(absolute, { recursive: true });
  return absolute;
}
