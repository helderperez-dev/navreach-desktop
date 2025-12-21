
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

function createSimpleChatModel(provider: ModelProvider, modelId?: string) {
    const model = provider.models.find(m => m.id === modelId) || provider.models[0];
    const modelName = model?.id || (provider.type === 'openai' ? 'gpt-4o' : 'claude-3-5-sonnet-20240620');

    const baseConfig = {
        modelName: modelName,
        temperature: 0.7,
    };

    switch (provider.type) {
        case 'openai':
            return new ChatOpenAI({
                ...baseConfig,
                openAIApiKey: provider.apiKey,
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
                },
            });
        case 'custom':
            return new ChatOpenAI({
                ...baseConfig,
                openAIApiKey: provider.apiKey,
                configuration: {
                    baseURL: provider.baseUrl,
                },
            });
        default:
            throw new Error(`Unsupported provider type: ${provider.type}`);
    }
}

export function createUtilityTools(): DynamicStructuredTool[] {
    const humanizeTool = new DynamicStructuredTool({
        name: 'humanize_text',
        description: 'Rewrites text to be undetectable by AI detectors and sound completely human. Use this before posting or replying if you want to ensure the highest quality, most natural tone.',
        schema: z.object({
            text: z.string().describe('The AI-generated text to humanize.'),
            tone: z.string().optional().describe('Optional tone guidance (e.g. "casual", "professional", "witty"). Default is "casual professional".'),
        }),
        func: async ({ text, tone }) => {
            try {
                const settings = store.get('store') || store.store; // handle potential nesting or direct access
                // Electron-store structure: store.get returns the root object if key not provided? No.
                // We know the schema is AppSettings.
                const providers = store.get('modelProviders') as ModelProvider[] || [];
                const defaultModelId = store.get('defaultModelId') as string | undefined;

                // 1. Pick a provider
                // Prioritize: Configured Default -> OpenAI -> Anthropic -> OpenRouter
                let selectedProvider: ModelProvider | undefined;
                let selectedModelId: string | undefined;

                if (defaultModelId) {
                    selectedProvider = providers.find(p => p.models.some(m => m.id === defaultModelId) && p.enabled);
                    if (selectedProvider) selectedModelId = defaultModelId;
                }

                if (!selectedProvider) {
                    // Fallback to first enabled provider
                    selectedProvider = providers.find(p => p.enabled && p.type === 'openai');
                    if (!selectedProvider) selectedProvider = providers.find(p => p.enabled && p.type === 'anthropic');
                    if (!selectedProvider) selectedProvider = providers.find(p => p.enabled);
                }

                if (!selectedProvider) {
                    return JSON.stringify({ success: false, error: 'No enabled AI model provider found to perform humanization.' });
                }

                const chat = createSimpleChatModel(selectedProvider, selectedModelId);

                const systemPrompt = `You are an expert ghostwriter and editor. Your ONLY goal is to rewrite the input text to be 100% human-like and undetectable by AI detectors.
        
        GUIDELINES:
        - Remove all "AI-isms" (e.g., "In conclusion", "It's worth noting", "delve", "tapestry", "digital landscape").
        - Use varied sentence structure (mix short and long).
        - Use natural vocabulary, not overly complex or academic.
        - Introduce slight (but professional) imperfections or stylistic quirks if it helps realism.
        - If the text is a social media reply/post, keep it concise and punchy.
        - TONE: ${tone || 'Casual, smart, "founder-to-founder".'}. 
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
                return JSON.stringify({ success: false, error: error.message || String(error) });
            }
        },
    });

    return [humanizeTool];
}
