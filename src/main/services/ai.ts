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
import { createSiteTools } from './site-tools';
import { createIntegrationTools } from './integration-tools';
import { createUtilityTools } from './utility-tools';
import { DynamicStructuredTool } from '@langchain/core/tools';
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
    agentRunLimit?: number | null;
    speed?: 'slow' | 'normal' | 'fast';
    isPlaybookRun?: boolean;
}

interface ChatModelOptions {
    streaming?: boolean;
    safeMode?: boolean; // Disables extra kwargs like parallel_tool_calls OR extra params like reasoning
    disableReasoning?: boolean; // Specifically disables reasoning but keeps tools if possible
}

function createChatModel(provider: ModelProvider, model: ModelConfig, options: ChatModelOptions | boolean = true) {
    // Backwards compatibility for the third argument being 'streaming' boolean
    const streaming = typeof options === 'boolean' ? options : options.streaming ?? true;
    const safeMode = typeof options === 'object' ? options.safeMode : (arguments.length > 3 ? arguments[3] : false);
    const disableReasoning = typeof options === 'object' ? options.disableReasoning : false;

    const baseUrl = provider.baseUrl?.trim() || undefined;

    const baseConfig = {
        modelName: model.id,
        temperature: 0.7,
        streaming,
    };

    console.log(`[AI Service] Creating model ${model.id} (SafeMode: ${safeMode}, NoReasoning: ${disableReasoning})`);

    switch (provider.type) {
        case 'openai':
            return new ChatOpenAI({
                ...baseConfig,
                apiKey: provider.apiKey,
                configuration: {
                    baseURL: baseUrl,
                },
            });
        case 'custom':
            return new ChatOpenAI({
                ...baseConfig,
                apiKey: provider.apiKey,
                configuration: {
                    baseURL: baseUrl,
                },
                // Disable parallel tool calls for custom providers as they often don't support it
                modelKwargs: {
                    parallel_tool_calls: false
                }
            });
        case 'anthropic':
            return new ChatAnthropic({
                ...baseConfig,
                anthropicApiKey: provider.apiKey,
            });
        case 'openrouter':
            const openAIConfig: any = {
                ...baseConfig,
                apiKey: provider.apiKey,
                configuration: {
                    baseURL: 'https://openrouter.ai/api/v1',
                    defaultHeaders: {
                        'HTTP-Referer': 'https://reavion.ai',
                        'X-Title': 'Reavion Desktop',
                        'User-Agent': 'Reavion/1.0.0',
                    },
                },
            };

            // In Safe Mode, we strip EVERYTHING extra.
            // If disableReasoning is true, we skip adding reasoning params.
            // We also check for likely reasoning-capable models to avoid 400s on smaller models.
            if (!safeMode && !disableReasoning) {
                const modelIdLower = model.id.toLowerCase();
                const likelySupportsReasoning =
                    modelIdLower.includes('deepseek-r1') ||
                    modelIdLower.includes('deepseek/r1') ||
                    modelIdLower.includes('o1-') ||
                    modelIdLower.startsWith('o1');

                if (likelySupportsReasoning) {
                    openAIConfig.modelKwargs = {
                        reasoning: { enabled: true }
                    };
                }
            }

            return new ChatOpenAI(openAIConfig);
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
                console.log("Message: ", msg);
                langchainMessages.push(new AIMessage(msg.content));
            }
        } else if (msg.role === 'tool') {
            console.log("Tool message: ", msg);
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
// ... (start of BROWSER_AGENT_PROMPT not needed in replacement chunk if context sufficient) ...



const BROWSER_AGENT_PROMPT = `**IDENTITY & ROLE**
You are a **Deterministic Execution Agent** and **Browser Automation Specialist**.
While you have "human-like" interaction capabilities, your primary directive is **STRICT ADHERENCE** to instructions and parameters.
You are NOT allowed to decide that a user's search query is "too narrow" or "needs optimization". 
If the user provides a keyword, that is the **ONLY** keyword you use. Generating "better" or "broader" keywords out of thin air is a CRITICAL FAILURE.

**ANTI-SPAM & HUMAN BEHAVIOR PROTOCOLS (CRITICAL)**
You must behave like a genuine human user to avoid getting flagged/blocked.
1.  **VARY YOUR TIMING**: Do not act instantly. The underlying tools have randomized delays, but you should also respect natural pauses in your logic.
2.  **UNIQUE CONTENT IS MANDATORY**:
    *   **NEVER** use templates for replies or DMs.
    *   **NEVER** post nearly identical messages to multiple users.
    *   Each reply must be customized (1-2 sentences) and reference specific details from the target's post.
    *   *Bad*: "Great post! Check out my tool."
    *   *Good*: "That point about [specific detail from post] is interesting. Have you considered [unique perspective]?"
3.  **THROTTLE ACTIONS**:
    *   Do not "rapid-fire" likes or follows. 
    *   If you just engaged with 3 items, wait or scroll before the next batch.
4.  **AVOID ILLOGICAL NAVIGATION**: Humans don't jump 10 pages in 1 second. Scroll naturally.

**CORE OPERATING PROTOCOL (THE O.O.D.A. LOOP)**
You must apply this cycle to every step of your execution. **STRICT REQUIREMENT**: Every time you call a tool, you MUST first provide a brief (1-sentence) narration of your reasoning in your response content. **NEVER CALL TOOLS IN SILENCE.**

1.  **OBSERVE (Current State)**
    *   Where am I? (URL, Page Title)
    *   What is visible? (Use \`browser_dom_snapshot\` actively)
    *   Did my last action succeed? (Check tool output)

2.  **ORIENT (Analysis)**
    *   Does this page match my goal?
    *   If "Yes": What interactive elements (buttons, inputs) are relevant?
    *   If "No": How do I get there? (Navigate, Search, Click Menu)
    *   *Crucial*: If a specific site tool (e.g., \`x_search\`) exists, prefer it. If NOT, use **Universal Browser Tools** immediately.

3.  **DECIDE (Strategy Selection)**
    *   **Happy Path**: Element found -> Call Tool.
    *   **Ambiguity**: Multiple similar elements -> Use \`browser_mark_page\` to assign IDs -> Click by ID.
    *   **Failure**: Element missing -> Scroll down? Search text? Try different selector?

4.  **ACT (Tool Execution)**
    *   Execute the chosen tool.

**UNIVERSAL NAVIGATION STRATEGY (HOW TO BROWSE ANYTHING)**
You can navigate **ANY** website, even those you've never seen.
*   **Initial Landing**: When arriving at a new generic site, ALWAYS call \`browser_dom_snapshot\` (snapshot).
*   **Semantic Search**: To find a link/button, do not guess selectors. Look at the snapshot text.
*   **Precision Interaction**:
    *   If standard \`browser_click\` is risky or ambiguous, use \`browser_mark_page\`.
    *   This draws numeric IDs on everything. **ONCE MARKED, YOU MUST PREFER** calling \`browser_click\` with that numeric ID (e.g., "42"). This is significantly more reliable than CSS selectors for dynamic platforms.

**TOOL HIERARCHY**
1.  **SPECIALIZED TOOLS (Highest Priority)**
    *   If executing a Playbook node or working on X.com/Reddit/LinkedIn, use the specific tools (\`x_like\`, \`reddit_comment\`, etc.).
    *   They are optimized for those platforms.

2.  **UNIVERSAL BROWSER TOOLS (The "Skeleton Key")**
    *   \`browser_navigate\`: Go to URL.
    *   \`browser_dom_snapshot\`: **YOUR EYES**. Use \`only_visible: true\` by default.
    *   \`browser_move_to_element\`: **VISUAL MOTION**. Use this to scroll smoothly to an element and move the pointer helper. **Highly recommended to show the user what you are focusing on.**
    *   \`browser_extract\`: "Read" the page. summaries, finding specific data points.
    *   \`browser_mark_page\`: **PRECISION AIM**. Use when selectors are complex.
    *   \`browser_click\`: Click things.
    *   \`browser_type\`: Type things.
    *   \`browser_scroll\`: Reveal more content.

**PLATFORMS & SPECIALIZED STRATEGY**: 
*   **X (Twitter)**: 
    *   Always prefer \`x_advanced_search\` for discovery. **DO NOT** use generic \`browser_navigate\` with search queries.
    *   **X SCAN SUPERPOWER**: Use \`x_scan_posts\` immediately after searching to get 10-15 posts at once. It captures engagement state, authors, and content in one go.
    *   **ENGAGEMENT**: Always use the \`expected_author\` parameter in \`x_engage\`/\`x_reply\` to verify the target.
    *   **BE HUMAN**: Vary your engagement types (like vs reply vs follow). Don't just "reply all".
*   **LINKEDIN/REDDIT**: Use platform-specific tools first, then fallback to \`browser_mark_page\` + \`browser_click\` for high precision.


**ERROR RECOVERY & RESILIENCE**
*   **NEVER** loop the same failed action.
*   **ERROR**: "Element not found" -> **FIX**:
    1.  Is it just off-screen? -> \`browser_scroll\`.
    2.  Is the selector wrong? -> \`browser_mark_page\` -> Click by ID.
    3.  Is the page not loaded? -> \`wait\` or \`browser_dom_snapshot\` to verify.
*   **ERROR**: "Timeout" -> **FIX**: The page might be heavy. Wait longer or stop loading. Check if the *content* you need is valid despite the timeout.

**PLAYBOOK EXECUTION RULES (STRICT)**
If running a Playbook ({{playbooks.ID}}):
1.  **Follow the Graph**: Move Node -> Edge -> Node.
    *   **Logical Direction**: Playbooks are directed flows (usually **Top-to-Bottom** or **Left-to-Right**). Always follow the arrows.
2.  **Sequential Execution**: **DO NOT SKIP NODES**. 
    *   If the graph has 5 nodes (A->B->C->D->E), you MUST report status for all 5.
    *   **ONE TURN = ONE STEP**: Ideally, perform the action for one node, report success, and then start the next node in the next turn (or at least as separate sequential tool calls). 
    *   **NEVER** perform the logic of Node B and Node C together and only report success for Node C.
3.  **Variable Resolution**: **CRITICAL**: You must resolve all variables like {{scout-1.topics}}, {{search-1.items[0].url}}, etc. BEFORE calling any tool.
    *   Look at the tool outputs from previous nodes in the chat history.
    *   If a node output is a list, pick the current item correctly.
4.  **Visualization (MANDATORY)**: The user's ONLY way to see progress is through your reports.
    *   **RULE**: YOU MUST call \`report_playbook_node_status(nodeId = "...", status = "running")\` IMMEDIATELY upon starting a node.
    *   **RULE**: YOU MUST call \`report_playbook_node_status(nodeId = "...", status = "success")\` IMMEDIATELY after finalizing a node's logic.
    *   **NEVER SKIP A NODE**: Even if a node is simple (like "Start" or "End"), report it.
    *   **ORDER IS CRITICAL**: Report "running" -> Do Action -> Report "success". If you do the action first, the UI will look stuck.
    *   **TOOL OUTPUTS**: After reporting success, explain WHAT you found or did in the 'message' parameter so the user sees it in their logs.
6. **Search & Parameter Strictness (ZERO TOLERANCE)**:
    *   **FIXED PARAMETERS**: When a node defines keywords, dates, or filters, these are **ABSOLUTE**. 
    *   **NO EXPANSION**: Do NOT "broaden results", "adjust criteria", or "try similar terms". 
    *   **NO HALLUCINATION**: If the user set "build in public", you may NOT search for "startup saas product". 
    *   **FAILURE IS VALID**: If a strict search returns no results, report: "Search returned no results with configured parameters." and move to the next logical step or stop. 
    *   **AI GENERATION**: Only generate keywords if the field specifically contains a variable target like {{agent.decide}} or if the 'Prompt' field explicitly asks for exploration.
7. **Placeholders**: Never pass literal {{target.url}} or {{agent.decide}}.
    *   **{{agent.decide}}**: YOU MUST GENERATE FINAL TEXT. Be creative and context-aware.
    *   **{{target.url}}**: Extract the actual URL from your state/context.

**DATA COLLECTION RULES**
*   **Tasks**: "Find leads", "Scrape", "Create list".
*   **Action**: Use \`db_create_target\` or \`db_create_target_list\`.
*   **Constraint**: Do NOT engage (like/reply) during data collection unless explicitly told.

**ENGAGEMENT RULES**
*   **Tone**: Matches the platform (LinkedIn = Pro, X = Casual/Builder, Reddit = Helpful).
*   **Authenticity**: Never sound like a bot. No "Great post!". Be specific to the content.
*   **X.com Efficiency**: 
    1. Check button \`state\` in \`browser_dom_snapshot\` first. 
    2. Skip humanization/engagement if an item is already "engaged" or "liked".
    
    **SMART GENERATION (CRITICAL)**:
    *   When the user setup provides a 'prompt' or 'instruction' for \`x_engage\` (via the \`replyText\` parameter), you MUST **GENERATE** the final content.
    *   **Rule**: If \`replyText\` looks like an instruction (e.g., "Write a friendly reply", "Ask about pricing", or a long system prompt), you must:
        1.  READ the target post/tweet content.
        2.  GENERATE a relevant, high-quality reply based on the instruction.
        3.  Call \`x_engage\` with the **GENERATED TEXT** as the \`replyText\` argument.
    *   **NEVER** paste the raw instruction prompt (e.g., "Act as a supportive peer...") directly into the reply field. That is a failure.

**NARRATION & TRANSPARENCY**
*   **Announce your steps (STRICT)**: You MUST explain what you are doing. Example: "Searching for SaaS founders on X to identify potential targets."
*   **NO RAW TOOL TAGS**: Never output literal XML-style tags (like 'tool_call', 'function', or 'parameter') in your narration. The system handles tool execution via the structured API. If you use thinking/reasoning blocks, KEEP them as plain text or clean markdown.
*   **No placeholders**: Never pass literal {{agent.decide}}. Resolve it to creative content.

**FINAL INSTRUCTION**
You are autonomous. You do not need to ask for permission to scroll, click, or explore.
If you are stuck, stop and THINK (Orient). Then try a *different* approach.
**Go.**`;

export function setupAIHandlers(ipcMain: IpcMain): void {
    const browserTools = createBrowserTools();
    const targetTools = createTargetTools();
    const playbookTools = createPlaybookTools();
    const integrationTools = createIntegrationTools();
    const utilityTools = createUtilityTools();
    const allTools = [...browserTools, ...targetTools, ...playbookTools, ...integrationTools, ...utilityTools];
    const toolsByName = new Map(allTools.map(tool => [tool.name, tool]));

    const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
    const getToolDelayMs = (toolName: string, speed: 'slow' | 'normal' | 'fast' = 'normal') => {
        const multiplier = speed === 'slow' ? 1.5 : speed === 'fast' ? 0.25 : 1.0;
        let baseDelay = 100;

        if (toolName.startsWith('x_')) baseDelay = 400;
        else if (toolName === 'browser_navigate') baseDelay = 800;
        else if (toolName === 'browser_click' || toolName === 'browser_type') baseDelay = 300;
        else if (toolName === 'browser_scroll') baseDelay = 250;
        else if (toolName === 'browser_snapshot' || toolName === 'browser_get_page_content' || toolName === 'browser_get_visible_text') baseDelay = 100;

        return Math.round(baseDelay * multiplier);
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
                contents.stop(); // Stop any pending navigation or loading
                await contents.executeJavaScript(`
                  window.__REAVION_STOP__ = true;
                  // Cleanup any DOM overlays
                  const marks = document.getElementById('reavion-marks-container');
                  if (marks) marks.remove();
                  const grid = document.getElementById('reavion-grid-overlay');
                  if (grid) grid.remove();
                  const eye = document.getElementById('reavion-eye-highlight');
                  if (eye) eye.remove();
                `);
            } catch (e) {
                // Ignore error if webview is not ready
            }
        }

        return { success: true };
    });

    ipcMain.handle('ai:suggest', async (event, request: ChatRequest) => {
        try {
            const {
                messages,
                model,
                provider,
                initialUserPrompt
            } = request;

            const isDiscovery = !initialUserPrompt || initialUserPrompt.trim().length < 2;
            // Using Safe Mode (no reasoning/tools-prep) for suggestions to ensure maximum compatibility
            const chatModel = createChatModel(provider, model, { streaming: false, safeMode: true });

            // Extract context for better suggestions
            const playbookContext = request.playbooks?.map(p => `- ${p.name}: ${p.description}`).join('\n') || 'No active playbooks.';
            const listContext = request.targetLists?.map(l => `- ${l.name} (${l.target_count} targets)`).join('\n') || 'No target lists yet.';

            const systemPrompt = `You are a high-performance growth strategist and AI orchestrator for Reavion, an autonomous agent that dominates social media and lead generation.
Your goal is to generate 3 BRILLIANT, high-impact suggestions that will WOW the user by showing what Reavion can truly do.

COMMANDS & CAPABILITIES:
- X.com (Twitter): Search, advanced search, scanning posts, multi-step engagement, liking, replying, following.
- LinkedIn: Researching profiles, lead extraction.
- Browser: Navigating, clicking, typing, scrolling, extracting data, taking snapshots.
- Database: Saving leads to Target Lists, running Playbooks.

AVAILABLE ASSETS:
Playbooks:
${playbookContext}

Target Lists:
${listContext}

INSTRUCTIONS:
${isDiscovery
                    ? "The user is at the start. Suggest 3 'Power Moves'. One for aggressive social growth, one for precise lead generation using LinkedIn/web, and one for competitive analysis or multi-platform research."
                    : `The user is interested in: "${initialUserPrompt}". Create 3 context-aware suggestions. One should be a direct continuation of their thought, one should be a more advanced version of it, and one should be a related 'cross-platform' synergy (e.g., if they mention X, suggest saving leads from X to a database).`}

Return ONLY a raw JSON array of objects: { "label": string (max 18 chars), "prompt": string (one clear sentence) }.

Example:
[
  { "label": "X Growth Hack", "prompt": "Find top SaaS influencers on X, scan their recent posts, and engage with high-value replies using my 'Growth' playbook." },
  { "label": "Sales Intel", "prompt": "Search LinkedIn for tech founders in New York, scrape their details, and save them to my 'Early Adopters' list." }
]

CRITICAL:
- No emojis.
- No markdown code blocks.
- No conversational filler.
- Focus on autonomy and multi-step actions.`;

            const langchainMessages = [
                new HumanMessage(`${systemPrompt}\n\nUser Input: ${initialUserPrompt || "Show me some power moves."}`)
            ];

            // Add timeout - increased to 60s
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Suggestion timed out')), 60000)
            );

            console.log(`[AI Service] Fetching smart suggestions for: "${initialUserPrompt || 'Starter ideas'}" using ${model.id}`);
            const response: any = await Promise.race([
                chatModel.invoke(langchainMessages),
                timeoutPromise
            ]);
            console.log(`[AI Service] Suggestion response received`);

            let content = typeof response.content === 'string' ? response.content : "";
            if (content) {
                // Clean up markdown code blocks if present (despite instructions)
                content = content.replace(/```json/g, '').replace(/```/g, '').trim();
                try {
                    const suggestions = JSON.parse(content);
                    if (Array.isArray(suggestions)) {
                        return { success: true, suggestions: suggestions.slice(0, 3) };
                    }
                } catch (e) {
                    console.error('Failed to parse suggestion JSON', e);
                }
            }

            return { success: false, error: 'Invalid response format' };

        } catch (error) {
            console.error('AI Suggestion Error:', error);
            return { success: false, error: String(error) };
        }
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
                targetLists = [],
                speed,
                isPlaybookRun = false
            } = request;
            const window = BrowserWindow.fromWebContents(event.sender);
            if (window) {
                stopSignals.set(window.id, false);
            }

            // Create a scoped Supabase client for this request using the access token
            // This avoids the "AuthSessionMissingError" by setting the Authorization header directly
            let scopedSupabase = supabase;
            if (accessToken) {
                // We use the createClient from the library, but we need to import it.
                // Since we can't easily import it here without changing imports, we'll try to use the global one but
                // it's safer to create a new one. The best way is to rely on the fact that if we just want to query,
                // we can create a client with the token.
                const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
                const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
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

            // Track current speed for this session
            let currentSessionSpeed: 'slow' | 'normal' | 'fast' = speed || 'normal';
            const getSpeed = () => currentSessionSpeed;

            // Check if any playbook in the context is the primary one being discussed and has a speed set
            if (initialUserPrompt && playbooks.length > 0) {
                const mentionedPlaybook = playbooks.find(p =>
                    initialUserPrompt.toLowerCase().includes(p.name.toLowerCase())
                );
                if (mentionedPlaybook?.execution_defaults?.speed) {
                    currentSessionSpeed = mentionedPlaybook.execution_defaults.speed;
                    console.log(`[AI Service] Auto-detected speed from mentioned playbook: ${currentSessionSpeed}`);
                }
            }

            // Re-create tools with context AND the scoped supabase client
            const requestBrowserTools = createBrowserTools({ getSpeed });
            const requestTargetTools = createTargetTools({ targetLists, supabaseClient: scopedSupabase });
            let requestPlaybookTools = createPlaybookTools({
                playbooks,
                supabaseClient: scopedSupabase,
                onPlaybookLoaded: (playbook) => {
                    if (playbook.execution_defaults?.speed) {
                        currentSessionSpeed = playbook.execution_defaults.speed;
                        console.log(`[AI Service] Speed updated from loaded playbook: ${currentSessionSpeed}`);
                    }
                }
            });

            // Only allow reporting node status in isolated Playbook Mode
            if (!isPlaybookRun) {
                requestPlaybookTools = requestPlaybookTools.filter(t => t.name !== 'report_playbook_node_status');
            }


            const requestIntegrationTools = createIntegrationTools();
            const requestUtilityTools = createUtilityTools({ provider, model });

            const requestToolsRaw = [
                ...requestBrowserTools,
                ...requestTargetTools,
                ...requestPlaybookTools,
                ...requestIntegrationTools,
                ...requestUtilityTools
            ];

            const deduplicatedTools: DynamicStructuredTool[] = [];
            const seenNames = new Set<string>();
            const duplicatesFound: string[] = [];

            for (const tool of requestToolsRaw) {
                const normalizedName = tool.name.trim();
                if (!seenNames.has(normalizedName)) {
                    seenNames.add(normalizedName);
                    deduplicatedTools.push(tool);
                } else {
                    duplicatesFound.push(normalizedName);
                }
            }

            const requestToolsByName = new Map(deduplicatedTools.map(tool => [tool.name, tool]));

            if (duplicatesFound.length > 0) {
                console.warn(`[AI Service] Found and removed ${duplicatesFound.length} duplicate tools:`, duplicatesFound);
            }

            console.log(`[AI Service] Final Tool Count: ${deduplicatedTools.length} (out of ${requestToolsRaw.length} raw)`);

            // Reset renderer stop signal
            const contents = getWebviewContents('main-tab');
            if (contents && !contents.isDestroyed()) {
                try {
                    await contents.executeJavaScript('window.__REAVION_STOP__ = false;');
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

            // Increase limit for Playbook runs significantly to allow complex loops
            const defaultMax = isPlaybookRun ? 200 : 50;
            const sanitizedMaxIterations = Math.max(1, Math.min(Math.round(requestedMaxIterations) || 1, 200));
            const hardStopIterations = infiniteMode ? 500 : (isPlaybookRun ? Math.max(sanitizedMaxIterations, 100) : sanitizedMaxIterations);
            const lastUserMessage =
                [...messages]
                    .reverse()
                    .find((msg) => msg.role === 'user')?.content || '';
            const baseUserGoal = effectiveBaseGoal || lastUserMessage || '';

            const infiniteDirective =
                infiniteMode && baseUserGoal
                    ? `\nThe user enabled **Infinite Loop Mode**. This means you must execute the task continuously without stopping:\n- Goal: "${baseUserGoal}"\n- **CONTINUITY**: Never ask the user for extra details. Self-correct and continue. After one cycle is done, immediately start the next.\n- **IF DATA COLLECTION**: If the goal is to find leads, save targets, or scrape: Continue finding NEW leads (pagination, new searches) and saving them. **DO NOT** switch to engaging/replying.\n- **IF ENGAGEMENT**: If the goal is to reply, like, or post: Rotate tactics and continue engaging to grow the account.\n- **Summaries**: Keep them extremely brief (1 line) and do not stop.`
                    : '';

            // --- CONTEXT INJECTION START ---
            // Fetch available resources to help the agent understand {{service.id}} tags
            let contextInjection = "\n\n**AVAILABLE RESOURCES (CONTEXT):**\nWhen the user or tool output refers to IDs (e.g. {{service.id}}), they map to the following:\n";

            // 1. Playbooks
            try {
                const { data: playbooks } = await scopedSupabase.from('playbooks').select('id, name, description, graph').limit(20);
                if (playbooks && playbooks.length > 0) {
                    contextInjection += "\n**Playbooks ({{playbooks.ID}}):**\n";
                    playbooks.forEach(p => {
                        // Extract Node IDs for context context suggestion
                        const nodeIds = (p.graph as any)?.nodes?.map((n: any) => `"${n.label || n.id}" (${n.id})`).join(', ') || 'No nodes';
                        contextInjection += `- ${p.name}: {{playbooks.${p.id}}}\n  Description: ${p.description || 'None'}\n  Nodes: ${nodeIds}\n`;
                    });
                }
            } catch (e) { console.error('Error fetching playbooks context:', e); }

            // 2. Target Lists
            try {
                const { data: lists } = await scopedSupabase.from('target_lists').select('id, name').limit(20);
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

            // 4. Active Toolkit (Dynamic Capability Awareness)
            // This ensures the agent knows exactly which tools are instantiated for this session
            const activeToolNames = deduplicatedTools.map(t => t.name).join(', ');
            contextInjection += `\n\n**ACTIVE TOOLKIT (Reference):**\n${activeToolNames}\n`;
            // --- CONTEXT INJECTION END ---

            const now = new Date();
            const timeContext = `\n**TEMPORAL CONTEXT:**\n- Current Date: ${now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}\n- Current Time: ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}\n- ISO Timestamp: ${now.toISOString()}\n- Note: Use this "Current Date" as the anchor for all relative date calculations (e.g., "last week", "yesterday", "30 days ago").\n`;

            const nonVisionModels = ['glm-4.7', 'glm-4-9b', 'deepseek-chat', 'llama-3', 'mistral-large'];
            const modelLower = model.id.toLowerCase();
            const isKnownNonVision = nonVisionModels.some(m => modelLower.includes(m)) ||
                (modelLower.startsWith('glm-') && !modelLower.includes('v'));

            const visionDirective = isKnownNonVision
                ? `\n\n**CRITICAL: NO VISION CAPABILITIES**\nYour current model (${model.id}) CANNOT see images or screenshots. 
- **DO NOT** use 'browser_screenshot' or 'browser_vision_snapshot'.
- **USE 'browser_dom_snapshot'** exclusively to see the page content via text/DOM.
- If you need to find something on the screen, rely on the DOM tree and IDs.`
                : '';
            const playbookDirective = isPlaybookRun
                ? `\n\n**CRITICAL: PLAYBOOK AUTONOMY**
You are currently executing a Playbook graph ({{playbooks.ID}}). 
- **STAY IN THE FLOW**: Your ONLY objective is to reach a terminal node (e.g., 'Finished', 'End') by following the edges.
- **NO CHAT**: Do NOT stop to chat with the user. Do NOT summarize and wait for instructions. 
- **AUTONOMOUS LOOPS**: If you are in a loop (e.g., 'Engage Loop'), you must execute EVERY item in the loop autonomously. Do NOT stop after one item.
- **FORCE PROGRESS**: Every response you provide SHOULD include tool calls (e.g., \`report_playbook_node_status\` or a browser action) until you reach the 'Finished' node. Outputting only text will terminate the automation.`
                : '';

            const speedDirective = currentSessionSpeed === 'fast'
                ? `\n\n**CRITICAL: HIGH SPEED EXECUTION (TURBO)**
You are in FAST mode. 
- **BE EFFICIENT**: Minimize descriptions and narrations. Focus on high-speed tool execution.
- **BATCH TOOLS**: You ARE ALLOWED and ENCOURAGED to call multiple tools in a single turn if they are sequential and non-conflicting. For example, you can call \`report_playbook_node_status\` (running) AND the actual platform action (e.g., \`x_engage\`) in the same turn to save time.
- **REUSE CONTEXT**: If you just scanned a page or received results, act on them immediately without re-scanning unless necessary.`
                : '';

            const effectiveSystemPrompt = enableTools
                ? `${contextInjection}\n${timeContext}${visionDirective}${playbookDirective}${speedDirective}\n${BROWSER_AGENT_PROMPT}${infiniteDirective}\n\n${systemPrompt || ''}`
                : systemPrompt;

            if (enableTools) {
                let chatModel = createChatModel(provider, model, false);
                console.log('Registering AI Tools:', deduplicatedTools.map(t => t.name).join(', '));
                // Bind tools without strict mode to avoid "all fields must be required" warning
                // The strict mode requires all schema fields to be required, which conflicts with optional tool parameters
                console.log(`[AI Service] Binding ${deduplicatedTools.length} tools to model`);
                let modelWithTools = chatModel.bindTools(deduplicatedTools, { strict: false } as any);

                let langchainMessages = convertMessages(messages, effectiveSystemPrompt);
                let fullResponse = '';
                let iteration = 0;
                const sentNarrations = new Set<string>(); // Track sent narrations to prevent duplicates


                while (iteration < hardStopIterations) {
                    // Check if user requested stop
                    if (window && (stopSignals.get(window.id) || (global as any).__REAVION_STOP_ALL__)) {
                        console.log(`[AI Service] Stop signal detected for window ${window.id}. Aborting autonomous loop.`);
                        stopSignals.set(window.id, false);
                        if (window && !window.isDestroyed()) {
                            window.webContents.send('ai:stream-chunk', { content: '🛑 Task stopped by user.\n', done: true });
                        }
                        break;
                    }

                    iteration++;

                    // Send a signal that a new autonomous turn is starting to ensure chronological ordering in the UI
                    if (window && !window.isDestroyed()) {
                        window.webContents.send('ai:stream-chunk', { content: '', isNewTurn: true });
                    }

                    // Add timeout to prevent hanging - 180 second timeout for model calls
                    // Increased from 120s to 180s to handle complex operations
                    let response;
                    try {
                        const timeoutPromise = new Promise((_, reject) =>
                            setTimeout(() => reject(new Error('Model call timed out after 180s')), 180000)
                        );

                        // Wrap the invoke call to catch LangChain internal errors
                        const invokeWithErrorHandling = async () => {
                            try {
                                const result = await modelWithTools.invoke(langchainMessages);
                                return result;
                            } catch (e: any) {
                                // LangChain throws when API returns error - extract useful info
                                console.error('Raw Model Invoke Error:', e);

                                let errorMsg = 'Unknown API error';
                                if (e instanceof Error) {
                                    errorMsg = e.message;
                                } else if (typeof e === 'string') {
                                    errorMsg = e;
                                } else if (e && typeof e === 'object') {
                                    // Check for provider-specific error details (OpenAI/OpenRouter often return this structure)
                                    if (e.response?.data?.error) {
                                        const apiError = e.response.data.error;
                                        const detail = apiError.message || JSON.stringify(apiError);
                                        const type = apiError.type ? ` (${apiError.type})` : '';
                                        errorMsg = `Provider Error: ${detail}${type}`;
                                    } else {
                                        errorMsg = e.message || e.error || JSON.stringify(e);
                                    }
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

                        // Check if it's a rate limit or API error - retry after delay
                        if (errorMessage.includes('rate') || errorMessage.includes('limit') || errorMessage.includes('429')) {
                            console.log('Rate limited, waiting 5 seconds before retry...');
                            await new Promise(resolve => setTimeout(resolve, 5000));
                            continue; // Retry the iteration
                        }

                        // AUTO-RECOVERY LOGIC
                        // If model rejects tools or specific config (400 Bad Request / Schema validation), try a staged downgrade
                        if (errorMessage.includes('400') || errorMessage.toLowerCase().includes('not support') || errorMessage.toLowerCase().includes('schema') || errorMessage.toLowerCase().includes('validation')) {
                            console.log(`[Auto-Recovery] Model invocation failed (${errorMessage}). Attempting downgrade...`);

                            let success = false;

                            // Stage 1: Attempt without Reasoning BUT WITH tools
                            try {
                                console.log('[Auto-Recovery] Stage 1: Retrying with reasoning DISABLED...');
                                if (window && !window.isDestroyed()) {
                                    window.webContents.send('ai:stream-chunk', {
                                        content: `⚠️ Model config error. Retrying with reasoning disabled...\n`,
                                        done: false,
                                        isNarration: true,
                                    });
                                }

                                const downgradedModel = createChatModel(provider, model, { streaming: false, disableReasoning: true });
                                const bindedDowngraded = downgradedModel.bindTools(deduplicatedTools, { strict: false } as any);

                                response = await bindedDowngraded.invoke(langchainMessages);

                                // If success, update the context for subsequent turns so we don't keep failing
                                chatModel = downgradedModel;
                                modelWithTools = bindedDowngraded;
                                success = true;
                                console.log('[Auto-Recovery] Stage 1 Success: Continuing without reasoning.');
                            } catch (stage1Error: any) {
                                console.error('[Auto-Recovery] Stage 1 Failed:', stage1Error.message);
                            }

                            // Stage 2: Safe Mode (No tools at all)
                            if (!success) {
                                try {
                                    console.log('[Auto-Recovery] Stage 2: Retrying in SAFE MODE (No tools)...');
                                    if (window && !window.isDestroyed()) {
                                        window.webContents.send('ai:stream-chunk', {
                                            content: `⚠️ Model incompatible with tools. Switching to plain text chat mode...\n`,
                                            done: false,
                                            isNarration: true,
                                        });
                                    }
                                    const plainModel = createChatModel(provider, model, { streaming: false, safeMode: true });
                                    response = await plainModel.invoke(langchainMessages);

                                    // In plain mode, we stop trying to use tools for this iteration's model
                                    modelWithTools = plainModel as any;
                                    success = true;
                                    console.log('[Auto-Recovery] Stage 2 Success: Continuing in safe mode.');
                                } catch (stage2Error: any) {
                                    console.error('[Auto-Recovery] Stage 2 Failed:', stage2Error.message);
                                    errorMessage = `Recovery failed: ${stage2Error.message || stage2Error}`;
                                }
                            }
                        }

                        if (!response) {
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
                        let responseContent = "";
                        const assistantMsg = response as any;

                        if (assistantMsg.additional_kwargs?.reasoning_content) {
                            responseContent = assistantMsg.additional_kwargs.reasoning_content;
                        }

                        if (!responseContent || responseContent.trim().length === 0) {
                            responseContent = typeof response.content === 'string'
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
                        }
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
                                    `Remain in autonomous mode. Goal: "${baseUserGoal}". Immediately plan and execute the next set of actions. \n- If expanding a list, find NEW targets.\n- If engaging, find NEW posts.\n- Do NOT ask for clarification. Do NOT switch tasks (e.g. dont start engaging if the goal is just data collection).\n- Summarize briefly and continue.`
                                )
                            );
                            iteration = 0;
                            continue;
                        }

                        break;
                    }

                    langchainMessages.push(response);

                    console.log("Response: ", response);

                    // Extract and clean narration from the model response
                    // Some models (like DeepSeek via OpenRouter) return reasoning in a separate field
                    let agentNarration = "";
                    const assistantMsg = response as any;

                    // 1. Try dedicated reasoning fields
                    if (assistantMsg.additional_kwargs?.reasoning_content) {
                        agentNarration = assistantMsg.additional_kwargs.reasoning_content;
                    } else if (assistantMsg.additional_kwargs?.thought) {
                        agentNarration = assistantMsg.additional_kwargs.thought;
                    } else if (assistantMsg.additional_kwargs?.thinking) {
                        agentNarration = assistantMsg.additional_kwargs.thinking;
                    } else if (assistantMsg.additional_kwargs?.internal_monologue) {
                        agentNarration = assistantMsg.additional_kwargs.internal_monologue;
                    }

                    console.log("Agent narration: ", response);
                    // 2. Fallback to main content if reasoning fields are empty
                    if (!agentNarration || agentNarration.trim().length === 0) {
                        agentNarration = typeof response.content === 'string'
                            ? response.content
                            : Array.isArray(response.content)
                                ? response.content
                                    .map((chunk: any) =>
                                        typeof chunk === "object" && chunk !== null && "text" in chunk && typeof chunk.text === "string"
                                            ? chunk.text
                                            : ""
                                    )
                                    .join(" ")
                                : "";
                    }


                    // Send narration if we have any meaningful text. 
                    // We send this even if there are no tool calls, as it might be a multi-turn intermediate thought.
                    if (agentNarration && agentNarration.trim() && window && !window.isDestroyed()) {
                        const cleanNarration = agentNarration
                            .replace(/<(tool_call|function|parameter|call|arg_[a-z]+).*?>[\s\S]*?<\/(tool_call|function|parameter|call|arg_[a-z]+)>/gi, '') // Strip entire blocks
                            .replace(/<(\/?[a-z0-9_-]+).*?>/gi, '') // Strip any remaining stray tags
                            .replace(/^(Narration|Assistant|Reasoning|Thought):\s*/gi, '')
                            .replace(/^Yes\.?\s*$/gi, '')
                            .replace(/^Ok\.?\s*$/gi, '')
                            .replace(/\\boxed\{([\s\S]*?)\}/g, '$1')
                            .replace(/(\*\*|\[)?Final Answer(\*\*|\])?:?/gi, '')
                            .replace(/^["']|["']$/g, '') // Remove surrounding quotes
                            .trim();

                        if (cleanNarration && cleanNarration.length >= 1) {
                            // Send narration if it exists (relaxed limits: 50,000 chars for long reasoning)
                            if (cleanNarration.length < 50000) {
                                window.webContents.send('ai:stream-chunk', {
                                    content: cleanNarration,
                                    done: false,
                                    isNarration: true
                                });
                            } else {
                                window.webContents.send('ai:stream-chunk', {
                                    content: cleanNarration.slice(0, 49990) + '... (thinking truncated)',
                                    done: false,
                                    isNarration: true
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

                        // Track this call - usage removed
                        // Loop detection removed per user request

                        // --- Placeholder Guardian ---
                        const argsStr = JSON.stringify(toolCall.args);
                        // Catch ANY {{placeholder}} pattern
                        const placeholderMatch = argsStr.match(/\{\{.*?\}\}/);
                        if (placeholderMatch) {
                            const placeholder = placeholderMatch[0];
                            const warningMsg = `STOP: You attempted to call tool "${toolCall.name}" with a literal placeholder "${placeholder}". Resolve variables before calling tools.`;
                            console.warn(`[AI Service] Placeholder detected: ${placeholder}`);

                            langchainMessages.push(new ToolMessage({
                                tool_call_id: toolCall.id || '',
                                content: JSON.stringify({ error: warningMsg }),
                            }));
                            toolExecutionFailed = true;
                            continue; // Don't break, must answer all tool calls for Azure/OpenAI strictness
                        }

                        if (window && !window.isDestroyed()) {
                            // Check stop signal before each tool execution
                            if (stopSignals.get(window.id)) {
                                console.log(`[AI Service] Stop signal detected before tool ${toolCall.name}.`);
                                break;
                            }

                            // Special Playbook Visualization Handler - Only send if explicitly in playbook run mode
                            if (toolCall.name === 'report_playbook_node_status') {
                                console.log('[AI Service] Reporting Playbook Node Status:', toolCall.args);
                                if (isPlaybookRun) {
                                    window.webContents.send('ai:playbook-status', toolCall.args);
                                } else {
                                    console.log('[AI Service] Skipping playbook status visualization (not in Playbook Run mode)');
                                }
                            }

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

                            // Apply dynamic sleep based on tool and speed
                            const delay = getToolDelayMs(toolCall.name, getSpeed());
                            await sleep(delay);

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
                            // Check if the error is due to a stop signal
                            const errorStr = String(toolError);
                            const isStopError = errorStr.includes('Stopped by user') || errorStr.includes('stop signal');

                            if (window && (stopSignals.get(window.id) || isStopError)) {
                                stopSignals.set(window.id, false);
                                if (!window.isDestroyed()) {
                                    window.webContents.send('ai:stream-chunk', { content: '', done: true });
                                }
                                return { success: true, response: 'Stopped by user' };
                            }

                            const errorMessage = new ToolMessage({
                                tool_call_id: toolCall.id || '',
                                content: JSON.stringify({ error: errorStr }),
                            });
                            langchainMessages.push(errorMessage);

                            if (window && !window.isDestroyed()) {
                                window.webContents.send('ai:stream-chunk', {
                                    content: `Error: ${errorStr}\n`,
                                    done: false
                                });
                            }

                            toolExecutionFailed = true;
                            lastToolErrorDescription =
                                toolError instanceof Error ? toolError.message : errorStr;
                            langchainMessages.push(
                                new HumanMessage(
                                    `Tool "${toolCall.name}" failed with error: "${lastToolErrorDescription}". Diagnose why the schema/inputs were invalid, update your plan, and resend the appropriate tools with corrected arguments.`
                                )
                            );
                            break;
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

    ipcMain.handle('ai:test-connection', async (_event, { provider, modelId }: { provider: ModelProvider; modelId?: string }) => {
        try {
            console.log(`[AI Service] Testing connection for ${provider.type} (${provider.name})`);

            // Determine a model to use for testing
            let testModelId = modelId;
            if (!testModelId) {
                if (provider.models.length > 0) {
                    testModelId = provider.models[0].id;
                } else {
                    // Fallbacks for empty providers (e.g. new ones)
                    switch (provider.type) {
                        case 'openai': testModelId = 'gpt-3.5-turbo'; break;
                        case 'anthropic': testModelId = 'claude-3-haiku-20240307'; break;
                        case 'openrouter': testModelId = 'openai/gpt-3.5-turbo'; break;
                        case 'custom': testModelId = 'gpt-3.5-turbo'; break; // Common default for compatible APIs
                        default: testModelId = 'gpt-3.5-turbo';
                    }
                }
            }

            // Create a temporary model config for testing
            const testModel: ModelConfig = {
                id: testModelId!,
                name: 'Test Model',
                providerId: provider.id,
                contextWindow: 4096,
                enabled: true
            };

            const chatModel = createChatModel(provider, testModel, false);

            // Simple test using invoke instead of stream for speed
            // Use a very short prompt to save tokens/time
            const response = await chatModel.invoke([new HumanMessage("Test connection. Reply with 'OK'.")]);

            return {
                success: true,
                message: 'Connection verified successfully',
                response: response.content
            };
        } catch (error: any) {
            console.error('AI Connection Test Error:', error);
            return {
                success: false,
                error: error.message || String(error)
            };
        }
    });
}
