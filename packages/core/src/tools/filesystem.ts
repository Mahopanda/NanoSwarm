import { z } from 'zod';
import { resolve, join, dirname, relative } from 'node:path';
import { readdir, mkdir } from 'node:fs/promises';
import type { NanoTool, ToolContext } from './base.ts';

function resolvePath(filePath: string, context: ToolContext): string {
  // Expand ~
  const expanded = filePath.startsWith('~/')
    ? join(process.env.HOME || '', filePath.slice(2))
    : filePath;

  // Resolve relative paths against workspace
  const resolved = resolve(context.workspace, expanded);

  // Check allowedDir restriction
  if (context.allowedDir) {
    const allowedAbs = resolve(context.allowedDir);
    const rel = relative(allowedAbs, resolved);
    if (rel.startsWith('..') || resolve(resolved) !== resolve(allowedAbs, rel)) {
      throw new Error(`Path "${filePath}" is outside allowed directory "${context.allowedDir}"`);
    }
  }

  return resolved;
}

function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;

  const len = Math.max(a.length, b.length);
  let matches = 0;

  // Simple sliding window character-level comparison
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;

  // Try to find the best alignment
  let bestScore = 0;
  for (let offset = 0; offset <= longer.length - shorter.length; offset++) {
    let score = 0;
    for (let i = 0; i < shorter.length; i++) {
      if (shorter[i] === longer[offset + i]) {
        score++;
      }
    }
    bestScore = Math.max(bestScore, score);
  }

  return bestScore / len;
}

function findMostSimilar(content: string, target: string): { snippet: string; score: number } {
  const targetLen = target.length;
  if (targetLen === 0) return { snippet: '', score: 0 };

  let bestScore = 0;
  let bestStart = 0;
  const windowSize = Math.min(targetLen + 20, content.length);

  for (let i = 0; i <= content.length - targetLen; i++) {
    const window = content.slice(i, i + targetLen);
    const score = similarity(window, target);
    if (score > bestScore) {
      bestScore = score;
      bestStart = i;
    }
  }

  // Expand context around the best match
  const contextStart = Math.max(0, bestStart - 10);
  const contextEnd = Math.min(content.length, bestStart + targetLen + 10);
  return { snippet: content.slice(contextStart, contextEnd), score: bestScore };
}

export function createReadFileTool(): NanoTool {
  return {
    name: 'read_file',
    description: 'Read the contents of a file at the given path. Returns the file content as UTF-8 text.',
    parameters: z.object({
      path: z.string().describe('Path to the file to read'),
    }),
    execute: async (params: { path: string }, context: ToolContext): Promise<string> => {
      const resolved = resolvePath(params.path, context);
      const file = Bun.file(resolved);
      if (!(await file.exists())) {
        return `Error: File not found: ${params.path}`;
      }
      return await file.text();
    },
  };
}

export function createWriteFileTool(): NanoTool {
  return {
    name: 'write_file',
    description: 'Write content to a file at the given path. Creates parent directories automatically.',
    parameters: z.object({
      path: z.string().describe('Path to the file to write'),
      content: z.string().describe('Content to write to the file'),
    }),
    execute: async (params: { path: string; content: string }, context: ToolContext): Promise<string> => {
      const resolved = resolvePath(params.path, context);
      await mkdir(dirname(resolved), { recursive: true });
      await Bun.write(resolved, params.content);
      return `Successfully wrote to ${params.path}`;
    },
  };
}

export function createEditFileTool(): NanoTool {
  return {
    name: 'edit_file',
    description: 'Edit a file by replacing old_text with new_text. The old_text must match exactly.',
    parameters: z.object({
      path: z.string().describe('Path to the file to edit'),
      old_text: z.string().describe('Text to find and replace'),
      new_text: z.string().describe('Replacement text'),
    }),
    execute: async (params: { path: string; old_text: string; new_text: string }, context: ToolContext): Promise<string> => {
      const resolved = resolvePath(params.path, context);
      const file = Bun.file(resolved);
      if (!(await file.exists())) {
        return `Error: File not found: ${params.path}`;
      }

      const content = await file.text();
      const occurrences = content.split(params.old_text).length - 1;

      if (occurrences === 0) {
        const { snippet, score } = findMostSimilar(content, params.old_text);
        return (
          `Error: old_text not found in ${params.path}.\n` +
          `Most similar snippet (similarity: ${(score * 100).toFixed(0)}%):\n` +
          `---\n${snippet}\n---\n` +
          `Please verify the exact text and try again.`
        );
      }

      if (occurrences > 1) {
        return (
          `Error: old_text appears ${occurrences} times in ${params.path}. ` +
          `Please provide more context to make the match unique.`
        );
      }

      const newContent = content.replace(params.old_text, params.new_text);
      await Bun.write(resolved, newContent);
      return `Successfully edited ${params.path}`;
    },
  };
}

export function createListDirTool(): NanoTool {
  return {
    name: 'list_dir',
    description: 'List the contents of a directory. Shows [dir] and [file] prefixes.',
    parameters: z.object({
      path: z.string().describe('Path to the directory to list').default('.'),
    }),
    execute: async (params: { path: string }, context: ToolContext): Promise<string> => {
      const resolved = resolvePath(params.path, context);
      const entries = await readdir(resolved, { withFileTypes: true });
      const sorted = entries.sort((a, b) => a.name.localeCompare(b.name));
      const lines = sorted.map((entry) => {
        const prefix = entry.isDirectory() ? '[dir]' : '[file]';
        return `${prefix}  ${entry.name}`;
      });
      return lines.join('\n');
    },
  };
}
