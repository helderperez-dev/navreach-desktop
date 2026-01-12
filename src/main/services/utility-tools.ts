import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import Store from 'electron-store';
import * as fs from 'fs';
import { exec } from 'child_process';
import { AppSettings, ModelProvider, ModelConfig } from '../../shared/types';

const store = new Store<AppSettings>({
    name: 'settings',
});

function createSimpleChatModel(provider: ModelProvider, model?: ModelConfig) {
    const baseConfig = {
        modelName: model?.id || 'gpt-4o',
        temperature: 0.7,
        apiKey: provider.apiKey,
    };

    switch (provider.type) {
        case 'openai':
            return new ChatOpenAI({
                ...baseConfig,
                configuration: {
                    baseURL: provider.baseUrl || undefined,
                },
            });
        case 'anthropic':
            return new ChatAnthropic({
                ...baseConfig,
                anthropicApiKey: provider.apiKey,
            });
        case 'openrouter':
            return new ChatOpenAI({
                ...baseConfig,
                configuration: {
                    baseURL: 'https://openrouter.ai/api/v1',
                    defaultHeaders: {
                        'HTTP-Referer': 'https://reavion.ai',
                        'X-Title': 'Reavion Desktop',
                    },
                },
            });
        default:
            return new ChatOpenAI(baseConfig);
    }
}

export interface UtilityToolsContext {
    provider?: ModelProvider;
    model?: ModelConfig;
    workspaceId?: string;
}

