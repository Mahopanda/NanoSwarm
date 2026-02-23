import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { ToolRegistry } from '../tools/registry.ts';
import type { MCPServerConfig, MCPConnection, MCPToolDefinition } from './types.ts';
import { MCPToolWrapper } from './tool-wrapper.ts';

export async function connectMCPServers(
  servers: Record<string, MCPServerConfig>,
  registry: ToolRegistry,
): Promise<MCPConnection[]> {
  const connections: MCPConnection[] = [];

  for (const [name, config] of Object.entries(servers)) {
    try {
      const connection = await connectSingle(name, config, registry);
      connections.push(connection);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[MCP] Failed to connect to "${name}": ${msg}`);
    }
  }

  return connections;
}

async function connectSingle(
  name: string,
  config: MCPServerConfig,
  registry: ToolRegistry,
): Promise<MCPConnection> {
  const client = new Client({ name: `nanoswarm-${name}`, version: '1.0.0' });

  let transport;
  if (config.command) {
    transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: config.env,
    });
  } else if (config.url) {
    transport = new StreamableHTTPClientTransport(new URL(config.url));
  } else {
    throw new Error(`MCP server "${name}" must have either "command" or "url"`);
  }

  await client.connect(transport);

  const { tools } = await client.listTools();

  for (const toolDef of tools) {
    const wrapper = new MCPToolWrapper(name, toolDef as MCPToolDefinition, client);
    registry.register(wrapper);
  }

  return { serverName: name, client, toolCount: tools.length };
}

export async function disconnectMCPServers(
  connections: MCPConnection[],
  registry: ToolRegistry,
): Promise<void> {
  for (const conn of connections) {
    // Remove registered tools by prefix
    const prefix = `mcp_${conn.serverName}_`;
    for (const toolName of registry.toolNames) {
      if (toolName.startsWith(prefix)) {
        registry.unregister(toolName);
      }
    }

    // Close client (best-effort)
    try {
      await conn.client.close();
    } catch {
      // ignore close errors
    }
  }
}
