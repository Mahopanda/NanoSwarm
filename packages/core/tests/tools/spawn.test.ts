import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { createSpawnTool } from '../../src/tools/spawn.ts';
import type { SubagentManager } from '../../src/agent/subagent-manager.ts';

describe('spawn tool', () => {
  let mockManager: SubagentManager;
  const mockSpawn = mock(async () => 'Subagent [test] started (id: abc12345)');

  beforeEach(() => {
    mockSpawn.mockClear();
    mockManager = {
      spawn: mockSpawn,
      getRunningCount: () => 0,
      getRunningTasks: () => [],
    } as unknown as SubagentManager;
  });

  it('should have correct tool metadata', () => {
    const tool = createSpawnTool(mockManager);
    expect(tool.name).toBe('spawn');
    expect(tool.description).toBeTruthy();
    expect(tool.parameters).toBeDefined();
  });

  it('should pass task and label to manager.spawn', async () => {
    const tool = createSpawnTool(mockManager);
    const result = await tool.execute(
      { task: 'Do something', label: 'my-task' },
      { workspace: '/test', contextId: 'ctx1' },
    );

    expect(mockSpawn).toHaveBeenCalledWith('Do something', 'my-task', 'ctx1');
    expect(result).toContain('Subagent [test] started');
  });

  it('should pass undefined label when not provided', async () => {
    const tool = createSpawnTool(mockManager);
    await tool.execute(
      { task: 'Do something' },
      { workspace: '/test', contextId: 'ctx2' },
    );

    expect(mockSpawn).toHaveBeenCalledWith('Do something', undefined, 'ctx2');
  });
});
