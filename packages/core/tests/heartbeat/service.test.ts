import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';
import { HeartbeatService } from '../../src/heartbeat/service.ts';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('HeartbeatService', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'heartbeat-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  async function writeHeartbeat(content: string): Promise<void> {
    const dir = join(tempDir, '.nanoswarm');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'HEARTBEAT.md'), content, 'utf-8');
  }

  it('should skip when HEARTBEAT.md does not exist', async () => {
    const callback = mock(async () => 'HEARTBEAT_OK');
    const svc = new HeartbeatService(tempDir, callback);

    const result = await svc.triggerNow();

    expect(result).toBeNull();
    expect(callback).not.toHaveBeenCalled();
  });

  it('should skip when HEARTBEAT.md is empty', async () => {
    await writeHeartbeat('');
    const callback = mock(async () => 'HEARTBEAT_OK');
    const svc = new HeartbeatService(tempDir, callback);

    const result = await svc.triggerNow();

    expect(result).toBeNull();
    expect(callback).not.toHaveBeenCalled();
  });

  it('should skip when HEARTBEAT.md has only headers and completed items', async () => {
    await writeHeartbeat(`# Tasks

- [x] Done task 1
- [x] Done task 2
`);
    const callback = mock(async () => 'HEARTBEAT_OK');
    const svc = new HeartbeatService(tempDir, callback);

    const result = await svc.triggerNow();

    expect(result).toBeNull();
    expect(callback).not.toHaveBeenCalled();
  });

  it('should trigger when HEARTBEAT.md has unchecked items', async () => {
    await writeHeartbeat(`# Tasks

- [ ] Check system health
- [x] Done task
`);
    const callback = mock(async () => 'HEARTBEAT_OK');
    const svc = new HeartbeatService(tempDir, callback);

    const result = await svc.triggerNow();

    expect(result).toBe('HEARTBEAT_OK');
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('should trigger when HEARTBEAT.md has non-checkbox content', async () => {
    await writeHeartbeat(`# Reminders

Check the deployment status.
`);
    const callback = mock(async () => 'Done checking');
    const svc = new HeartbeatService(tempDir, callback);

    const result = await svc.triggerNow();

    expect(result).toBe('Done checking');
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('should return null when no callback is provided', async () => {
    await writeHeartbeat('- [ ] Task');
    const svc = new HeartbeatService(tempDir);

    const result = await svc.triggerNow();

    expect(result).toBeNull();
  });

  it('should start and stop interval', async () => {
    const callback = mock(async () => 'HEARTBEAT_OK');
    const svc = new HeartbeatService(tempDir, callback, 100, true);

    svc.start();
    // Should be running — we rely on stop() not throwing
    svc.stop();
    // Double stop is safe
    svc.stop();
  });

  it('should not start when disabled', async () => {
    await writeHeartbeat('- [ ] Task');
    const callback = mock(async () => 'HEARTBEAT_OK');
    const svc = new HeartbeatService(tempDir, callback, 50, false);

    svc.start();
    await new Promise((resolve) => setTimeout(resolve, 100));
    svc.stop();

    expect(callback).not.toHaveBeenCalled();
  });

  it('should skip HTML comments in HEARTBEAT.md', async () => {
    await writeHeartbeat(`# Config
<!-- This is a comment -->
`);
    const callback = mock(async () => 'HEARTBEAT_OK');
    const svc = new HeartbeatService(tempDir, callback);

    const result = await svc.triggerNow();

    expect(result).toBeNull();
    expect(callback).not.toHaveBeenCalled();
  });
});
