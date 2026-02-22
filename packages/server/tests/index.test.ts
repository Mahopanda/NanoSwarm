import { describe, it, expect } from 'bun:test';
import { VERSION } from '@nanoswarm/core';

describe('server', () => {
  it('should be importable', () => {
    expect(true).toBe(true);
  });

  it('should resolve @nanoswarm/core workspace dependency', () => {
    expect(VERSION).toBe('0.1.0');
  });
});