export function createUtilityTools(context?: UtilityToolsContext): DynamicStructuredTool[] {
    const provider = context?.provider;
    const model = context?.model;
    const workspaceId = context?.workspaceId;

    const tools: DynamicStructuredTool[] = [
        new DynamicStructuredTool({
            name: 'get_current_datetime',
            description: 'Get the current date and time in ISO format. Useful for timestamping actions or making time-sensitive decisions.',
            schema: z.object({}),
            func: async () => {
                console.log('[Tool] Getting current date and time');
                return new Date().toISOString();
            },
        }),
        new DynamicStructuredTool({
            name: 'humanize_text',
            description: 'Rewrites text to be undetectable by AI detectors and sound completely human. Use this before posting or replying if you want to ensure the highest quality, most natural tone.',
            schema: z.object({
                text: z.string().describe('The AI-generated text to humanize.'),
                tone: z.string().nullable().describe('Optional tone guidance (e.g. "casual", "professional", "witty"). Default is "casual professional".'),
            }),
            func: async ({ text, tone }) => {
                const finalTone = tone || 'casual professional';
                let selectedProvider = provider;
                let selectedModel = model;

                try {
                    if (!selectedProvider) {
                        const providers = store.get('modelProviders') as ModelProvider[] || [];
                        const defaultModelId = store.get('defaultModelId') as string | undefined;

                        if (defaultModelId) {
                            selectedProvider = providers.find(p => p.models.some(m => m.id === defaultModelId) && p.enabled);
                            if (selectedProvider) {
                                selectedModel = selectedProvider.models.find(m => m.id === defaultModelId);
                            }
                        }

                        if (!selectedProvider) {
                            selectedProvider = providers.find(p => p.enabled && p.type === 'openai');
                            if (!selectedProvider) selectedProvider = providers.find(p => p.enabled && p.type === 'anthropic');
                            if (!selectedProvider) selectedProvider = providers.find(p => p.enabled);

                            if (selectedProvider) {
                                selectedModel = selectedProvider.models[0];
                            }
                        }
                    }

                    if (!selectedProvider) {
                        return JSON.stringify({ success: false, error: 'No enabled AI model provider found to perform humanization.' });
                    }

                    const chat = createSimpleChatModel(selectedProvider, selectedModel);

                    const systemPrompt = `You are an expert ghostwriter and editor. Your ONLY goal is to rewrite the input text to be 100% human-like and undetectable by AI detectors.
            
            GUIDELINES:
            - NEVER simply say "humanized version" or similar meta-text. 
            - If the input text is a placeholder like "{{agent.decide}}", ignore it and generate high-quality, relevant content based on the context you were given for the rewrite.
            - Remove all "AI-isms" (e.g., "In conclusion", "It's worth noting", "delve", "tapestry", "digital landscape").
            - Use varied sentence structure (mix short and long).
            - Use natural vocabulary, not overly complex or academic.
            - Introduce slight (but professional) imperfections or stylistic quirks if it helps realism.
            - If the text is a social media reply/post, keep it concise and punchy.
            - TONE: ${finalTone}. 
            - DO NOT change the core meaning or facts.
            - RETURN ONLY THE REWRITTEN TEXT. NO PREAMBLE.`;

                    const timeoutPromise = new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('Humanization model call timed out after 60s')), 60000)
                    );

                    const response = await Promise.race([
                        chat.invoke([
                            new SystemMessage(systemPrompt),
                            new HumanMessage(text)
                        ]),
                        timeoutPromise
                    ]) as any;

                    const content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);

                    return JSON.stringify({
                        success: true,
                        original_text: text,
                        humanized_text: content.trim()
                    });

                } catch (error: any) {
                    console.error('Humanize Error:', error);
                    return JSON.stringify({ success: false, error: error.message || String(error) });
                }
            },
        }),
        new DynamicStructuredTool({
            name: 'calculator',
            description: 'Perform basic arithmetic calculations (add, subtract, multiply, divide).',
            schema: z.object({
                expression: z.string().describe('The mathematical expression to evaluate (e.g., "2 + 2", "100 * 1.5").'),
            }),
            func: async ({ expression }) => {
                try {
                    const clean = expression.replace(/\s+/g, '');
                    if (!/^[\d\+\-\*\/\.\(\)]+$/.test(clean)) {
                        return JSON.stringify({ success: false, error: 'Invalid characters. Only numbers and basic operators (+ - * /) allowed.' });
                    }
                    const result = new Function(`"use strict"; return (${expression})`)();
                    return JSON.stringify({ success: true, result, expression });
                } catch (e: any) {
                    return JSON.stringify({ success: false, error: "Calculation failed: " + e.message });
                }
            }
        }),
        new DynamicStructuredTool({
            name: 'send_email',
            description: 'Send an email to a specified recipient. Useful for notifications, reports, or direct communication.',
            schema: z.object({
                to: z.string().email().describe('The recipient\'s email address.'),
                subject: z.string().describe('The subject line of the email.'),
                body: z.string().describe('The plain text body of the email.'),
            }),
            func: async ({ to, subject, body }) => {
                console.log(`[Tool] Sending email to ${to} with subject "${subject}"`);
                return `Email to "${to}" with subject "${subject}" sent successfully (simulated).`;
            },
        }),
        new DynamicStructuredTool({
            name: 'read_file',
            description: 'Read the content of a local file. Useful for processing local data or configuration files.',
            schema: z.object({
                file_path: z.string().describe('The absolute path to the file to read.'),
            }),
            func: async ({ file_path }) => {
                console.log(`[Tool] Reading file: ${file_path}`);
                try {
                    const content = fs.readFileSync(file_path, 'utf-8');
                    return content;
                } catch (error: any) {
                    throw new Error(`Failed to read file: ${error.message}`);
                }
            },
        }),
        new DynamicStructuredTool({
            name: 'write_file',
            description: 'Write content to a local file. Useful for saving extracted data, logs, or generated reports.',
            schema: z.object({
                file_path: z.string().describe('The absolute path to the file to write.'),
                content: z.string().describe('The content to write to the file.'),
                append: z.boolean().nullable().describe('Whether to append to the file if it exists (true) or overwrite it (false). Defaults to false.'),
            }),
            func: async ({ file_path, content, append }) => {
                console.log(`[Tool] Writing to file: ${file_path}, append: ${append}`);
                try {
                    fs.writeFileSync(file_path, content, { flag: append ? 'a' : 'w' });
                    return `Content successfully written to ${file_path}.`;
                } catch (error: any) {
                    throw new Error(`Failed to write file: ${error.message}`);
                }
            },
        }),
        new DynamicStructuredTool({
            name: 'list_directory',
            description: 'List the contents of a local directory. Useful for exploring the file system.',
            schema: z.object({
                path: z.string().describe('The absolute path to the directory.'),
            }),
            func: async ({ path }) => {
                console.log(`[Tool] Listing directory: ${path}`);
                try {
                    const files = fs.readdirSync(path);
                    return JSON.stringify(files);
                } catch (error: any) {
                    throw new Error(`Failed to list directory: ${error.message}`);
                }
            },
        }),
        new DynamicStructuredTool({
            name: 'delete_file',
            description: 'Delete a local file. Use with caution.',
            schema: z.object({
                file_path: z.string().describe('The absolute path to the file to delete.'),
            }),
            func: async ({ file_path }) => {
                console.log(`[Tool] Deleting file: ${file_path}`);
                try {
                    fs.unlinkSync(file_path);
                    return `File ${file_path} deleted successfully.`;
                } catch (error: any) {
                    throw new Error(`Failed to delete file: ${error.message}`);
                }
            },
        }),
        new DynamicStructuredTool({
            name: 'run_shell_command',
            description: 'Execute a shell command. Use with extreme caution.',
            schema: z.object({
                command: z.string().describe('The shell command to execute.'),
                args: z.array(z.string()).nullable().describe('Optional: Arguments for the command.'),
                cwd: z.string().nullable().describe('Optional: The current working directory for the command.'),
            }),
            func: async ({ command, args, cwd }) => {
                console.log(`[Tool] Running shell command: ${command} ${args?.join(' ')}`);
                return new Promise((resolve, reject) => {
                    exec(command + (args ? ' ' + args.join(' ') : ''), { cwd }, (error, stdout, stderr) => {
                        if (error) {
                            reject(`Command failed: ${error.message}\nStderr: ${stderr}`);
                        } else {
                            resolve(`Stdout: ${stdout}\nStderr: ${stderr}`);
                        }
                    });
                });
            },
        }),
        new DynamicStructuredTool({
            name: 'get_model_info',
            description: 'Retrieve information about the currently active AI model.',
            schema: z.object({}),
            func: async () => {
                console.log('[Tool] Getting model info');
                return JSON.stringify({
                    model_id: model?.id,
                    provider_name: provider?.name,
                    context_window: model?.contextWindow,
                });
            },
        }),
        new DynamicStructuredTool({
            name: 'get_workspace_id',
            description: 'Retrieve the ID of the current workspace.',
            schema: z.object({}),
            func: async () => {
                console.log('[Tool] Getting workspace ID');
                return workspaceId || 'No workspace ID available';
            },
        }),
    ];

    return tools;
}
