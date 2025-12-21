import { IpcMain, BrowserWindow, app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { HumanMessage, AIMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import type { ModelProvider, ModelConfig, Message } from '../../shared/types';
import { createBrowserTools, getWebviewContents } from './browser-tools';
import { createTargetTools } from './target-tools';
import { createPlaybookTools } from './playbook-tools';
import { createIntegrationTools } from './integration-tools';
import { createUtilityTools } from './utility-tools';
import { supabase } from '../lib/supabase';
import Store from 'electron-store';
import type { AppSettings } from '../../shared/types';

const store = new Store<AppSettings>({
  name: 'settings',
});

interface ChatRequest {
  messages: Message[];
  model: ModelConfig;
  provider: ModelProvider;
  systemPrompt?: string;
  enableTools?: boolean;
  maxIterations?: number;
  infiniteMode?: boolean;
  initialUserPrompt?: string;
  accessToken?: string;
  refreshToken?: string;
  playbooks?: any[];
  targetLists?: any[];
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
      // Handle tool calls if they exist in the content or metadata
      const tool_calls = (msg as any).tool_calls;
      if (tool_calls && tool_calls.length > 0) {
        langchainMessages.push(new AIMessage({
          content: msg.content,
          tool_calls: tool_calls
        }));
      } else {
        langchainMessages.push(new AIMessage(msg.content));
      }
    } else if (msg.role === 'tool') {
      langchainMessages.push(new ToolMessage({
        content: msg.content,
        tool_call_id: (msg as any).tool_call_id || (msg as any).id,
      }));
    } else if (msg.role === 'system') {
      langchainMessages.push(new SystemMessage(msg.content));
    }
  }

  return langchainMessages;
}

