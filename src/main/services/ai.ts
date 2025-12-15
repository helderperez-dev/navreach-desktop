import { IpcMain, BrowserWindow } from 'electron';
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { HumanMessage, AIMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import type { ModelProvider, ModelConfig, Message } from '../../shared/types';
import { createBrowserTools } from './browser-tools';

interface ChatRequest {
  messages: Message[];
  model: ModelConfig;
  provider: ModelProvider;
  systemPrompt?: string;
  enableTools?: boolean;
  maxIterations?: number;
  infiniteMode?: boolean;
  initialUserPrompt?: string;
}

function createChatModel(provider: ModelProvider, model: ModelConfig, streaming = true) {
  const baseConfig = {
    modelName: model.id,
    temperature: 0.7,
    streaming,
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

function convertMessages(messages: Message[], systemPrompt?: string): BaseMessage[] {
  const langchainMessages: BaseMessage[] = [];
  
  if (systemPrompt) {
    langchainMessages.push(new SystemMessage(systemPrompt));
  }

  for (const msg of messages) {
    if (msg.role === 'user') {
      langchainMessages.push(new HumanMessage(msg.content));
    } else if (msg.role === 'assistant') {
      langchainMessages.push(new AIMessage(msg.content));
    } else if (msg.role === 'system') {
      langchainMessages.push(new SystemMessage(msg.content));
    }
  }

  return langchainMessages;
}

const BROWSER_AGENT_PROMPT = `You are a helpful AI assistant integrated into a browser automation application called NavReach.
You have access to browser control tools that allow you to navigate the web, click elements, type text, and extract information.

When the user asks you to do something with the browser:
1. First use browser_get_page_content to understand the current page state.
2. Use browser_find_elements to discover interactive elements if needed.
3. Execute the appropriate actions (navigate, click, type, etc.).
4. Specialized tools exist for popular sites. When you detect you are on a known domain, **you must use its site-specific tools before any generic clicks**. Example: on X.com/twitter.com you must use x_search/x_like/x_reply/x_post/x_follow and only fall back to browser_click or browser_click_coordinates after a site-specific tool fails and you explain why you are falling back.
5. Narrate your process continuously: before executing tools, briefly state the current action and immediate next steps; after each tool result, summarize what just happened and what you will attempt next.

Always be helpful and transparent. If something fails, explain what happened and try an alternative approach.
When navigating, always include the full URL with https://.
When clicking or typing, use specific CSS selectors.`;

export function setupAIHandlers(ipcMain: IpcMain): void {
  const browserTools = createBrowserTools();
  const toolsByName = new Map(browserTools.map(tool => [tool.name, tool]));

  ipcMain.handle('ai:chat', async (event, request: ChatRequest) => {
    try {
      const {
        messages,
        model,
        provider,
        systemPrompt,
        enableTools = true,
        maxIterations: requestedMaxIterations = 10,
        infiniteMode = false,
        initialUserPrompt,
      } = request;
      const window = BrowserWindow.fromWebContents(event.sender);

      const sanitizedMaxIterations = Math.max(1, Math.min(Math.round(requestedMaxIterations) || 1, 50));
      const hardStopIterations = infiniteMode ? 500 : sanitizedMaxIterations;
      const lastUserMessage =
        [...messages]
          .reverse()
          .find((msg) => msg.role === 'user')?.content || '';
      const baseUserGoal = initialUserPrompt || lastUserMessage || '';

      const infiniteDirective =
        infiniteMode && baseUserGoal
          ? `\nThe user enabled **Infinite Loop Mode**. Treat the goal as an endless campaign:\n- Goal: "${baseUserGoal}"\n- Never ask the user for extra details. Invent reasonable copy, targets, or parameters yourself.\n- After you finish a pass (navigate/snapshot/post/reply/like/follow), immediately start planning the next pass and execute without waiting.\n- Rotate between different engagement tactics so the logged-in account keeps growing organically.\n- Summaries should be brief and should not stop you from continuing. Only halt when explicitly told to stop or when safety limits trigger.`
          : '';

      const effectiveSystemPrompt = enableTools
        ? `${BROWSER_AGENT_PROMPT}${infiniteDirective}\n\n${systemPrompt || ''}`
        : systemPrompt;

      if (enableTools) {
        const chatModel = createChatModel(provider, model, false);
        const modelWithTools = chatModel.bindTools(browserTools);
        
        let langchainMessages = convertMessages(messages, effectiveSystemPrompt);
        let fullResponse = '';
        let iteration = 0;

        while (iteration < hardStopIterations) {
          iteration++;

          const response = await modelWithTools.invoke(langchainMessages);

          const toolCalls = response.tool_calls;

          if (!toolCalls || toolCalls.length === 0) {
            const responseContent =
              typeof response.content === 'string'
                ? response.content
                : Array.isArray(response.content)
                ? response.content
                    .map((chunk) =>
                      typeof chunk === 'object' && chunk !== null && 'text' in chunk && typeof (chunk as any).text === 'string'
                        ? (chunk as { text: string }).text
                        : ''
                    )
                    .join(' ')
                : '';
            fullResponse = responseContent;

            if (infiniteMode && baseUserGoal && iteration < hardStopIterations) {
              if (window && !window.isDestroyed()) {
                window.webContents.send('ai:stream-chunk', {
                  content: '\n♾️ Cycle complete. Planning next autonomous pass...\n',
                  done: false,
                });
              }
              langchainMessages.push(
                new HumanMessage(
                  `Remain in autonomous mode. Goal: "${baseUserGoal}". Immediately plan and execute the next set of browser actions (navigate/snapshot/post/reply/like/follow) using the information you already gathered. Do NOT ask the user for clarification—make reasonable assumptions, craft copy yourself, and keep alternating between engagement tactics. After each mini-pass, summarize briefly and keep going.`
                )
              );
              iteration = 0;
              continue;
            }

            break;
          }

          langchainMessages.push(response);

          for (const toolCall of toolCalls) {
            const tool = toolsByName.get(toolCall.name);
            if (!tool) {
              const errorMsg = new ToolMessage({
                tool_call_id: toolCall.id || '',
                content: JSON.stringify({ error: `Unknown tool: ${toolCall.name}` }),
              });
              langchainMessages.push(errorMsg);
              continue;
            }

            if (window && !window.isDestroyed()) {
              window.webContents.send('ai:stream-chunk', { 
                content: `\n🔧 Using tool: ${toolCall.name}\n`, 
                done: false,
                toolCall: { name: toolCall.name, args: toolCall.args }
              });
            }

            try {
              const result = await tool.invoke(toolCall.args);
              const toolMessage = new ToolMessage({
                tool_call_id: toolCall.id || '',
                content: result,
              });
              langchainMessages.push(toolMessage);

              if (window && !window.isDestroyed()) {
                const parsed = JSON.parse(result);
                window.webContents.send('ai:stream-chunk', { 
                  content: `✅ ${parsed.message || 'Done'}\n`, 
                  done: false,
                  toolResult: parsed
                });
              }
            } catch (toolError) {
              const errorMessage = new ToolMessage({
                tool_call_id: toolCall.id || '',
                content: JSON.stringify({ error: String(toolError) }),
              });
              langchainMessages.push(errorMessage);

              if (window && !window.isDestroyed()) {
                window.webContents.send('ai:stream-chunk', { 
                  content: `❌ Error: ${toolError}\n`, 
                  done: false 
                });
              }
            }
          }
        }

        if (iteration >= hardStopIterations && infiniteMode && window && !window.isDestroyed()) {
          window.webContents.send('ai:stream-chunk', {
            content: '⚠️ Infinite mode safety limit reached. Stop or start a new request.\n',
            done: false,
          });
        }

        if (window && !window.isDestroyed()) {
          if (fullResponse) {
            window.webContents.send('ai:stream-chunk', { content: fullResponse, done: false });
          }
          window.webContents.send('ai:stream-chunk', { content: '', done: true });
        }

        return { success: true, response: fullResponse };
      } else {
        const chatModel = createChatModel(provider, model, true);
        const langchainMessages = convertMessages(messages, effectiveSystemPrompt);

        let fullResponse = '';
        const stream = await chatModel.stream(langchainMessages);

        for await (const chunk of stream) {
          const content = chunk.content as string;
          fullResponse += content;
          
          if (window && !window.isDestroyed()) {
            window.webContents.send('ai:stream-chunk', { content, done: false });
          }
        }

        if (window && !window.isDestroyed()) {
          window.webContents.send('ai:stream-chunk', { content: '', done: true });
        }

        return { success: true, response: fullResponse };
      }
    } catch (error) {
      console.error('AI chat error:', error);
      const window = BrowserWindow.fromWebContents(event.sender);
      if (window && !window.isDestroyed()) {
        window.webContents.send('ai:stream-chunk', { content: '', done: true });
      }
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  });

  ipcMain.handle('ai:chat-sync', async (_event, request: ChatRequest) => {
    try {
      const { messages, model, provider, systemPrompt } = request;
      const chatModel = createChatModel(provider, model, false);
      const langchainMessages = convertMessages(messages, systemPrompt);

      const response = await chatModel.invoke(langchainMessages);
      
      return { 
        success: true, 
        response: response.content as string 
      };
    } catch (error) {
      console.error('AI chat error:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  });
}
