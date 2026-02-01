import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
import Store from 'electron-store';
import type { AppSettings } from '../../shared/types';
import { mcpService } from './mcp';

const store = new Store<AppSettings>({
    name: 'settings',
});

export function createIntegrationTools(workspaceSettings?: {
    disabledTools?: string[];
    disabledMCPServers?: string[];
}, workspaceId?: string): DynamicStructuredTool[] {
    const getMcpServersTool = new DynamicStructuredTool({
        name: 'db_get_mcp_servers',
        description: 'Fetch all configured MCP (Model Context Protocol) servers.',
        schema: z.object({
            refresh: z.boolean().nullable().describe('Whether to refresh. Always pass true.').default(null)
        }),
        func: async () => {
            try {
                const servers = store.get('mcpServers') || [];
                const filtered = workspaceSettings?.disabledMCPServers
                    ? servers.filter(s => !workspaceSettings.disabledMCPServers?.includes(s.id))
                    : servers;
                return JSON.stringify({ success: true, servers: filtered });
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
                if (workspaceSettings?.disabledMCPServers?.includes(server_id)) {
                    throw new Error(`MCP Server "${server_id}" is disabled in this workspace.`);
                }
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
            arguments_json: z.any().describe('The arguments to pass to the tool. MUST be a JSON object (e.g. {"key": "value"}).').default({}),
        }),
        func: async ({ server_id, tool_name, arguments_json }) => {
            try {
                if (workspaceSettings?.disabledMCPServers?.includes(server_id)) {
                    throw new Error(`MCP Server "${server_id}" is disabled in this workspace.`);
                }
                let args = arguments_json;
                if (typeof arguments_json === 'string' && arguments_json.trim()) {
                    try {
                        args = JSON.parse(arguments_json);
                    } catch (e) {
                        return JSON.stringify({
                            success: false,
                            error: `Invalid JSON format for arguments_json. You passed a plain string "${arguments_json}" but I need a JSON object, e.g. {"query": "${arguments_json}"}. Please check the tool definition for the correct keys.`
                        });
                    }
                }
                const result = await mcpService.callTool(server_id, tool_name, args || {});
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
                const filtered = workspaceSettings?.disabledTools
                    ? tools.filter(t => !workspaceSettings.disabledTools?.includes(t.id))
                    : tools;

                // Extract required variables for each tool to help the LLM
                const placeholderRegex = /{{\s*(.*?)\s*}}/g;
                const toolsWithVars = filtered.map(tool => {
                    const vars = new Set<string>();
                    const searchStrings = [
                        tool.endpoint,
                        tool.bodyTemplate || '',
                        ...Object.values(tool.headers || {}),
                        ...Object.values(tool.queryParams || {}),
                    ];

                    searchStrings.forEach(s => {
                        let match;
                        while ((match = placeholderRegex.exec(s)) !== null) {
                            vars.add(match[1].trim());
                        }
                    });

                    return {
                        id: tool.id,
                        name: tool.name,
                        description: tool.description,
                        method: tool.method,
                        endpoint: tool.endpoint,
                        requiredVariables: Array.from(vars),
                    };
                });

                return JSON.stringify({ success: true, tools: toolsWithVars });
            } catch (error: any) {
                return JSON.stringify({ success: false, error: error.message || String(error) });
            }
        },
    });

    const callApiTool = new DynamicStructuredTool({
        name: 'api_call_tool',
        description: 'Invoke a custom API tool. Check db_get_api_tools for requiredVariables. You can pass arguments as a JSON object or string.',
        schema: z.object({
            tool_id: z.string().describe('The UUID of the API tool (from db_get_api_tools)'),
            arguments_json: z.union([z.string(), z.record(z.any())]).nullable().describe('Key-value pairs for variables. Can be an object or JSON string.').default(null),
        }),
        func: async ({ tool_id, arguments_json }) => {
            try {
                if (workspaceSettings?.disabledTools?.includes(tool_id)) {
                    throw new Error(`API Tool "${tool_id}" is disabled in this workspace.`);
                }
                const tools = store.get('apiTools') || [];
                const tool = tools.find(t => t.id === tool_id);
                if (!tool) throw new Error(`API Tool with ID "${tool_id}" not found. Verify the ID using db_get_api_tools.`);

                let args: Record<string, any> = {};
                if (typeof arguments_json === 'string' && arguments_json.trim()) {
                    try {
                        args = JSON.parse(arguments_json);
                    } catch (e) {
                        return JSON.stringify({
                            success: false,
                            error: `Invalid format for arguments_json. You passed "${arguments_json}". It MUST be a JSON object, for example: {"variable_name": "value"}. Check requiredVariables for this tool.`
                        });
                    }
                } else if (arguments_json && typeof arguments_json === 'object') {
                    args = arguments_json;
                }
                const placeholderRegex = /{{\s*(.*?)\s*}}/g;

                // Helper to interpolate strings
                const interpolate = (str: string, variables: Record<string, any>) => {
                    const varKeys = Object.keys(variables);
                    const varValues = Object.values(variables);

                    return str.replace(placeholderRegex, (match, key) => {
                        const trimmedKey = key.trim();
                        // 1. Exact match
                        if (variables[trimmedKey] !== undefined) {
                            return String(variables[trimmedKey]);
                        }
                        // 2. Fuzzy match (ignore case and underscores)
                        const normalizedKey = trimmedKey.toLowerCase().replace(/_/g, '');
                        const fuzzyKey = varKeys.find(k => k.toLowerCase().replace(/_/g, '') === normalizedKey);
                        if (fuzzyKey !== undefined) {
                            return String(variables[fuzzyKey]);
                        }

                        // 3. Search synonym match: if placeholder is search_term/query and agent provided 'q'
                        if (normalizedKey === 'searchterm' || normalizedKey === 'query' || normalizedKey === 'q') {
                            const searchKey = varKeys.find(k => {
                                const nk = k.toLowerCase().replace(/_/g, '');
                                return nk === 'q' || nk === 'query' || nk === 'searchterm';
                            });
                            if (searchKey !== undefined) return String(variables[searchKey]);
                        }

                        // 4. One-to-one fallback: if only one variable exists and only one was provided
                        if (varKeys.length === 1 && varKeys[0] !== 'tool_id') {
                            return String(varValues[0]);
                        }

                        return match;
                    });
                };

                // Interpolate variables in endpoint and body
                let finalEndpoint = tool.endpoint;
                let finalBody: string | null = null;

                // 1. Interpolate Endpoint
                finalEndpoint = interpolate(finalEndpoint, args);

                // 2. Interpolate Headers
                const finalHeaders: Record<string, string> = {
                    'Content-Type': 'application/json',
                    ...(tool.headers || {}),
                };
                Object.entries(finalHeaders).forEach(([hKey, hVal]) => {
                    finalHeaders[hKey] = interpolate(String(hVal), args);
                });

                // 3. Handle Query Parameters
                if (tool.queryParams && Object.keys(tool.queryParams).length > 0) {
                    try {
                        const url = new URL(finalEndpoint);
                        Object.entries(tool.queryParams).forEach(([qKey, qVal]) => {
                            const interpolatedVal = interpolate(String(qVal), args);
                            url.searchParams.append(qKey, interpolatedVal);
                        });
                        finalEndpoint = url.toString();
                    } catch (e) {
                        console.error('Failed to parse endpoint URL for query params:', finalEndpoint);
                    }
                }

                // 4. Interpolate Body Template or use fallback
                if (tool.bodyTemplate) {
                    finalBody = interpolate(tool.bodyTemplate, args);
                } else if (tool.method !== 'GET' && tool.method !== 'DELETE') {
                    finalBody = JSON.stringify(args || {});
                }

                // 5. Validation: Ensure no placeholders remain (check literal and encoded)
                const validationRegex = /{{\s*(.*?)\s*}}|%7B%7B\s*(.*?)\s*%7D%7D/g;
                const remainingInEndpoint = finalEndpoint.match(validationRegex);
                const remainingInBody = finalBody?.match(validationRegex);
                const remainingInHeaders = Object.values(finalHeaders).some(v => validationRegex.test(v));

                if (remainingInEndpoint || remainingInBody || remainingInHeaders) {
                    const missingVars = new Set<string>();
                    [remainingInEndpoint, remainingInBody].forEach(matches => {
                        matches?.forEach((m: string) => {
                            const key = m.replace(/[{}%7B7D ]/g, '');
                            missingVars.add(key);
                        });
                    });
                    Object.values(finalHeaders).forEach(v => {
                        v.match(validationRegex)?.forEach(m => {
                            const key = m.replace(/[{}%7B7D ]/g, '');
                            missingVars.add(key);
                        });
                    });

                    throw new Error(`CRITICAL: The following variables are unresolved in the API request: ${Array.from(missingVars).join(', ')}. Please ensure you provide these specifically in the "arguments_json" object. Synonyms like 'q' for 'search_term' are supported, but you MUST provide a value.`);
                }

                // Basic implementation of API call
                const response = await fetch(finalEndpoint, {
                    method: tool.method || 'POST',
                    headers: finalHeaders,
                    body: finalBody,
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
