import { join } from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

export interface MemoryStore {
  getMemory(contextId: string): Promise<string | null>;
  saveMemory(contextId: string, content: string): Promise<void>;
}

export class FileMemoryStore implements MemoryStore {
  constructor(private workspace: string) {}

  private memoryPath(contextId: string): string {
    return join(this.workspace, '.nanoswarm', 'memory', contextId, 'MEMORY.md');
  }

  async getMemory(contextId: string): Promise<string | null> {
    try {
      return await readFile(this.memoryPath(contextId), 'utf-8');
    } catch {
      return null;
    }
  }

  async saveMemory(contextId: string, content: string): Promise<void> {
    const filePath = this.memoryPath(contextId);
    await mkdir(join(filePath, '..'), { recursive: true });
    await writeFile(filePath, content, 'utf-8');
  }
}