const BROWSER_AGENT_PROMPT = `**YOUR ROLE:**
You are the Navreach Agent, a high-performance autonomous automation engine. You orchestrate web browsing, target management, and playbook execution.

**EXECUTION COMMANDS:**
- **PLAYBOOKS**: When asked to "run" or "execute" a playbook (e.g. {{playbooks.ID}}), you MUST:
  1. Call \`db_get_playbook_details\` with the ID.
  2. Parse the graph (\`nodes\` and \`edges\`).
  3. Traverse from 'start' to 'end'. For each node, map its \`type\` to your available tools (e.g., node type 'navigate' -> tool 'browser_navigate', 'engage' -> 'x_engage').
  4. **SPECIAL NODE HANDLING - 'HUMANIZE'**: If you encounter a 'humanize' node, it is a modifier. It means: "For the NEXT engagement or posting action (x_reply, x_engage, x_post), you MUST first draft your text, then run it through the \`humanize_text\` tool, and use the RESULT of that tool as your final text." Do not call \`humanize_text\` in isolation unless you have distinct text input from a previous step.
  5. **CRITICAL - PERSONALIZATION**: When the agent encounters an \`engage\` or \`reply\` node in a playbook, you MUST prioritize **Growth & Personalization**. You MUST read the post content you are interacting with (using browser_snapshot or page content) and generate a contextually relevant, human-like response. Do NOT simply use a static template from the playbook if it sounds generic. Use the configuration as a guideline for tone/topic, but always personalize.
  5. Narrate each step as you process the nodes (e.g. "Now I'm running the search node with the configured hashtags...").
- **HITL (Human In The Loop)**: If a playbook node has type \`approval\`, you MUST call \`human_approval\`. If type is \`pause\`, you MUST call \`agent_pause\`. These tools will signal the UI to wait for user confirmation.
- **BROWSER**: For web tasks, use \`browser_snapshot\` first to see elements, then interact. Use site-specific tools (x_like, x_reply) for X.com/Twitter.
  - **TIP**: X.com search is brittle. Avoid redundant filters (like \`has:hashtags\` when you already have \`#tag\`). DO NOT use \`min_likes:0\`, \`min_replies:0\`, or \`min_retweets:0\` as they often fail. Use \`minLikes:2\` or more for quality results.
- **FALLBACKS**: If a selector fails, use \`browser_click_coordinates\` based on the rect in the snapshot.

**TAG RESOLUTION**:
The UI uses tags like {{playbooks.xyz}} or {{lists.abc}}. These map to database IDs. You MUST use the ID part (e.g. "xyz") when calling tools. You HAVE access to every resource listed in the context below.

**TOOL USAGE RULES**:
- **NEVER** say you lack access. If a resource is tagged, use the tools.
- **NEVER** write "[Tool Call]" as text. Use the actual function.
- **NARRATE** briefly before every action (e.g. "Running the 'Login' node of the playbook...").

**X.COM (TWITTER) TOOL SELECTION - CRITICAL:**
- **Reply** means responding to an existing post (a tweet you can see in the timeline/search results). For replies you MUST use **x_reply**.
- **Post** means creating a brand-new standalone tweet from the composer. For new posts you MUST use **x_post**.
- If the user request includes words like "reply", "respond", "comment", "reply to posts", "engage with posts" then you MUST use **x_reply** (not x_post).
- If the user explicitly asks to "post", "tweet", "write a post", "publish a tweet" then you can use **x_post**.
- **Never open /compose/post when the task is replying.** If you end up on /compose/post while trying to reply, stop and report the issue (do not continue).

**PACING + VERIFICATION (MANDATORY ON X.COM):**
- Do not rush. After EACH X action (x_search/x_like/x_reply/x_follow/x_post), pause briefly and verify the UI state.
- After EACH successful X action, you MUST call browser_snapshot or browser_get_page_content BEFORE doing any next step.
- Only proceed when the snapshot confirms the expected state (e.g., reply dialog opened, reply submitted, like toggled).
- Do NOT "reset to Home" unless recovery is required and you have explained why.

**SMART AUTONOMY ({{agent.decide}} / agent_decide):**
- Some playbook nodes may have fields set to \`{{agent.decide}}\`, the string \`agent_decide\`, or left blank/null.
- This is your signal to take full responsibility for that parameter.
- You MUST observe the current state (via \`browser_snapshot\` or by listing resources), choose the best target or value based on your intelligence, and then use that ACTUAL value.
- If a \`targetIndex\` is autonomous, find the best element on screen and use its index.
- If a \`list_id\` is autonomous, fetch the available lists and pick the one that best matches the current task context (e.g., "SaaS Founders" for a SaaS outreach task).

**CRITICAL NAVIGATION RULES:**
- **NEVER navigate to a new page immediately after performing an action (like replying, posting, liking, etc.)**
- **ALWAYS take a browser snapshot (using browser_get_page_content) BEFORE navigating to verify the current state**
- **ALWAYS wait for action confirmation before proceeding to navigation**
- When replying or posting, you MUST:
  1. Execute the reply/post action
  2. Wait for the tool result confirming success
  3. Take a snapshot to verify the action completed
  4. ONLY THEN navigate if needed
- Navigation should be fluid and smart - verify each action's completion before moving to the next step
- The system must be reliable - confirm state changes before proceeding

**CRITICAL REPLY WORKFLOW - MANDATORY SEQUENCE:**
BEFORE clicking any reply button, you MUST:

**STEP 1: READ POSTS FIRST (MANDATORY)**
- Use browser_snapshot or browser_get_page_content to see all visible posts
- Read and analyze the content of each post
- Identify which posts are relevant and worth replying to
- Understand what each post is saying - the topic, tone, and message
- NEVER click reply until you have read and understood the post content

**STEP 2: SELECT POST TO REPLY TO**
- Choose a specific post based on its content
- Ensure the post is relevant to your engagement goals
- Confirm you understand what the author is saying

**STEP 3: CRAFT YOUR REPLY (BEFORE CLICKING)**
- Based on the post content you just read, write a contextually appropriate reply
- Your reply MUST:
  - Directly respond to what the author said
  - Be relevant to the specific topic they discussed
  - Make sense as a conversation response
  - Not be generic, random, or off-topic
  - Not duplicate the post content
  - **TONE**: Casual, professional, "founder-to-founder". Lowercase is fine. No hashtags unless critical.
  - **FORBIDDEN**: "Hi @username!", "Great post!", "Thanks for sharing!", "100% agree!", "Valuable insights!".
  - **STRATEGY**: Add a specific data point, ask a 2nd-order question, or share a brief contrarian take.
  - **LENGTH**: Keep it under 280 chars, ideally <150. Short and punchy.

**STEP 4: CLICK REPLY BUTTON**
- Only NOW use x_reply tool with your crafted reply text
- The tool will click the reply button and open the modal

**STEP 5: VERIFY IN MODAL**
- The x_reply tool will extract the post content from the modal
- It will verify your typed reply matches your intent
- It will check alignment with the post content
- Review the verification results

**STEP 6: SUBMIT OR ABORT**
- If verification passes: reply is submitted
- If verification fails: modal closes automatically, try again

**STEP 7: CONFIRM POSTING**
- Take a snapshot to verify the reply was posted
- Check the result before any navigation

ABSOLUTE REQUIREMENTS:
- NEVER call x_reply without first reading the post content via browser_snapshot/browser_get_page_content
- NEVER craft a reply without understanding what the post says
- NEVER submit generic or random replies
- ALWAYS read → understand → craft reply → then use x_reply tool
- The reply text you provide to x_reply must be based on the post content you already read
- **CRITICAL STYLE CHECK**: Before using x_reply, ask yourself: "Does this sound like a bot?" If yes, rewrite it to sound like a tired but smart engineer.

**ENGAGEMENT TONE & STYLE GUIDELINES:**
- **Objective**: Sound like a busy, smart indie builder.
- **Do**: Be concise, specific, casual.
- **Don't**: Be sycophantic, use exclamation marks excessively, use "marketing-speak", or sound like a customer support agent.
- **Example Good**: "Interesting point. found that manual onboarding cut churn by 20% vs automated flows."
- **Example Bad**: "Hi @User! This is a fascinating insight into SaaS churn. I totally agree that onboarding is key! Thanks for sharing this valuable content."

**DATABASE / INTEGRATION TOOLS:**
- \`db_get_target_lists\`, \`db_create_target_list\`, \`db_get_targets\`, \`db_create_target\`, \`db_update_target\`.
- \`db_get_playbooks\`, \`db_get_playbook_details\`, \`db_save_playbook\`, \`db_delete_playbook\`.
- \`db_get_mcp_servers\`, \`mcp_list_tools\`, \`mcp_call_tool\`, \`db_get_api_tools\`, \`api_call_tool\`.

Always be helpful and transparent. If something fails, explain what happened and try an alternative approach.
When navigating, always include the full URL with https://.
When clicking or typing, use specific CSS selectors.
`;

