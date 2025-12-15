import { IpcMain } from 'electron';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import Store from 'electron-store';
import type { MCPServer, MCPStdioConfig, MCPSSEConfig, AppSettings } from '../../shared/types';

interface MCPConnection {
  client: Client;
  transport: StdioClientTransport | SSEClientTransport;
  status: 'connected' | 'disconnected' | 'error';
}

const connections = new Map<string, MCPConnection>();
const store = new Store<AppSettings>();

export function setupMCPHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('mcp:connect', async (_event, serverId: string) => {
    const servers = store.get('mcpServers') || [];
    const server = servers.find((s) => s.id === serverId);
    
    if (!server) {
      return { success: false, reason: 'Server not found' };
    }

    if (connections.has(serverId)) {
      return { success: true, message: 'Already connected' };
    }

    try {
      const client = new Client({
        name: 'navreach',
        version: '1.0.0',
      }, {
        capabilities: {},
      });

      let transport: StdioClientTransport | SSEClientTransport;

      if (server.type === 'stdio') {
        const config = server.config as MCPStdioConfig;
        transport = new StdioClientTransport({
          command: config.command,
          args: config.args,
          env: config.env,
        });
      } else {
        const config = server.config as MCPSSEConfig;
        transport = new SSEClientTransport(new URL(config.url));
      }

      await client.connect(transport);

      connections.set(serverId, {
        client,
        transport,
        status: 'connected',
      });

      return { success: true };
    } catch (error) {
      return { success: false, reason: String(error) };
    }
  });

  ipcMain.handle('mcp:disconnect', async (_event, serverId: string) => {
    const connection = connections.get(serverId);
    if (!connection) {
      return { success: false, reason: 'Not connected' };
    }

    try {
      await connection.client.close();
      connections.delete(serverId);
      return { success: true };
    } catch (error) {
      return { success: false, reason: String(error) };
    }
  });

  ipcMain.handle('mcp:list-tools', async (_event, serverId: string) => {
    const connection = connections.get(serverId);
    if (!connection) {
      return { success: false, reason: 'Not connected' };
    }

    try {
      const tools = await connection.client.listTools();
      return { success: true, tools: tools.tools };
    } catch (error) {
      return { success: false, reason: String(error) };
    }
  });

  ipcMain.handle('mcp:call-tool', async (_event, serverId: string, toolName: string, args: Record<string, unknown>) => {
    const connection = connections.get(serverId);
    if (!connection) {
      return { success: false, reason: 'Not connected' };
    }

    try {
      const result = await connection.client.callTool({
        name: toolName,
        arguments: args,
      });
      return { success: true, result };
    } catch (error) {
      return { success: false, reason: String(error) };
    }
  });

  ipcMain.handle('mcp:get-status', async (_event, serverId: string) => {
    const connection = connections.get(serverId);
    if (!connection) {
      return { status: 'disconnected' };
    }
    return { status: connection.status };
  });

  ipcMain.handle('mcp:get-all-statuses', async () => {
    const statuses: Record<string, string> = {};
    connections.forEach((conn, id) => {
      statuses[id] = conn.status;
    });
    return statuses;
  });
}
