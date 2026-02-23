import { describe, it, expect } from 'bun:test';
import { VERSION } from '@nanoswarm/core';
import {
  VERSION as SERVER_VERSION,
  createServer,
  loadConfig,
  resolveModel,
  resolveWorkspace,
} from '../src/index.ts';
import type { ServerConfig, NanoSwarmServer } from '../src/index.ts';

describe('server barrel export', () => {
  it('should resolve @nanoswarm/core workspace dependency', () => {
    expect(VERSION).toBe('0.1.0');
  });

  it('should export VERSION', () => {
    expect(SERVER_VERSION).toBe('0.1.0');
  });

  it('should export createServer', () => {
    expect(createServer).toBeInstanceOf(Function);
  });

  it('should export config functions', () => {
    expect(loadConfig).toBeInstanceOf(Function);
    expect(resolveModel).toBeInstanceOf(Function);
    expect(resolveWorkspace).toBeInstanceOf(Function);
  });
});
