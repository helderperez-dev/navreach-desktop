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

class MCPService {
    private connections = new Map<string, MCPConnection>();
    private store = new Store<AppSettings>({ name: 'settings' });

    async connect(serverId: string) {
        const servers = this.store.get('mcpServers') || [];
        const server = servers.find((s) => s.id === serverId);

        if (!server) {
            throw new Error('Server not found');
        }

        if (this.connections.has(serverId)) {
            return;
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

            this.connections.set(serverId, {
                client,
                transport,
                status: 'connected',
            });
        } catch (error) {
            throw error;
        }
    }

    async disconnect(serverId: string) {
        const connection = this.connections.get(serverId);
        if (!connection) return;

        try {
            await connection.client.close();
            this.connections.delete(serverId);
        } catch (error) {
            throw error;
        }
    }

    async listTools(serverId: string) {
        const connection = this.connections.get(serverId);
        if (!connection) {
            // Try to auto-connect
            await this.connect(serverId);
        }
        const updatedConn = this.connections.get(serverId);
        if (!updatedConn) throw new Error('Not connected');

        const tools = await updatedConn.client.listTools();
        return tools.tools;
    }

    async callTool(serverId: string, toolName: string, args: Record<string, unknown>) {
        const connection = this.connections.get(serverId);
        if (!connection) {
            await this.connect(serverId);
        }
        const updatedConn = this.connections.get(serverId);
        if (!updatedConn) throw new Error('Not connected');

        return await updatedConn.client.callTool({
            name: toolName,
            arguments: args,
        });
    }

    getStatus(serverId: string) {
        const connection = this.connections.get(serverId);
        return connection ? connection.status : 'disconnected';
    }

    getAllStatuses() {
        const statuses: Record<string, string> = {};
        this.connections.forEach((conn, id) => {
            statuses[id] = conn.status;
        });
        return statuses;
    }
}

export const mcpService = new MCPService();
