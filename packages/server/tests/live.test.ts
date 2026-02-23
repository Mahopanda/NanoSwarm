/**
 * Live integration tests — require a real LLM provider API key.
 *
 * Skipped automatically unless GEMINI_API_KEY env var is set.
 * These tests are NOT triggered by ~/.nanoswarm/config.json to avoid
 * accidentally running during `bun test`.
 *
 * Run:  GEMINI_API_KEY=... bun test packages/server/tests/live.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Agent, type AgentConfig } from '@nanoswarm/core';
import type { LanguageModel } from 'ai';

// ---------------------------------------------------------------------------
// Resolve API key + model
// ---------------------------------------------------------------------------

const API_KEY = process.env.GEMINI_API_KEY ?? null;
const SKIP = !API_KEY;

function createModel(): LanguageModel {
  const { createGoogleGenerativeAI } = require('@ai-sdk/google');
  return createGoogleGenerativeAI({ apiKey: API_KEY! })('gemini-2.0-flash');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.if(!SKIP)('Live Agent Integration', () => {
  let workspace: string;
  let agent: Agent;

  beforeAll(async () => {
    workspace = await mkdtemp(join(tmpdir(), 'nanoswarm-live-'));

    // Minimal bootstrap so context builder works
    await writeFile(join(workspace, 'SOUL.md'), 'You are a helpful assistant for testing. Follow instructions exactly.');
    await mkdir(join(workspace, '.nanoswarm', 'memory'), { recursive: true });
    await writeFile(join(workspace, '.nanoswarm', 'memory', 'MEMORY.md'), '');
    await writeFile(join(workspace, '.nanoswarm', 'memory', 'HISTORY.md'), '');
  });

  afterAll(async () => {
    await rm(workspace, { recursive: true, force: true });
  });

  beforeEach(() => {
    const config: AgentConfig = {
      model: createModel(),
      workspace,
      heartbeatEnabled: false,
      cronEnabled: false,
      maxIterations: 5,
      temperature: 0,
    };
    agent = new Agent(config);
  });

  afterEach(async () => {
    await agent.stop();
  });

  // -----------------------------------------------------------------------
  // 1. Basic chat
  // -----------------------------------------------------------------------
  it('should respond to a simple message', async () => {
    await agent.start();
    const result = await agent.chat('live-basic', 'Reply with exactly: PONG');

    expect(result.text).toBeTruthy();
    expect(result.text.toUpperCase()).toContain('PONG');
    expect(result.finishReason).not.toBe('error');
    expect(result.usage.totalTokens).toBeGreaterThan(0);
  }, 30_000);

  // -----------------------------------------------------------------------
  // 2. Tool use — agent calls list_dir
  // -----------------------------------------------------------------------
  it('should use list_dir tool to discover files', async () => {
    await writeFile(join(workspace, 'MARKER_FILE.txt'), 'test');
    await agent.start();

    const toolCalls: string[] = [];
    agent.eventBus.on('tool-start', (e) => toolCalls.push(e.toolName));

    const result = await agent.chat(
      'live-tool',
      'Use the list_dir tool to list files in the workspace root, then tell me which filenames you see.',
    );

    expect(result.text).toContain('MARKER_FILE');
    expect(toolCalls).toContain('list_dir');
  }, 30_000);

  // -----------------------------------------------------------------------
  // 3. Subagent spawn — top-level agent dispatches to subagent
  // -----------------------------------------------------------------------
  it('should spawn a subagent that completes its task', async () => {
    await agent.start();

    const spawnEvents: any[] = [];
    const finishEvents: any[] = [];
    agent.eventBus.on('subagent-start', (e) => spawnEvents.push(e));
    agent.eventBus.on('subagent-finish', (e) => finishEvents.push(e));

    const result = await agent.chat(
      'live-spawn',
      'Call the spawn tool right now with these exact parameters: task="Say hello" label="greeter"',
    );

    // Agent should have called spawn (check both toolCalls and events)
    const spawnCalled = result.toolCalls.some((tc) => tc.toolName === 'spawn')
      || spawnEvents.length > 0;
    expect(spawnCalled).toBe(true);

    // subagent-start should have fired
    expect(spawnEvents.length).toBeGreaterThanOrEqual(1);

    // Wait for subagent to finish (runs in background)
    const deadline = Date.now() + 30_000;
    while (finishEvents.length === 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 500));
    }

    // Subagent lifecycle completed — dispatch mechanism works
    expect(finishEvents.length).toBeGreaterThanOrEqual(1);
    // Result should be a non-empty string (may succeed or hit transient API issues)
    expect(finishEvents[0].result).toBeTruthy();
  }, 60_000);

  // -----------------------------------------------------------------------
  // 4. Stats tracking — getStatus reflects activity
  // -----------------------------------------------------------------------
  it('should track message count and uptime', async () => {
    await agent.start();

    const before = agent.getStatus();
    expect(before.messagesProcessed).toBe(0);
    expect(before.idle).toBe(true);

    await agent.chat('live-stats', 'Say hello');

    const after = agent.getStatus();
    expect(after.messagesProcessed).toBe(1);
    expect(after.idle).toBe(true);
    expect(after.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(after.errorsCount).toBe(0);
  }, 30_000);

  // -----------------------------------------------------------------------
  // 5. LogBuffer captures events from real execution
  // -----------------------------------------------------------------------
  it('should capture tool events in log buffer', async () => {
    await agent.start();
    await agent.chat('live-logs', 'Use list_dir to list the workspace root.');

    const logs = agent.getRecentLogs(50);
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.some((l) => l.includes('tool-start'))).toBe(true);
    expect(logs.some((l) => l.includes('tool-finish'))).toBe(true);
  }, 30_000);
});

// Visible skip message when no API key
if (SKIP) {
  describe('Live Agent Integration', () => {
    it.skip('SKIPPED — no GEMINI_API_KEY (set env var or add to ~/.nanoswarm/config.json)', () => {});
  });
}
