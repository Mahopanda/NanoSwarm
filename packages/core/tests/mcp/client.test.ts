import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { z } from 'zod';
import { ToolRegistry } from '../../src/tools/registry.ts';
import type { MCPServerConfig } from '../../src/mcp/types.ts';

// Mock MCP SDK modules
const mockConnect = mock(() => Promise.resolve());
const mockClose = mock(() => Promise.resolve());
const mockListTools = mock(() =>
  Promise.resolve({
    tools: [
      {
        name: 'read_file',
        description: 'Read a file',
        inputSchema: {
          type: 'object' as const,
          properties: { path: { type: 'string' } },
          required: ['path'],
        },
      },
      {
        name: 'write_file',
        description: 'Write a file',
        inputSchema: {
          type: 'object' as const,
          properties: {
            path: { type: 'string' },
            content: { type: 'string' },
          },
          required: ['path', 'content'],
        },
      },
    ],
  }),
);

const mockCallTool = mock(() =>
  Promise.resolve({ content: [{ type: 'text', text: 'ok' }] }),
);

mock.module('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: class MockClient {
    connect = mockConnect;
    close = mockClose;
    listTools = mockListTools;
    callTool = mockCallTool;
  },
}));

mock.module('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: class MockStdioTransport {
    constructor(public params: any) {}
  },
}));

mock.module('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: class MockHttpTransport {
    constructor(public url: URL) {}
  },
}));

// Import after mocks
const { connectMCPServers, disconnectMCPServers } = await import(
  '../../src/mcp/client.ts'
);

describe('connectMCPServers', () => {
  beforeEach(() => {
    mockConnect.mockClear();
    mockClose.mockClear();
    mockListTools.mockClear();
    mockCallTool.mockClear();
  });

  it('should connect stdio server and register tools', async () => {
    const registry = new ToolRegistry();
    const servers: Record<string, MCPServerConfig> = {
      filesystem: { command: 'bunx', args: ['@mcp/filesystem'] },
    };

    const connections = await connectMCPServers(servers, registry);

    expect(connections).toHaveLength(1);
    expect(connections[0].serverName).toBe('filesystem');
    expect(connections[0].toolCount).toBe(2);
    expect(mockConnect).toHaveBeenCalled();
    expect(mockListTools).toHaveBeenCalled();
    expect(registry.has('mcp_filesystem_read_file')).toBe(true);
    expect(registry.has('mcp_filesystem_write_file')).toBe(true);
  });

  it('should connect HTTP server and register tools', async () => {
    const registry = new ToolRegistry();
    const servers: Record<string, MCPServerConfig> = {
      remote: { url: 'http://localhost:3001/mcp' },
    };

    const connections = await connectMCPServers(servers, registry);

    expect(connections).toHaveLength(1);
    expect(connections[0].serverName).toBe('remote');
    expect(connections[0].toolCount).toBe(2);
    expect(registry.has('mcp_remote_read_file')).toBe(true);
  });

  it('should handle connection failure without interrupting others', async () => {
    const registry = new ToolRegistry();
    // Temporarily make connect fail for first call
    let callCount = 0;
    mockConnect.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.reject(new Error('Connection refused'));
      return Promise.resolve();
    });

    const servers: Record<string, MCPServerConfig> = {
      broken: { command: 'nonexistent' },
      working: { url: 'http://localhost:3001/mcp' },
    };

    const connections = await connectMCPServers(servers, registry);

    // Only the working server should connect
    expect(connections).toHaveLength(1);
    expect(connections[0].serverName).toBe('working');
    // broken server tools should not be registered
    expect(registry.has('mcp_broken_read_file')).toBe(false);
    // working server tools should be registered
    expect(registry.has('mcp_working_read_file')).toBe(true);
  });

  it('should error when no command and no url', async () => {
    const registry = new ToolRegistry();
    const servers: Record<string, MCPServerConfig> = {
      invalid: {},
    };

    const connections = await connectMCPServers(servers, registry);

    // Should gracefully handle the error (log + continue)
    expect(connections).toHaveLength(0);
    expect(registry.size).toBe(0);
  });

  it('should connect multiple servers', async () => {
    mockConnect.mockImplementation(() => Promise.resolve());
    const registry = new ToolRegistry();
    const servers: Record<string, MCPServerConfig> = {
      fs: { command: 'bunx', args: ['@mcp/fs'] },
      web: { url: 'http://localhost:3002/mcp' },
    };

    const connections = await connectMCPServers(servers, registry);

    expect(connections).toHaveLength(2);
    expect(registry.has('mcp_fs_read_file')).toBe(true);
    expect(registry.has('mcp_web_read_file')).toBe(true);
  });
});

describe('disconnectMCPServers', () => {
  beforeEach(() => {
    mockConnect.mockImplementation(() => Promise.resolve());
    mockClose.mockClear();
  });

  it('should remove tools and close client', async () => {
    const registry = new ToolRegistry();
    const servers: Record<string, MCPServerConfig> = {
      filesystem: { command: 'bunx', args: ['@mcp/fs'] },
    };

    const connections = await connectMCPServers(servers, registry);
    expect(registry.has('mcp_filesystem_read_file')).toBe(true);
    expect(registry.has('mcp_filesystem_write_file')).toBe(true);

    await disconnectMCPServers(connections, registry);

    expect(registry.has('mcp_filesystem_read_file')).toBe(false);
    expect(registry.has('mcp_filesystem_write_file')).toBe(false);
    expect(mockClose).toHaveBeenCalled();
  });

  it('should not remove unrelated tools', async () => {
    const registry = new ToolRegistry();
    // Register a non-MCP tool
    registry.register({
      name: 'read_file',
      description: 'Built-in read',
      parameters: z.object({ path: z.string() }),
      execute: async () => 'ok',
    });

    const servers: Record<string, MCPServerConfig> = {
      fs: { command: 'bunx' },
    };

    const connections = await connectMCPServers(servers, registry);
    await disconnectMCPServers(connections, registry);

    // Built-in tool should still be there
    expect(registry.has('read_file')).toBe(true);
    // MCP tools should be removed
    expect(registry.has('mcp_fs_read_file')).toBe(false);
  });

  it('should handle close errors gracefully', async () => {
    mockClose.mockImplementation(() => Promise.reject(new Error('close failed')));

    const registry = new ToolRegistry();
    const servers: Record<string, MCPServerConfig> = {
      fs: { command: 'bunx' },
    };

    const connections = await connectMCPServers(servers, registry);

    // Should not throw
    await disconnectMCPServers(connections, registry);
    expect(registry.has('mcp_fs_read_file')).toBe(false);
  });
});
