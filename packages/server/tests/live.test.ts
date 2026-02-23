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
import { mkdtemp, rm, mkdir, writeFile, readFile, stat } from 'node:fs/promises';
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
// Helpers
// ---------------------------------------------------------------------------

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function readFileContent(path: string): Promise<string> {
  return readFile(path, 'utf-8');
}

function trackTools(agent: Agent): { names: string[]; events: any[] } {
  const names: string[] = [];
  const events: any[] = [];
  agent.eventBus.on('tool-start', (e) => {
    names.push(e.toolName);
    events.push(e);
  });
  return { names, events };
}

async function waitFor(
  condition: () => boolean,
  timeoutMs: number,
  pollMs = 500,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (!condition() && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollMs));
  }
  return condition();
}

// Rate limit guard — Gemini Flash free tier is 15 RPM.
// Ensures at least MIN_INTERVAL_MS between consecutive LLM calls across all tests.
const MIN_INTERVAL_MS = 4_500;
let lastCallMs = 0;

async function rateLimitGuard(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastCallMs;
  if (elapsed < MIN_INTERVAL_MS) {
    await new Promise((r) => setTimeout(r, MIN_INTERVAL_MS - elapsed));
  }
  lastCallMs = Date.now();
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

    // Test data for file operation tests
    await mkdir(join(workspace, 'test-data'), { recursive: true });
    await writeFile(
      join(workspace, 'test-data', 'sample.txt'),
      'NanoSwarm is a multi-agent framework built with TypeScript.',
    );
    await writeFile(
      join(workspace, 'test-data', 'editable.txt'),
      'Hello World from NanoSwarm',
    );
  });

  afterAll(async () => {
    await rm(workspace, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await rateLimitGuard();
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

  // -----------------------------------------------------------------------
  // Group 1: File Operations
  // -----------------------------------------------------------------------
  describe('File Operations', () => {
    it('should read a file and summarize its content', async () => {
      await agent.start();
      const tracker = trackTools(agent);

      const result = await agent.chat(
        'live-read',
        'Use the read_file tool to read the file at test-data/sample.txt and tell me what framework it mentions.',
      );

      expect(tracker.names).toContain('read_file');
      expect(result.text).toMatch(/NanoSwarm|nanoswarm|TypeScript|typescript/i);
      expect(result.finishReason).not.toBe('error');
    }, 30_000);

    it('should write a new file', async () => {
      await agent.start();
      const tracker = trackTools(agent);

      const result = await agent.chat(
        'live-write',
        'Use the write_file tool to create a file at test-data/output.txt with the exact content: LIVE_WRITE_TEST_OK',
      );

      expect(tracker.names).toContain('write_file');
      expect(result.finishReason).not.toBe('error');

      const filePath = join(workspace, 'test-data', 'output.txt');
      expect(await fileExists(filePath)).toBe(true);
      const content = await readFileContent(filePath);
      expect(content).toContain('LIVE_WRITE_TEST_OK');
    }, 30_000);

    it('should edit an existing file', async () => {
      // Reset editable.txt before this test
      await writeFile(join(workspace, 'test-data', 'editable.txt'), 'Hello World from NanoSwarm');
      await agent.start();
      const tracker = trackTools(agent);

      const result = await agent.chat(
        'live-edit',
        'Use the edit_file tool to edit the file at test-data/editable.txt. Replace "Hello World" with "Greetings Universe".',
      );

      expect(tracker.names).toContain('edit_file');
      expect(result.finishReason).not.toBe('error');

      const content = await readFileContent(join(workspace, 'test-data', 'editable.txt'));
      expect(content).toContain('Greetings Universe');
      expect(content).not.toContain('Hello World');
    }, 30_000);
  });

  // -----------------------------------------------------------------------
  // Group 2: Shell Execution
  // -----------------------------------------------------------------------
  describe('Shell Execution', () => {
    it('should execute a shell command', async () => {
      await agent.start();
      const tracker = trackTools(agent);

      const result = await agent.chat(
        'live-exec',
        'Use the exec tool to run this shell command: echo LIVE_SHELL_TEST',
      );

      expect(tracker.names).toContain('exec');
      expect(result.text).toContain('LIVE_SHELL_TEST');
      expect(result.finishReason).not.toBe('error');
    }, 30_000);
  });

  // -----------------------------------------------------------------------
  // Group 3: Error Recovery
  // -----------------------------------------------------------------------
  describe('Error Recovery', () => {
    it('should handle reading a non-existent file gracefully', async () => {
      await agent.start();

      const result = await agent.chat(
        'live-error',
        'Use the read_file tool to read the file at test-data/this_file_does_not_exist_xyz.txt and tell me what happened.',
      );

      expect(result.finishReason).not.toBe('error');
      // Agent should explain the file was not found
      expect(result.text).toMatch(/not found|does not exist|no such file|couldn't find|error|failed/i);
    }, 30_000);
  });

  // -----------------------------------------------------------------------
  // Group 4: Multi-turn Conversation
  // -----------------------------------------------------------------------
  describe('Multi-turn Conversation', () => {
    it('should maintain context across turns', async () => {
      await agent.start();

      // Turn 1: tell the agent a fact
      const turn1 = await agent.chat(
        'live-multi',
        'Remember this: my favorite color is cerulean. Just confirm you understood.',
      );
      expect(turn1.finishReason).not.toBe('error');

      // Turn 2: ask about the fact, passing conversation history
      const turn2 = await agent.chat(
        'live-multi',
        'What is my favorite color?',
        [
          { role: 'user', content: 'Remember this: my favorite color is cerulean. Just confirm you understood.' },
          { role: 'assistant', content: turn1.text },
        ],
      );

      expect(turn2.text.toLowerCase()).toContain('cerulean');
    }, 60_000);
  });

  // -----------------------------------------------------------------------
  // Group 6: Memory Consolidation
  // -----------------------------------------------------------------------
  describe('Memory Consolidation', () => {
    it('should consolidate memory on /new command', async () => {
      await agent.start();
      const contextId = 'live-consolidate';

      // Step 1: chat to establish a fact
      const chat1 = await agent.chat(
        contextId,
        'Remember: my codename is PHOENIX. Just confirm.',
      );
      expect(chat1.finishReason).not.toBe('error');

      // Step 2: send /new with history to trigger consolidation
      const result = await agent.chat(
        contextId,
        '/new',
        [
          { role: 'user', content: 'Remember: my codename is PHOENIX. Just confirm.' },
          { role: 'assistant', content: chat1.text },
        ],
      );

      expect(result.finishReason).toBe('command');
      expect(result.text).toContain('consolidated');

      // Verify memory was persisted (per-contextId path)
      const memoryPath = join(workspace, '.nanoswarm', 'memory', contextId, 'MEMORY.md');
      const historyPath = join(workspace, '.nanoswarm', 'memory', contextId, 'HISTORY.md');

      // Memory file should exist and contain PHOENIX
      expect(await fileExists(memoryPath)).toBe(true);
      const memContent = await readFileContent(memoryPath);
      expect(memContent.toUpperCase()).toContain('PHOENIX');

      // History file should have at least 1 entry
      expect(await fileExists(historyPath)).toBe(true);
      const histContent = await readFileContent(historyPath);
      expect(histContent.trim().length).toBeGreaterThan(0);
    }, 60_000);
  });

  // -----------------------------------------------------------------------
  // Group 8: Subagent + File Write
  // -----------------------------------------------------------------------
  describe('Subagent File Write', () => {
    it('should spawn a subagent that writes a file', async () => {
      await agent.start();

      const finishEvents: any[] = [];
      agent.eventBus.on('subagent-finish', (e) => finishEvents.push(e));

      const result = await agent.chat(
        'live-subagent-write',
        'Call the spawn tool with task="Use the write_file tool to create a file at test-data/subagent-output.txt with the exact content: SUBAGENT_WRITE_OK" label="file-writer"',
      );

      const spawnCalled = result.toolCalls.some((tc) => tc.toolName === 'spawn');
      expect(spawnCalled).toBe(true);

      // Wait for subagent to finish
      const finished = await waitFor(() => finishEvents.length > 0, 45_000);
      expect(finished).toBe(true);

      // Verify the file was written
      const filePath = join(workspace, 'test-data', 'subagent-output.txt');
      expect(await fileExists(filePath)).toBe(true);
      const content = await readFileContent(filePath);
      expect(content).toContain('SUBAGENT_WRITE_OK');
    }, 60_000);
  });
});

// ---------------------------------------------------------------------------
// Live Agent — Cron (independent describe, cronEnabled: true)
// ---------------------------------------------------------------------------

describe.if(!SKIP)('Live Agent — Cron', () => {
  let workspace: string;
  let agent: Agent;

  beforeAll(async () => {
    workspace = await mkdtemp(join(tmpdir(), 'nanoswarm-cron-'));
    await writeFile(join(workspace, 'SOUL.md'), 'You are a helpful assistant. Follow instructions exactly.');
    await mkdir(join(workspace, '.nanoswarm', 'memory'), { recursive: true });
    await writeFile(join(workspace, '.nanoswarm', 'memory', 'MEMORY.md'), '');
    await writeFile(join(workspace, '.nanoswarm', 'memory', 'HISTORY.md'), '');
  });

  afterAll(async () => {
    await rm(workspace, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await rateLimitGuard();
    agent = new Agent({
      model: createModel(),
      workspace,
      heartbeatEnabled: false,
      cronEnabled: true,
      maxIterations: 5,
      temperature: 0,
    });
  });

  afterEach(async () => {
    await agent.stop();
  });

  it('should schedule a cron job via the cron tool', async () => {
    await agent.start();
    const tracker = trackTools(agent);

    const result = await agent.chat(
      'live-cron',
      'Use the cron tool to add a recurring job that runs every 5 seconds with the message "health check ping". Use action "add" and every_seconds 5.',
    );

    expect(tracker.names).toContain('cron');
    expect(result.finishReason).not.toBe('error');

    const status = agent.getStatus();
    expect(status.cronJobs).toBeGreaterThanOrEqual(1);
  }, 60_000);
});

// ---------------------------------------------------------------------------
// Live Agent — Personality (independent workspace with pirate SOUL.md)
// ---------------------------------------------------------------------------

describe.if(!SKIP)('Live Agent — Personality', () => {
  let workspace: string;
  let agent: Agent;

  beforeAll(async () => {
    workspace = await mkdtemp(join(tmpdir(), 'nanoswarm-personality-'));
    await writeFile(
      join(workspace, 'SOUL.md'),
      [
        'You are a pirate assistant. You ALWAYS speak like a pirate.',
        'Use words like "ahoy", "matey", "aye", "arr" in every response.',
        'Never break character. You are a pirate through and through.',
      ].join('\n'),
    );
    await mkdir(join(workspace, '.nanoswarm', 'memory'), { recursive: true });
    await writeFile(join(workspace, '.nanoswarm', 'memory', 'MEMORY.md'), '');
    await writeFile(join(workspace, '.nanoswarm', 'memory', 'HISTORY.md'), '');
  });

  afterAll(async () => {
    await rm(workspace, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await rateLimitGuard();
    agent = new Agent({
      model: createModel(),
      workspace,
      heartbeatEnabled: false,
      cronEnabled: false,
      maxIterations: 5,
      temperature: 0,
    });
  });

  afterEach(async () => {
    await agent.stop();
  });

  it('should reflect SOUL.md personality in responses', async () => {
    await agent.start();

    const result = await agent.chat(
      'live-personality',
      'Introduce yourself briefly.',
    );

    expect(result.finishReason).not.toBe('error');
    // Check for pirate-like language
    const text = result.text.toLowerCase();
    const pirateKeywords = ['ahoy', 'matey', 'aye', 'arr', 'pirate'];
    const hasPirateLanguage = pirateKeywords.some((kw) => text.includes(kw));
    expect(hasPirateLanguage).toBe(true);
  }, 30_000);
});

// Visible skip message when no API key
if (SKIP) {
  describe('Live Agent Integration', () => {
    it.skip('SKIPPED — no GEMINI_API_KEY (set env var or add to ~/.nanoswarm/config.json)', () => {});
  });
}
