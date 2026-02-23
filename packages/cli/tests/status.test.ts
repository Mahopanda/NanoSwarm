import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { defaultConfig } from '../src/templates/config.ts';

// Note: getStatus reads from ~/.nanoswarm/config.json
// For isolated testing, we test the config template generation
// and the status display logic separately.

describe('Status', () => {
  describe('config template', () => {
    it('should generate config with correct provider key', () => {
      const config = defaultConfig({
        provider: 'gemini',
        apiKey: 'test-key-123',
        model: 'gemini-2.0-flash',
        workspace: '/tmp/ws',
      });

      expect(config.agents.defaults.model).toBe('gemini/gemini-2.0-flash');
      expect(config.providers.gemini?.apiKey).toBe('test-key-123');
      expect(config.agents.defaults.workspace).toBe('/tmp/ws');
    });

    it('should map google provider to gemini key', () => {
      const config = defaultConfig({
        provider: 'google',
        apiKey: 'google-key',
        model: 'gemini-2.0-flash',
        workspace: '/tmp/ws',
      });

      expect(config.agents.defaults.model).toBe('google/gemini-2.0-flash');
      expect(config.providers.gemini?.apiKey).toBe('google-key');
    });

    it('should set correct server defaults', () => {
      const config = defaultConfig({
        provider: 'anthropic',
        apiKey: 'ant-key',
        model: 'claude-sonnet-4-20250514',
        workspace: '/tmp/ws',
      });

      expect(config.server?.port).toBe(4000);
      expect(config.server?.host).toBe('localhost');
      expect(config.server?.name).toBe('NanoSwarm');
      expect(config.providers.anthropic?.apiKey).toBe('ant-key');
    });
  });
});
