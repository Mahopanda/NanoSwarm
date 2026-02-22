import { describe, it, expect } from 'bun:test';
import { z } from 'zod';
import { ToolRegistry } from '../../src/tools/registry.ts';
import { toAITool } from '../../src/tools/base.ts';
import type { NanoTool, ToolContext } from '../../src/tools/base.ts';

function makeTool(name: string): NanoTool {
  return {
    name,
    description: `Test tool: ${name}`,
    parameters: z.object({ input: z.string() }),
    execute: async (params: { input: string }) => `result: ${params.input}`,
  };
}

const testContext: ToolContext = {
  workspace: '/tmp/test',
  contextId: 'test-session',
};

describe('ToolRegistry', () => {
  it('should register and retrieve tools', () => {
    const registry = new ToolRegistry();
    const tool = makeTool('test_tool');
    registry.register(tool);

    expect(registry.has('test_tool')).toBe(true);
    expect(registry.get('test_tool')).toBe(tool);
    expect(registry.size).toBe(1);
    expect(registry.toolNames).toEqual(['test_tool']);
  });

  it('should unregister tools', () => {
    const registry = new ToolRegistry();
    registry.register(makeTool('a'));
    registry.register(makeTool('b'));
    expect(registry.size).toBe(2);

    registry.unregister('a');
    expect(registry.has('a')).toBe(false);
    expect(registry.size).toBe(1);
  });

  it('should return undefined for unknown tools', () => {
    const registry = new ToolRegistry();
    expect(registry.get('nonexistent')).toBeUndefined();
    expect(registry.has('nonexistent')).toBe(false);
  });

  it('should overwrite on re-register', () => {
    const registry = new ToolRegistry();
    const tool1 = makeTool('x');
    const tool2 = makeTool('x');
    registry.register(tool1);
    registry.register(tool2);
    expect(registry.size).toBe(1);
    expect(registry.get('x')).toBe(tool2);
  });

  it('should produce AI SDK tools via getAITools()', () => {
    const registry = new ToolRegistry();
    registry.register(makeTool('alpha'));
    registry.register(makeTool('beta'));

    const aiTools = registry.getAITools(testContext);
    expect(Object.keys(aiTools)).toEqual(['alpha', 'beta']);
    // Each value should be an AI SDK tool object (has execute and parameters)
    expect(aiTools.alpha).toBeDefined();
    expect(aiTools.beta).toBeDefined();
  });
});

describe('toAITool', () => {
  it('should convert NanoTool to AI SDK tool', async () => {
    const nanoTool = makeTool('converter_test');
    const aiTool = toAITool(nanoTool, testContext);
    expect(aiTool).toBeDefined();
    expect(aiTool.description).toBe('Test tool: converter_test');
  });
});
