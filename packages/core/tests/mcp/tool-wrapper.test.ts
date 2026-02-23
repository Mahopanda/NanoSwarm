import { describe, it, expect } from 'bun:test';
import { MCPToolWrapper } from '../../src/mcp/tool-wrapper.ts';
import type { MCPToolDefinition } from '../../src/mcp/types.ts';
import type { ToolContext } from '../../src/tools/base.ts';

const testContext: ToolContext = {
  workspace: '/tmp/test',
  contextId: 'test-session',
};

function makeMockClient(callToolResult?: unknown, shouldThrow?: Error) {
  return {
    callTool: async (params: { name: string; arguments: unknown }) => {
      if (shouldThrow) throw shouldThrow;
      return callToolResult ?? { content: [{ type: 'text', text: 'ok' }] };
    },
    close: async () => {},
    connect: async () => {},
    listTools: async () => ({ tools: [] }),
  } as any;
}

const sampleToolDef: MCPToolDefinition = {
  name: 'read_file',
  description: 'Read a file from the filesystem',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string' },
    },
    required: ['path'],
  },
};

describe('MCPToolWrapper', () => {
  it('should create tool with prefixed name', () => {
    const client = makeMockClient();
    const wrapper = new MCPToolWrapper('filesystem', sampleToolDef, client);

    expect(wrapper.name).toBe('mcp_filesystem_read_file');
    expect(wrapper.description).toBe('Read a file from the filesystem');
  });

  it('should use default description when not provided', () => {
    const client = makeMockClient();
    const def: MCPToolDefinition = {
      name: 'my_tool',
      inputSchema: { type: 'object' },
    };
    const wrapper = new MCPToolWrapper('server', def, client);

    expect(wrapper.description).toBe('MCP tool: my_tool');
  });

  it('should convert inputSchema to Zod parameters', () => {
    const client = makeMockClient();
    const wrapper = new MCPToolWrapper('fs', sampleToolDef, client);

    // Parameters should be a Zod object schema
    const result = wrapper.parameters.parse({ path: '/tmp/test.txt' });
    expect(result).toEqual({ path: '/tmp/test.txt' });
  });

  it('should call MCP client with original tool name', async () => {
    let calledWith: { name: string; arguments: unknown } | null = null;
    const client = {
      callTool: async (params: { name: string; arguments: unknown }) => {
        calledWith = params;
        return { content: [{ type: 'text', text: 'file contents' }] };
      },
    } as any;

    const wrapper = new MCPToolWrapper('filesystem', sampleToolDef, client);
    await wrapper.execute({ path: '/tmp/test.txt' }, testContext);

    expect(calledWith).not.toBeNull();
    expect(calledWith!.name).toBe('read_file'); // original name, not prefixed
    expect(calledWith!.arguments).toEqual({ path: '/tmp/test.txt' });
  });

  it('should extract text from TextContent blocks', async () => {
    const client = makeMockClient({
      content: [
        { type: 'text', text: 'line 1' },
        { type: 'text', text: 'line 2' },
      ],
    });
    const wrapper = new MCPToolWrapper('server', sampleToolDef, client);
    const result = await wrapper.execute({ path: '/test' }, testContext);

    expect(result).toBe('line 1\nline 2');
  });

  it('should JSON stringify non-text content blocks', async () => {
    const imageBlock = { type: 'image', data: 'base64data', mimeType: 'image/png' };
    const client = makeMockClient({ content: [imageBlock] });
    const wrapper = new MCPToolWrapper('server', sampleToolDef, client);
    const result = await wrapper.execute({ path: '/test' }, testContext);

    expect(result).toBe(JSON.stringify(imageBlock));
  });

  it('should return empty string for empty content', async () => {
    const client = makeMockClient({ content: [] });
    const wrapper = new MCPToolWrapper('server', sampleToolDef, client);
    const result = await wrapper.execute({ path: '/test' }, testContext);

    expect(result).toBe('');
  });

  it('should return empty string for missing content', async () => {
    const client = makeMockClient({});
    const wrapper = new MCPToolWrapper('server', sampleToolDef, client);
    const result = await wrapper.execute({ path: '/test' }, testContext);

    expect(result).toBe('');
  });

  it('should return error string when callTool throws', async () => {
    const client = makeMockClient(undefined, new Error('Connection lost'));
    const wrapper = new MCPToolWrapper('server', sampleToolDef, client);
    const result = await wrapper.execute({ path: '/test' }, testContext);

    expect(result).toBe('[MCP Error] read_file: Connection lost');
  });

  it('should handle non-Error throws', async () => {
    const client = {
      callTool: async () => { throw 'string error'; },
    } as any;
    const wrapper = new MCPToolWrapper('server', sampleToolDef, client);
    const result = await wrapper.execute({ path: '/test' }, testContext);

    expect(result).toBe('[MCP Error] read_file: string error');
  });
});
