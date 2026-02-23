import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SkillLoader } from '../skills/loader.ts';
import type { MemoryStore } from '../memory/memory-store.ts';

export interface ModelMessage {
  role: 'user' | 'assistant';
  content: string;
}

const BOOTSTRAP_FILES = ['SOUL.md', 'AGENTS.md', 'USER.md', 'TOOLS.md'] as const;

async function tryReadFile(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf-8');
  } catch {
    return null;
  }
}

export class ContextBuilder {
  constructor(
    public readonly workspacePath: string,
    private skillLoader: SkillLoader,
    private memoryStore: MemoryStore,
  ) {}

  async buildSystemPrompt(contextId: string): Promise<string> {
    const sections: string[] = [];

    // 1. Core identity
    sections.push(this.buildCoreIdentity());

    // 2. Bootstrap files
    for (const fileName of BOOTSTRAP_FILES) {
      const content = await tryReadFile(join(this.workspacePath, fileName));
      if (content) {
        sections.push(`## ${fileName}\n\n${content}`);
      }
    }

    // 3. Memory context (capped to prevent system prompt overflow)
    const MAX_MEMORY_CHARS = 8000; // ~2000 tokens
    let memory = await this.memoryStore.getMemory(contextId);
    if (memory) {
      if (memory.length > MAX_MEMORY_CHARS) {
        memory = memory.slice(0, MAX_MEMORY_CHARS) + '\n\n[... truncated]';
      }
      sections.push(`## Memory\n\n${memory}`);
    }

    // 4. Always-load skills
    const alwaysLoad = this.skillLoader.getAlwaysLoadContent();
    if (alwaysLoad) {
      sections.push(`## Skills\n\n${alwaysLoad}`);
    }

    // 5. Available skills summary
    const summary = this.skillLoader.getSkillsSummary();
    if (summary) {
      sections.push(`## Available Skills\n\n${summary}`);
    }

    return sections.join('\n\n');
  }

  async buildMessages(
    contextId: string,
    userMessage: string,
    history?: Array<{ role: 'user' | 'assistant'; content: string }>,
  ): Promise<{ system: string; messages: ModelMessage[] }> {
    const system = await this.buildSystemPrompt(contextId);

    const messages: ModelMessage[] = [];
    if (history) {
      for (const msg of history) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }
    messages.push({ role: 'user', content: userMessage });

    return { system, messages };
  }

  private buildCoreIdentity(): string {
    const now = new Date().toISOString();
    const platform = process.platform;
    return `## Core Identity

You are a NanoSwarm agent.

- Timestamp: ${now}
- Platform: ${platform}
- Workspace: ${this.workspacePath}`;
  }
}
