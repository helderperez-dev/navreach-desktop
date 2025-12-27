
import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import Store from 'electron-store';
import { AppSettings, ModelProvider, ModelConfig } from '../../shared/types';

const store = new Store<AppSettings>({
    name: 'settings',
});

function createSimpleChatModel(provider: ModelProvider, model?: ModelConfig) {
    const modelName = model?.id || provider.models[0]?.id || (provider.type === 'openai' ? 'gpt-4o' : 'claude-3-5-sonnet-20240620');
    const baseUrl = provider.baseUrl?.trim() || undefined;

    console.log(`[Utility Tools] Creating chat model for Humanize: Provider=${provider.type}, Model=${modelName}, BaseURL=${baseUrl || 'default'}`);

    const baseConfig = {
        modelName: modelName,
        temperature: 0.7,
    };

    switch (provider.type) {
        case 'openai':
        case 'custom':
            if (provider.type === 'custom' && !baseUrl) {
                console.warn('[Utility Tools] Custom provider has no Base URL! This will default to OpenAI and likely fail.');
            }
            return new ChatOpenAI({
                ...baseConfig,
                apiKey: provider.apiKey,
                openAIApiKey: provider.apiKey,
                configuration: {
                    baseURL: baseUrl,
                    apiKey: provider.apiKey,
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
                openAIApiKey: provider.apiKey,
                configuration: {
                    baseURL: 'https://openrouter.ai/api/v1',
                    defaultHeaders: {
                        'HTTP-Referer': 'https://reavion.ai',
                        'X-Title': 'Reavion Desktop',
                    },
                },
            });
        default:
            throw new Error(`Unsupported provider type: ${provider.type}`);
    }
}

export function createUtilityTools(context?: { provider?: ModelProvider; model?: ModelConfig }): DynamicStructuredTool[] {
    const humanizeTool = new DynamicStructuredTool({
        name: 'humanize_text',
        description: 'Rewrites text to be undetectable by AI detectors and sound completely human. Use this before posting or replying if you want to ensure the highest quality, most natural tone.',
        schema: z.object({
            text: z.string().describe('The AI-generated text to humanize.'),
            tone: z.string().nullable().describe('Optional tone guidance (e.g. "casual", "professional", "witty"). Default is "casual professional".'),
        }),
        func: async ({ text, tone }) => {
            const finalTone = tone || 'casual professional';
            try {
                // 1. Pick a provider
                let selectedProvider = context?.provider;
                let selectedModel = context?.model;

                console.log(`[Utility Tools] executing humanize_text. Context present: ${!!context}. Provider Type: ${selectedProvider?.type}. Model: ${selectedModel?.id}`);

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
                        // Fallback to first enabled provider
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

                const response = await chat.invoke([
                    new SystemMessage(systemPrompt),
                    new HumanMessage(text)
                ]);

                const content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);

                return JSON.stringify({
                    success: true,
                    original_text: text,
                    humanized_text: content.trim()
                });

            } catch (error: any) {
                console.error('Humanize Error:', error);
                const debugInfo = `Provider: ${context?.provider?.type || 'fallback'}; Model: ${context?.model?.id || 'fallback'}; BaseURL: ${context?.provider?.baseUrl || 'undefined'}`;
                return JSON.stringify({ success: false, error: `${error.message || String(error)} (${debugInfo})` });
            }
        },
    });

    const calculatorTool = new DynamicStructuredTool({
        name: 'calculator',
        description: 'Perform basic arithmetic calculations (add, subtract, multiply, divide). Use this for any math tasks like calculating rates, converting currencies (if rates known), or simple counting.',
        schema: z.object({
            expression: z.string().describe('The mathematical expression to evaluate (e.g., "2 + 2", "100 * 1.5"). Only numbers and +, -, *, /, (, ) are allowed.'),
        }),
        func: async ({ expression }) => {
            try {
                // Remove all whitespace for checking
                const clean = expression.replace(/\s+/g, '');
                // Strict check: only digits, dots, parens, and operators
                if (!/^[\d\+\-\*\/\.\(\)]+$/.test(clean)) {
                    return JSON.stringify({ success: false, error: 'Invalid characters. Only numbers and basic operators (+ - * /) allowed.' });
                }

                // Safe execution
                // eslint-disable-next-line @typescript-eslint/no-implied-eval
                const result = new Function(`"use strict"; return (${expression})`)();

                return JSON.stringify({ success: true, result, expression });
            } catch (e: any) {
                return JSON.stringify({ success: false, error: "Calculation failed: " + e.message });
            }
        }
    });

    return [humanizeTool, calculatorTool];
}
