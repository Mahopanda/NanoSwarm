import { describe, it, expect } from 'bun:test';
import { createExecTool } from '../../src/tools/shell.ts';
import type { ToolContext } from '../../src/tools/base.ts';

const context: ToolContext = {
  workspace: '/tmp',
  contextId: 'test',
};

describe('exec', () => {
  const tool = createExecTool();

  it('should execute a simple command', async () => {
    const result = await tool.execute({ command: 'echo hello' }, context);
    expect(result).toContain('hello');
    expect(result).toContain('Exit code: 0');
  });

  it('should capture stderr', async () => {
    const result = await tool.execute({ command: 'echo err >&2' }, context);
    expect(result).toContain('STDERR:');
    expect(result).toContain('err');
  });

  it('should report non-zero exit code', async () => {
    const result = await tool.execute({ command: 'exit 42' }, context);
    expect(result).toContain('Exit code: 42');
  });

  it('should block dangerous commands (rm -rf /)', async () => {
    const result = await tool.execute({ command: 'rm -rf /' }, context);
    expect(result).toContain('Error: Command blocked');
  });

  it('should block shutdown', async () => {
    const result = await tool.execute({ command: 'shutdown -h now' }, context);
    expect(result).toContain('Error: Command blocked');
  });

  it('should block reboot', async () => {
    const result = await tool.execute({ command: 'reboot' }, context);
    expect(result).toContain('Error: Command blocked');
  });

  it('should handle timeout', async () => {
    const quickTool = createExecTool({ timeout: 100 });
    const result = await quickTool.execute({ command: 'sleep 10' }, context);
    expect(result).toContain('timed out');
  });

  it('should truncate long output', async () => {
    const shortTool = createExecTool({ maxOutputLength: 50 });
    const result = await shortTool.execute(
      { command: 'yes | head -1000' },
      context,
    );
    expect(result).toContain('truncated');
  });

  it('should enforce allow patterns', async () => {
    const restricted = createExecTool({
      allowPatterns: [/^echo/],
    });
    const ok = await restricted.execute({ command: 'echo hi' }, context);
    expect(ok).toContain('hi');

    const blocked = await restricted.execute({ command: 'ls' }, context);
    expect(blocked).toContain('Error: Command not in allow list');
  });
});
