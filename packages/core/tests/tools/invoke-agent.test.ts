import { describe, it, expect, mock } from 'bun:test';
import { createInvokeAgentTool, type AgentResolver } from '../../src/tools/invoke-agent.ts';
import type { ToolContext } from '../../src/tools/base.ts';

const mockContext: ToolContext = {
  workspace: '/tmp/test',
  contextId: 'ctx-1',
};

function createMockResolver(agents: Array<{ id: string; name: string; description?: string }> = []): AgentResolver {
  return {
    list: mock(() => agents),
    invoke: mock(async (_agentId: string, _contextId: string, _text: string) => ({
      text: 'invoked response',
    })),
  };
}

describe('createInvokeAgentTool', () => {
  it('should create a tool with correct metadata', () => {
    const resolver = createMockResolver();
    const tool = createInvokeAgentTool(resolver);

    expect(tool.name).toBe('invoke_agent');
    expect(tool.description).toContain('Invoke another agent');
    expect(tool.parameters).toBeDefined();
  });

  describe('action: list', () => {
    it('should return agent list as JSON', async () => {
      const agents = [
        { id: 'coder', name: 'Coder', description: 'Writes code' },
        { id: 'writer', name: 'Writer' },
      ];
      const resolver = createMockResolver(agents);
      const tool = createInvokeAgentTool(resolver);

      const result = await tool.execute({ action: 'list' }, mockContext);
      const parsed = JSON.parse(result);

      expect(parsed).toHaveLength(2);
      expect(parsed[0].id).toBe('coder');
      expect(parsed[0].name).toBe('Coder');
      expect(parsed[1].id).toBe('writer');
    });

    it('should return empty array when no agents', async () => {
      const resolver = createMockResolver([]);
      const tool = createInvokeAgentTool(resolver);

      const result = await tool.execute({ action: 'list' }, mockContext);
      expect(JSON.parse(result)).toEqual([]);
    });
  });

  describe('action: invoke', () => {
    it('should invoke agent and return response text', async () => {
      const resolver = createMockResolver([{ id: 'ext-1', name: 'External' }]);
      const tool = createInvokeAgentTool(resolver);

      const result = await tool.execute(
        { action: 'invoke', agentId: 'ext-1', task: 'Summarize this document' },
        mockContext,
      );

      expect(result).toBe('invoked response');
      expect(resolver.invoke).toHaveBeenCalledWith('ext-1', 'ctx-1', 'Summarize this document');
    });

    it('should return error when agentId is missing', async () => {
      const resolver = createMockResolver();
      const tool = createInvokeAgentTool(resolver);

      const result = await tool.execute(
        { action: 'invoke', task: 'Do something' },
        mockContext,
      );

      expect(result).toContain('Error');
      expect(result).toContain('agentId');
    });

    it('should return error when task is missing', async () => {
      const resolver = createMockResolver();
      const tool = createInvokeAgentTool(resolver);

      const result = await tool.execute(
        { action: 'invoke', agentId: 'ext-1' },
        mockContext,
      );

      expect(result).toContain('Error');
      expect(result).toContain('task');
    });

    it('should propagate errors from resolver.invoke', async () => {
      const resolver = createMockResolver();
      (resolver.invoke as ReturnType<typeof mock>).mockRejectedValue(
        new Error('Agent not found: nonexistent'),
      );
      const tool = createInvokeAgentTool(resolver);

      await expect(
        tool.execute({ action: 'invoke', agentId: 'nonexistent', task: 'test' }, mockContext),
      ).rejects.toThrow('Agent not found: nonexistent');
    });
  });
});
