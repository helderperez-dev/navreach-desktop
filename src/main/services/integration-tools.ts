import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
import Store from 'electron-store';
import type { AppSettings } from '../../shared/types';
import { mcpService } from './mcp';

const store = new Store<AppSettings>({
    name: 'settings',
});

export function createIntegrationTools(): DynamicStructuredTool[] {
    const getMcpServersTool = new DynamicStructuredTool({
        name: 'db_get_mcp_servers',
        description: 'Fetch all configured MCP (Model Context Protocol) servers.',
        schema: z.object({
            refresh: z.boolean().nullable().describe('Whether to refresh. Always pass true.').default(null)
        }),
        func: async () => {
            try {
                const servers = store.get('mcpServers') || [];
                return JSON.stringify({ success: true, servers });
            } catch (error: any) {
                return JSON.stringify({ success: false, error: error.message || String(error) });
            }
        },
    });

    const getMcpToolsTool = new DynamicStructuredTool({
        name: 'mcp_list_tools',
        description: 'List all available tools for a specific MCP server.',
        schema: z.object({
            server_id: z.string().describe('The ID of the MCP server to list tools from'),
        }),
        func: async ({ server_id }) => {
            try {
                const tools = await mcpService.listTools(server_id);
                return JSON.stringify({ success: true, tools });
            } catch (error: any) {
                return JSON.stringify({ success: false, error: error.message || String(error) });
            }
        },
    });

    const callMcpTool = new DynamicStructuredTool({
        name: 'mcp_call_tool',
        description: 'Call a specific tool on an MCP server.',
        schema: z.object({
            server_id: z.string().describe('The ID of the MCP server'),
            tool_name: z.string().describe('The name of the tool to call'),
            arguments_json: z.string().nullable().describe('The arguments to pass to the tool as a JSON string. Pass "{}" if no arguments are needed.').default(null),
        }),
        func: async ({ server_id, tool_name, arguments_json }) => {
            try {
                const args = JSON.parse(arguments_json || '{}');
                const result = await mcpService.callTool(server_id, tool_name, args);
                return JSON.stringify({ success: true, result });
            } catch (error: any) {
                return JSON.stringify({ success: false, error: error.message || String(error) });
            }
        },
    });

    const getApiToolsTool = new DynamicStructuredTool({
        name: 'db_get_api_tools',
        description: 'Fetch all configured API tools.',
        schema: z.object({
            refresh: z.boolean().nullable().describe('Whether to refresh. Always pass true.').default(null)
        }),
        func: async () => {
            try {
                const tools = store.get('apiTools') || [];
                return JSON.stringify({ success: true, tools });
            } catch (error: any) {
                return JSON.stringify({ success: false, error: error.message || String(error) });
            }
        },
    });

    const callApiTool = new DynamicStructuredTool({
        name: 'api_call_tool',
        description: 'Call a configured API tool by passing its arguments.',
        schema: z.object({
            tool_id: z.string().describe('The ID of the API tool to call'),
            arguments_json: z.string().nullable().describe('JSON string of arguments for the API call. Pass "{}" for none.').default(null),
        }),
        func: async ({ tool_id, arguments_json }) => {
            try {
                const args = JSON.parse(arguments_json || '{}');
                const tools = store.get('apiTools') || [];
                const tool = tools.find(t => t.id === tool_id);
                if (!tool) throw new Error('API Tool not found');

                // Basic implementation of API call
                const response = await fetch(tool.endpoint, {
                    method: tool.method || 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(tool.headers || {}),
                    },
                    body: JSON.stringify(args || {}),
                });

                const data = await response.json();
                return JSON.stringify({ success: true, data });
            } catch (error: any) {
                return JSON.stringify({ success: false, error: error.message || String(error) });
            }
        },
    });

    return [getMcpServersTool, getMcpToolsTool, callMcpTool, getApiToolsTool, callApiTool];
}
