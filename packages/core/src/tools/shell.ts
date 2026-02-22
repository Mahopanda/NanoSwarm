import { z } from 'zod';
import type { NanoTool, ToolContext } from './base.ts';

export interface ExecToolOptions {
  timeout?: number;
  denyPatterns?: RegExp[];
  allowPatterns?: RegExp[];
  restrictToWorkspace?: boolean;
  maxOutputLength?: number;
}

const DEFAULT_DENY_PATTERNS: RegExp[] = [
  /rm\s+-rf\s+[\/~]/,
  /\bformat\s+[a-zA-Z]:/,
  /\bmkfs\b/,
  /\bdd\s+if=/,
  /\bshutdown\b/,
  /\breboot\b/,
  /\bpoweroff\b/,
  /:\(\)\s*\{\s*:\|:\s*&\s*\}\s*;?\s*:/,  // fork bomb :(){ :|:& };:
  />\s*\/dev\/sd/,
  /\bchmod\s+-R\s+777\s+\//,
];

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + `\n... [truncated, ${text.length} total chars]`;
}

export function createExecTool(options: ExecToolOptions = {}): NanoTool {
  const {
    timeout = 60000,
    denyPatterns = DEFAULT_DENY_PATTERNS,
    allowPatterns,
    restrictToWorkspace = false,
    maxOutputLength = 10000,
  } = options;

  return {
    name: 'exec',
    description: 'Execute a shell command and return stdout, stderr, and exit code.',
    parameters: z.object({
      command: z.string().describe('Shell command to execute'),
    }),
    execute: async (params: { command: string }, context: ToolContext): Promise<string> => {
      const { command } = params;

      // Deny pattern check
      for (const pattern of denyPatterns) {
        if (pattern.test(command)) {
          return `Error: Command blocked by security policy. Matched deny pattern: ${pattern}`;
        }
      }

      // Allow pattern check (if set, only matching commands are allowed)
      if (allowPatterns && allowPatterns.length > 0) {
        const allowed = allowPatterns.some((pattern) => pattern.test(command));
        if (!allowed) {
          return `Error: Command not in allow list.`;
        }
      }

      const cwd = restrictToWorkspace ? context.workspace : context.workspace;

      const proc = Bun.spawn(['sh', '-c', command], {
        cwd: context.workspace,
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env },
      });

      // Race between process completion and timeout
      const timeoutPromise = new Promise<'timeout'>((resolve) => {
        setTimeout(() => resolve('timeout'), timeout);
      });

      const result = await Promise.race([
        proc.exited.then(() => 'done' as const),
        timeoutPromise,
      ]);

      if (result === 'timeout') {
        proc.kill();
        return `Error: Command timed out after ${timeout}ms`;
      }

      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      const exitCode = proc.exitCode;

      let output = stdout;
      if (stderr) {
        output += (output ? '\n' : '') + `STDERR:\n${stderr}`;
      }
      output += `\nExit code: ${exitCode}`;

      return truncate(output, maxOutputLength);
    },
  };
}