export function setupAIHandlers(ipcMain: IpcMain): void {
  const browserTools = createBrowserTools();
  const targetTools = createTargetTools();
  const playbookTools = createPlaybookTools();
  const integrationTools = createIntegrationTools();
  const utilityTools = createUtilityTools();
  const allTools = [...browserTools, ...targetTools, ...playbookTools, ...integrationTools, ...utilityTools];
  const toolsByName = new Map(allTools.map(tool => [tool.name, tool]));

  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
  const getToolDelayMs = (toolName: string) => {
    if (toolName.startsWith('x_')) return 1400;
    if (toolName === 'browser_navigate') return 1200;
    if (toolName === 'browser_click' || toolName === 'browser_type') return 700;
    if (toolName === 'browser_scroll') return 600;
    if (toolName === 'browser_snapshot' || toolName === 'browser_get_page_content' || toolName === 'browser_get_visible_text') return 350;
    return 600;
  };

  // Track stop signals per window
  const stopSignals = new Map<number, boolean>();

  ipcMain.handle('ai:stop', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window) {
      stopSignals.set(window.id, true);
    }

    // Also signal the renderer execution to stop immediately
    const contents = getWebviewContents('main-tab');
    if (contents && !contents.isDestroyed()) {
      try {
        await contents.executeJavaScript('window.__NAVREACH_STOP__ = true;');
      } catch (e) {
        // Ignore error if webview is not ready
      }
    }

    return { success: true };
  });

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
        accessToken,
        refreshToken,
        playbooks = [],
        targetLists = []
      } = request;
      const window = BrowserWindow.fromWebContents(event.sender);

      // Create a scoped Supabase client for this request using the access token
      // This avoids the "AuthSessionMissingError" by setting the Authorization header directly
      let scopedSupabase = supabase;
      if (accessToken) {
        // We use the createClient from the library, but we need to import it.
        // Since we can't easily import it here without changing imports, we'll try to use the global one but
        // it's safer to create a new one. The best way is to rely on the fact that if we just want to query,
        // we can create a client with the token.
        const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
        const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';
        const { createClient } = require('@supabase/supabase-js');

        scopedSupabase = createClient(supabaseUrl, supabaseAnonKey, {
          global: {
            headers: {
              Authorization: `Bearer ${accessToken}`
            }
          }
        });
        console.log('[AI Service] Created scoped Supabase client with access token');
      } else {
        console.warn('[AI Service] No access token provided, using anonymous client');
      }

      console.log('[AI Service] Context received:', {
        playbooksCount: playbooks?.length,
        targetListsCount: targetLists?.length
      });

      // Clear stop signal at start
      if (window) {
        stopSignals.set(window.id, false);
      }

      // Re-create tools with context AND the scoped supabase client
      const requestBrowserTools = createBrowserTools();
      const requestTargetTools = createTargetTools({ targetLists, supabaseClient: scopedSupabase });
      const requestPlaybookTools = createPlaybookTools({ playbooks, supabaseClient: scopedSupabase });
      const requestIntegrationTools = createIntegrationTools();
      const requestUtilityTools = createUtilityTools();

      const requestTools = [...requestBrowserTools, ...requestTargetTools, ...requestPlaybookTools, ...requestIntegrationTools, ...requestUtilityTools];
      const requestToolsByName = new Map(requestTools.map(tool => [tool.name, tool]));

      // Reset renderer stop signal
      const contents = getWebviewContents('main-tab');
      if (contents && !contents.isDestroyed()) {
        try {
          await contents.executeJavaScript('window.__NAVREACH_STOP__ = false;');
        } catch (e) {
          // Ignore
        }
      }

      let effectiveBaseGoal = initialUserPrompt || '';

      // Handle Slash Command / Alias Expansion
      if (effectiveBaseGoal.startsWith('/')) {
        const parts = effectiveBaseGoal.split(' ');
        const command = parts[0].slice(1);
        const args = parts.slice(1).join(' ');

        // Search in .agent/workflows/
        const rootPath = process.cwd(); // Root of the project
        const workflowPath = path.join(rootPath, '.agent', 'workflows', `${command}.md`);

        if (fs.existsSync(workflowPath)) {
          console.log(`Expanding alias: ${command}`);
          const content = fs.readFileSync(workflowPath, 'utf-8');
          // Strip YAML frontmatter if present
          const promptBody = content.replace(/^---[\s\S]*?---\n?/, '').trim();
          effectiveBaseGoal = args ? `${promptBody}\n\nContext: ${args}` : promptBody;
        }
      }

      const sanitizedMaxIterations = Math.max(1, Math.min(Math.round(requestedMaxIterations) || 1, 50));
      const hardStopIterations = infiniteMode ? 500 : sanitizedMaxIterations;
      const lastUserMessage =
        [...messages]
          .reverse()
          .find((msg) => msg.role === 'user')?.content || '';
      const baseUserGoal = effectiveBaseGoal || lastUserMessage || '';

      const infiniteDirective =
        infiniteMode && baseUserGoal
          ? `\nThe user enabled **Infinite Loop Mode**. Treat the goal as an endless campaign:\n- Goal: "${baseUserGoal}"\n- Never ask the user for extra details. Invent reasonable copy, targets, or parameters yourself.\n- After you finish a pass (navigate/snapshot/post/reply/like/follow), immediately start planning the next pass and execute without waiting.\n- Rotate between different engagement tactics so the logged-in account keeps growing organically.\n- Summaries should be brief and should not stop you from continuing. Only halt when explicitly told to stop or when safety limits trigger.`
          : '';

      // --- CONTEXT INJECTION START ---
      // Fetch available resources to help the agent understand {{service.id}} tags
      let contextInjection = "\n\n**AVAILABLE RESOURCES (CONTEXT):**\nWhen the user or tool output refers to IDs (e.g. {{service.id}}), they map to the following:\n";

      // 1. Playbooks
      try {
        const { data: playbooks } = await supabase.from('playbooks').select('id, name, description').limit(20);
        if (playbooks && playbooks.length > 0) {
          contextInjection += "\n**Playbooks ({{playbooks.ID}}):**\n";
          playbooks.forEach(p => contextInjection += `- ${p.name}: {{playbooks.${p.id}}} (${p.description || 'No description'})\n`);
        }
      } catch (e) { console.error('Error fetching playbooks context:', e); }

      // 2. Target Lists
      try {
        const { data: lists } = await supabase.from('target_lists').select('id, name').limit(20);
        if (lists && lists.length > 0) {
          contextInjection += "\n**Target Lists ({{lists.ID}}):**\n";
          lists.forEach(l => contextInjection += `- ${l.name}: {{lists.${l.id}}}\n`);
        }
      } catch (e) { console.error('Error fetching lists context:', e); }

      // 3. MCP Servers & API Tools
      try {
        const mcpServers = store.get('mcpServers') || [];
        if (mcpServers.length > 0) {
          contextInjection += "\n**MCP Servers ({{mcp.ID}}):**\n";
          mcpServers.forEach(s => contextInjection += `- ${s.name}: {{mcp.${s.id}}}\n`);
        }
        const apiTools = store.get('apiTools') || [];
        if (apiTools.length > 0) {
          contextInjection += "\n**API Tools ({{apis.ID}}):**\n";
          apiTools.forEach(t => contextInjection += `- ${t.name}: {{apis.${t.id}}}\n`);
        }
      } catch (e) { console.error('Error fetching settings context:', e); }

      contextInjection += "\nUse these IDs when calling tools that require a list_id, playbook_id, etc. The user may write them as tags like 'Run {{playbooks.xyz}}', which translates to the ID 'xyz'.";
      // --- CONTEXT INJECTION END ---

      const effectiveSystemPrompt = enableTools
        ? `${contextInjection}\n\n${BROWSER_AGENT_PROMPT}${infiniteDirective}\n\n${systemPrompt || ''}`
        : systemPrompt;

      if (enableTools) {
        const chatModel = createChatModel(provider, model, false);
        console.log('Registering AI Tools:', requestTools.map(t => t.name).join(', '));
        const modelWithTools = chatModel.bindTools(requestTools, { strict: false } as any);

        let langchainMessages = convertMessages(messages, effectiveSystemPrompt);
        let fullResponse = '';
        let iteration = 0;
        const sentNarrations = new Set<string>(); // Track sent narrations to prevent duplicates
        const recentToolCalls: string[] = []; // Track recent tool calls to detect loops
        const MAX_IDENTICAL_CALLS = 3; // Max times same tool+args can be called consecutively

        while (iteration < hardStopIterations) {
          // Check if user requested stop
          if (window && stopSignals.get(window.id)) {
            stopSignals.set(window.id, false);
            if (window && !window.isDestroyed()) {
              window.webContents.send('ai:stream-chunk', { content: '', done: true });
            }
            break;
          }

          iteration++;

          // Add timeout to prevent hanging - 60 second timeout for model calls
          let response;
          try {
            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Model call timed out after 60s')), 60000)
            );

            // Wrap the invoke call to catch LangChain internal errors
            const invokeWithErrorHandling = async () => {
              try {
                const result = await modelWithTools.invoke(langchainMessages);
                return result;
              } catch (e: any) {
                // LangChain throws when API returns error - extract useful info
                let errorMsg = 'Unknown API error';
                if (e instanceof Error) {
                  errorMsg = e.message;
                } else if (typeof e === 'string') {
                  errorMsg = e;
                } else if (e && typeof e === 'object') {
                  errorMsg = e.message || e.error || (e.response?.data?.error?.message) || JSON.stringify(e);
                }
                throw new Error(errorMsg);
              }
            };

            response = await Promise.race([
              invokeWithErrorHandling(),
              timeoutPromise
            ]) as any;
          } catch (invokeError: any) {
            console.error('Model invoke error:', invokeError);
            // Extract error message safely
            let errorMessage = 'Model call failed';
            if (invokeError instanceof Error) {
              errorMessage = invokeError.message;
            } else if (typeof invokeError === 'object' && invokeError !== null) {
              errorMessage = invokeError.message || invokeError.error || JSON.stringify(invokeError);
            } else if (typeof invokeError === 'string') {
              errorMessage = invokeError;
            }

            // Check if it's a rate limit or API error - retry after delay
            if (errorMessage.includes('rate') || errorMessage.includes('limit') || errorMessage.includes('429')) {
              console.log('Rate limited, waiting 5 seconds before retry...');
              await new Promise(resolve => setTimeout(resolve, 5000));
              continue; // Retry the iteration
            }

            if (window && !window.isDestroyed()) {
              window.webContents.send('ai:stream-chunk', {
                content: `⚠️ Error: ${errorMessage}\n`,
                done: false,
                isNarration: true,
              });
              window.webContents.send('ai:stream-chunk', { content: '', done: true });
            }
            return { success: false, error: errorMessage };
          }

          // Safely access tool_calls - response might be undefined or malformed
          if (!response) {
            console.error('Model returned undefined response');
            if (window && !window.isDestroyed()) {
              window.webContents.send('ai:stream-chunk', {
                content: '⚠️ Model returned an empty response. Please try again.\n',
                done: false,
                isNarration: true,
              });
              window.webContents.send('ai:stream-chunk', { content: '', done: true });
            }
            return { success: false, error: 'Model returned empty response' };
          }

          const toolCalls = response.tool_calls;

          if (!toolCalls || toolCalls.length === 0) {
            const responseContent =
              typeof response.content === 'string'
                ? response.content
                : Array.isArray(response.content)
                  ? response.content
                    .map((chunk: any) =>
                      typeof chunk === 'object' && chunk !== null && 'text' in chunk && typeof chunk.text === 'string'
                        ? chunk.text
                        : ''
                    )
                    .join(' ')
                  : '';
            fullResponse = responseContent;

            // Send the final response text to the frontend
            if (responseContent && responseContent.trim() && window && !window.isDestroyed()) {
              // Clean up the final response
              let cleanResponse = responseContent
                .replace(/^(Narration|Assistant|Reasoning):\s*/gi, '')
                .replace(/^(Yes|OK)[\.]?\s*$/gi, '')
                .replace(/\\boxed\{([\s\S]*?)\}/g, '$1')
                .replace(/(\*\*|\[)?Final Answer(\*\*|\])?:?/gi, '')
                .replace(/^["']|["']$/g, '')
                .trim();

              window.webContents.send('ai:stream-chunk', {
                content: cleanResponse,
                done: false,
                isNarration: false, // Mark as actual response, not narration
              });
            }

            // Check stop signal before continuing in infinite mode
            if (window && stopSignals.get(window.id)) {
              stopSignals.set(window.id, false);
              if (window && !window.isDestroyed()) {
                window.webContents.send('ai:stream-chunk', { content: '', done: true });
              }
              break;
            }

            if (infiniteMode && baseUserGoal && iteration < hardStopIterations) {
              // Let the AI naturally continue without a static message
              // The AI will narrate its own continuation based on context
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

          // Extract and clean narration from the model response
          const agentNarration =
            typeof response.content === 'string'
              ? response.content
              : Array.isArray(response.content)
                ? response.content
                  .map((chunk: any) =>
                    typeof chunk === 'object' && chunk !== null && 'text' in chunk && typeof chunk.text === 'string'
                      ? chunk.text
                      : ''
                  )
                  .join(' ')
                : '';

          // Only send narration if it's meaningful and we have tool calls to execute
          if (agentNarration && agentNarration.trim() && toolCalls.length > 0 && window && !window.isDestroyed()) {
            // Clean up common AI model artifacts
            let cleanNarration = agentNarration
              .replace(/^(Narration|Assistant|Reasoning):\s*/gi, '')
              .replace(/^Yes\.?\s*$/gi, '')
              .replace(/^Ok\.?\s*$/gi, '')
              .replace(/\\boxed\{([\s\S]*?)\}/g, '$1')
              .replace(/(\*\*|\[)?Final Answer(\*\*|\])?:?/gi, '')
              .replace(/^["']|["']$/g, '') // Remove surrounding quotes
              .trim();

            // Send narration if it's meaningful
            if (cleanNarration && cleanNarration.length > 5 && cleanNarration.length < 500) {
              // Create a more robust deduplication key using both content and a hash of the tool calls
              const toolSignature = toolCalls.map((tc: any) => `${tc.name}:${JSON.stringify(tc.args)}`).join('|');
              const narrationKey = `${cleanNarration.toLowerCase().slice(0, 50)}_${toolSignature.slice(0, 30)}`;

              if (!sentNarrations.has(narrationKey)) {
                sentNarrations.add(narrationKey);
                window.webContents.send('ai:stream-chunk', {
                  content: cleanNarration,
                  done: false,
                  isNarration: true,
                });
              }
            }
          }

          let toolExecutionFailed = false;
          let lastToolErrorDescription = '';

          for (const toolCall of toolCalls) {
            const tool = requestToolsByName.get(toolCall.name);
            if (!tool) {
              const errorMsg = new ToolMessage({
                tool_call_id: toolCall.id || '',
                content: JSON.stringify({ error: `Unknown tool: ${toolCall.name}` }),
              });
              langchainMessages.push(errorMsg);
              continue;
            }

            // Detect runaway loops - same tool called repeatedly with same args
            const callSignature = `${toolCall.name}:${JSON.stringify(toolCall.args)}`;
            const identicalCount = recentToolCalls.filter(c => c === callSignature).length;

            if (identicalCount >= MAX_IDENTICAL_CALLS) {
              // Break the loop - tell the AI to try something different
              const loopBreakMsg = new ToolMessage({
                tool_call_id: toolCall.id || '',
                content: JSON.stringify({
                  error: `Loop detected: ${toolCall.name} called ${identicalCount} times with same args. Try a different approach.`,
                  suggestion: 'Use a different tool or different parameters to make progress.'
                }),
              });
              langchainMessages.push(loopBreakMsg);

              if (window && !window.isDestroyed()) {
                window.webContents.send('ai:stream-chunk', {
                  content: `⚠️ Loop detected - skipping repeated ${toolCall.name} call\n`,
                  done: false
                });
              }

              // Clear recent calls to give it a fresh start
              recentToolCalls.length = 0;
              continue;
            }

            // Track this call
            recentToolCalls.push(callSignature);
            // Keep only last 10 calls
            if (recentToolCalls.length > 10) recentToolCalls.shift();

            if (window && !window.isDestroyed()) {
              // Send tool call event without text content pollution
              window.webContents.send('ai:stream-chunk', {
                content: '',
                done: false,
                toolCall: {
                  id: toolCall.id,
                  name: toolCall.name || 'unknown_tool',
                  args: toolCall.args
                }
              });
            }

            try {
              const startTime = Date.now();
              const result = await tool.invoke(toolCall.args);
              const duration = Date.now() - startTime;
              const toolMessage = new ToolMessage({
                tool_call_id: toolCall.id || '',
                content: result,
              });
              langchainMessages.push(toolMessage);

              if (window && !window.isDestroyed()) {
                // Safely parse result - handle non-JSON or malformed responses
                let parsed: any = { success: true, message: 'Done' };

                try {
                  parsed = JSON.parse(result);
                } catch {
                  // If result isn't JSON, wrap it
                  parsed = { success: true, message: typeof result === 'string' ? result : 'Done' };
                }

                const status = parsed?.success ? 'success' : 'failed';

                // Add duration and status to the parsed result for the UI
                const uiResult = {
                  ...parsed,
                  _status: status,
                  _duration: duration
                };

                // Send comprehensive result information without text content pollution
                // Check for stop error in the result to prevent trailing error messages after stop
                const isStopError = parsed?.error && (
                  typeof parsed.error === 'string' && (
                    parsed.error.includes('Stopped by user') ||
                    parsed.error.includes('stop signal')
                  )
                );

                if (!isStopError && (!window || !stopSignals.get(window.id))) {
                  window.webContents.send('ai:stream-chunk', {
                    content: '',
                    done: false,
                    toolResult: {
                      toolCallId: toolCall.id,
                      result: uiResult
                    }
                  });
                }
              }
            } catch (toolError) {
              const errorMessage = new ToolMessage({
                tool_call_id: toolCall.id || '',
                content: JSON.stringify({ error: String(toolError) }),
              });
              langchainMessages.push(errorMessage);

              if (window && !window.isDestroyed()) {
                const errorStr = String(toolError);
                window.webContents.send('ai:stream-chunk', {
                  content: `Error: ${errorStr}\n`,
                  done: false
                });
              }

              toolExecutionFailed = true;
              lastToolErrorDescription =
                toolError instanceof Error ? toolError.message : String(toolError);
              langchainMessages.push(
                new HumanMessage(
                  `Tool "${toolCall.name}" failed with error: "${lastToolErrorDescription}". Diagnose why the schema/inputs were invalid, update your plan, and resend the appropriate tools with corrected arguments.`
                )
              );
              break;
            }

            // Enforced pacing between tool calls so the UI can update and the agent can verify state.
            // Especially important for X actions (reply/like/search) which can take time.
            const delayMs = getToolDelayMs(toolCall.name);
            if (delayMs > 0) {
              await sleep(delayMs);
            }

            // Check stop signal after each tool execution
            if (window && stopSignals.get(window.id)) {
              stopSignals.set(window.id, false);
              if (window && !window.isDestroyed()) {
                window.webContents.send('ai:stream-chunk', { content: '', done: true });
              }
              return { success: true, response: 'Stopped by user' };
            }
          }

          if (toolExecutionFailed) {
            continue;
          }
        }

        if (iteration >= hardStopIterations && infiniteMode && window && !window.isDestroyed()) {
          window.webContents.send('ai:stream-chunk', {
            content: '⚠️ Infinite mode safety limit reached. Stop or start a new request.\n',
            done: false,
          });
        }

        if (window && !window.isDestroyed()) {
          // Don't re-send fullResponse - it was already streamed during tool execution
          // Just signal completion
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

  ipcMain.handle('ai:list-workflows', async () => {
    try {
      const rootPath = process.cwd();
      const workflowDir = path.join(rootPath, '.agent', 'workflows');
      if (!fs.existsSync(workflowDir)) return [];

      const files = fs.readdirSync(workflowDir);
      return files
        .filter(f => f.endsWith('.md'))
        .map(f => ({
          name: f.replace('.md', ''),
          path: path.join(workflowDir, f)
        }));
    } catch (e) {
      console.error('Error listing workflows:', e);
      return [];
    }
  });
}
