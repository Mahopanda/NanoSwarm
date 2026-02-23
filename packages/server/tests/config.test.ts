import { describe, it, expect } from 'bun:test';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadConfig, resolveModel, resolveWorkspace, type NanoSwarmConfig } from '../src/config.ts';

describe('Config', () => {
  describe('loadConfig', () => {
    it('should load config from specified path', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'nanoswarm-cfg-'));
      const configPath = join(dir, 'config.json');
      const configData: NanoSwarmConfig = {
        agents: { defaults: { model: 'gemini/gemini-2.0-flash' } },
        providers: { gemini: { apiKey: 'test-key' } },
      };
      await writeFile(configPath, JSON.stringify(configData), 'utf-8');

      const config = await loadConfig(configPath);
      expect(config.agents.defaults.model).toBe('gemini/gemini-2.0-flash');
      expect(config.providers.gemini?.apiKey).toBe('test-key');
    });

    it('should throw if config file not found', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'nanoswarm-cfg-'));
      const missing = join(dir, 'nonexistent.json');

      await expect(loadConfig(missing)).rejects.toThrow('Config not found');
    });

    it('should throw on invalid JSON', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'nanoswarm-cfg-'));
      const configPath = join(dir, 'config.json');
      await writeFile(configPath, 'not-json', 'utf-8');

      await expect(loadConfig(configPath)).rejects.toThrow();
    });
  });

  describe('resolveModel', () => {
    it('should throw on missing slash in model string', () => {
      const config: NanoSwarmConfig = {
        agents: { defaults: { model: 'invalid-model' } },
        providers: {},
      };
      expect(() => resolveModel(config)).toThrow('Invalid model format');
    });

    it('should throw on unknown provider', () => {
      const config: NanoSwarmConfig = {
        agents: { defaults: { model: 'unknown/some-model' } },
        providers: {},
      };
      expect(() => resolveModel(config)).toThrow('Unknown provider');
    });

    it('should throw if anthropic apiKey is missing', () => {
      const config: NanoSwarmConfig = {
        agents: { defaults: { model: 'anthropic/claude-sonnet-4-20250514' } },
        providers: {},
      };
      expect(() => resolveModel(config)).toThrow('Missing providers.anthropic.apiKey');
    });

    it('should throw if gemini apiKey is missing', () => {
      const config: NanoSwarmConfig = {
        agents: { defaults: { model: 'gemini/gemini-2.0-flash' } },
        providers: {},
      };
      expect(() => resolveModel(config)).toThrow('Missing providers.gemini.apiKey');
    });

    it('should throw if openai apiKey is missing', () => {
      const config: NanoSwarmConfig = {
        agents: { defaults: { model: 'openai/gpt-4o' } },
        providers: {},
      };
      expect(() => resolveModel(config)).toThrow('Missing providers.openai.apiKey');
    });

    it('should resolve anthropic model', () => {
      const config: NanoSwarmConfig = {
        agents: { defaults: { model: 'anthropic/claude-sonnet-4-20250514' } },
        providers: { anthropic: { apiKey: 'test-key' } },
      };
      const model = resolveModel(config);
      expect(model).toBeDefined();
      expect(model.modelId).toBe('claude-sonnet-4-20250514');
    });

    it('should resolve gemini model', () => {
      const config: NanoSwarmConfig = {
        agents: { defaults: { model: 'gemini/gemini-2.0-flash' } },
        providers: { gemini: { apiKey: 'test-key' } },
      };
      const model = resolveModel(config);
      expect(model).toBeDefined();
      expect(model.modelId).toBe('gemini-2.0-flash');
    });

    it('should resolve google provider as alias for gemini', () => {
      const config: NanoSwarmConfig = {
        agents: { defaults: { model: 'google/gemini-2.0-flash' } },
        providers: { google: { apiKey: 'test-key' } },
      };
      const model = resolveModel(config);
      expect(model).toBeDefined();
      expect(model.modelId).toBe('gemini-2.0-flash');
    });

    it('should resolve openai model', () => {
      const config: NanoSwarmConfig = {
        agents: { defaults: { model: 'openai/gpt-4o' } },
        providers: { openai: { apiKey: 'test-key' } },
      };
      const model = resolveModel(config);
      expect(model).toBeDefined();
      expect(model.modelId).toBe('gpt-4o');
    });
  });

  describe('resolveWorkspace', () => {
    it('should use default workspace when not specified', async () => {
      const config: NanoSwarmConfig = {
        agents: { defaults: { model: 'gemini/gemini-2.0-flash' } },
        providers: {},
      };
      const ws = await resolveWorkspace(config);
      expect(ws).toContain('.nanoswarm');
      expect(ws).toContain('workspace');
    });

    it('should use specified workspace path', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'nanoswarm-ws-'));
      const config: NanoSwarmConfig = {
        agents: { defaults: { model: 'gemini/gemini-2.0-flash', workspace: dir } },
        providers: {},
      };
      const ws = await resolveWorkspace(config);
      expect(ws).toBe(dir);
    });
  });
});
