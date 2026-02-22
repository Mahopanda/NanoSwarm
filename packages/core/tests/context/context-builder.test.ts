import { describe, it, expect, beforeEach } from 'bun:test';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ContextBuilder } from '../../src/context/context-builder.ts';
import { SkillLoader } from '../../src/skills/loader.ts';
import { FileMemoryStore } from '../../src/memory/memory-store.ts';

describe('ContextBuilder', () => {
  let workspace: string;
  let skillLoader: SkillLoader;
  let memoryStore: FileMemoryStore;
  let builder: ContextBuilder;

  beforeEach(async () => {
    workspace = await mkdtemp(join(tmpdir(), 'nanoswarm-ctx-'));
    const nsDir = join(workspace, '.nanoswarm');
    await mkdir(nsDir, { recursive: true });

    skillLoader = new SkillLoader();
    memoryStore = new FileMemoryStore(workspace);
    builder = new ContextBuilder(workspace, skillLoader, memoryStore);
  });

  it('should include core identity in system prompt', async () => {
    const prompt = await builder.buildSystemPrompt('ctx1');
    expect(prompt).toContain('## Core Identity');
    expect(prompt).toContain('NanoSwarm agent');
    expect(prompt).toContain(workspace);
  });

  it('should include bootstrap files when present', async () => {
    const nsDir = join(workspace, '.nanoswarm');
    await writeFile(join(nsDir, 'SOUL.md'), 'You are a helpful assistant.', 'utf-8');
    await writeFile(join(nsDir, 'TOOLS.md'), 'Available tools: read_file', 'utf-8');

    const prompt = await builder.buildSystemPrompt('ctx1');
    expect(prompt).toContain('## SOUL.md');
    expect(prompt).toContain('You are a helpful assistant.');
    expect(prompt).toContain('## TOOLS.md');
    expect(prompt).toContain('Available tools: read_file');
  });

  it('should skip missing bootstrap files', async () => {
    const prompt = await builder.buildSystemPrompt('ctx1');
    expect(prompt).not.toContain('## SOUL.md');
    expect(prompt).not.toContain('## AGENTS.md');
  });

  it('should include memory when present', async () => {
    await memoryStore.saveMemory('ctx1', 'User prefers concise answers.');

    const prompt = await builder.buildSystemPrompt('ctx1');
    expect(prompt).toContain('## Memory');
    expect(prompt).toContain('User prefers concise answers.');
  });

  it('should include always-load skills', async () => {
    const skillsDir = join(workspace, '.nanoswarm', 'skills');
    await mkdir(join(skillsDir, 'greet'), { recursive: true });
    await writeFile(
      join(skillsDir, 'greet', 'SKILL.md'),
      '---\nname: Greet\nalwaysLoad: true\n---\nGreeting instructions.',
      'utf-8',
    );
    await skillLoader.loadAll(skillsDir);

    const prompt = await builder.buildSystemPrompt('ctx1');
    expect(prompt).toContain('## Skills');
    expect(prompt).toContain('Greeting instructions.');
  });

  it('should include on-demand skills summary', async () => {
    const skillsDir = join(workspace, '.nanoswarm', 'skills');
    await mkdir(join(skillsDir, 'search'), { recursive: true });
    await writeFile(
      join(skillsDir, 'search', 'SKILL.md'),
      '---\nname: Search\ndescription: Search the web\nalwaysLoad: false\n---\nSearch instructions.',
      'utf-8',
    );
    await skillLoader.loadAll(skillsDir);

    const prompt = await builder.buildSystemPrompt('ctx1');
    expect(prompt).toContain('## Available Skills');
    expect(prompt).toContain('<skills>');
    expect(prompt).toContain('<name>Search</name>');
  });

  it('should build correct section order', async () => {
    const nsDir = join(workspace, '.nanoswarm');
    await writeFile(join(nsDir, 'SOUL.md'), 'Soul content', 'utf-8');
    await memoryStore.saveMemory('ctx1', 'Memory content');

    const prompt = await builder.buildSystemPrompt('ctx1');
    const coreIdx = prompt.indexOf('## Core Identity');
    const soulIdx = prompt.indexOf('## SOUL.md');
    const memIdx = prompt.indexOf('## Memory');

    expect(coreIdx).toBeLessThan(soulIdx);
    expect(soulIdx).toBeLessThan(memIdx);
  });

  it('should build messages with history', async () => {
    const { system, messages } = await builder.buildMessages('ctx1', 'What is 1+1?', [
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello!' },
    ]);

    expect(system).toContain('## Core Identity');
    expect(messages).toHaveLength(3);
    expect(messages[0]).toEqual({ role: 'user', content: 'Hi' });
    expect(messages[1]).toEqual({ role: 'assistant', content: 'Hello!' });
    expect(messages[2]).toEqual({ role: 'user', content: 'What is 1+1?' });
  });

  it('should build messages without history', async () => {
    const { messages } = await builder.buildMessages('ctx1', 'Hello');

    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({ role: 'user', content: 'Hello' });
  });
});
