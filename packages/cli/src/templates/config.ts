import type { NanoSwarmConfig } from '@nanoswarm/server';

export function defaultConfig(overrides: {
  provider: string;
  apiKey: string;
  model: string;
  workspace: string;
}): NanoSwarmConfig {
  const providerKey = overrides.provider === 'google' ? 'gemini' : overrides.provider;

  return {
    agents: {
      defaults: {
        model: `${overrides.provider}/${overrides.model}`,
        workspace: overrides.workspace,
      },
    },
    providers: {
      [providerKey]: { apiKey: overrides.apiKey },
    },
    server: {
      port: 4000,
      host: 'localhost',
      name: 'NanoSwarm',
    },
  };
}

export const PROVIDER_DEFAULTS: Record<string, string> = {
  gemini: 'gemini-2.0-flash',
  anthropic: 'claude-sonnet-4-20250514',
  openai: 'gpt-4o',
};
