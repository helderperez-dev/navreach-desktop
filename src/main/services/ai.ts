import { IpcMain, BrowserWindow, app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { HumanMessage, AIMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import type { ModelProvider, ModelConfig, Message } from '../../shared/types';
import { createBrowserTools, getWebviewContents, resetBrowser } from './browser-tools';
import { createTargetTools } from './target-tools';
import { createPlaybookTools } from './playbook-tools';
import { createSiteTools } from './site-tools';
import { createIntegrationTools } from './integration-tools';
import { createUtilityTools } from './utility-tools';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { supabase, getScopedSupabase, getUserIdFromToken } from '../lib/supabase';
import Store from 'electron-store';
import type { AppSettings } from '../../shared/types';
import { systemSettingsService } from './settings.service';
import { usageService } from './usage.service';
import { stripeService } from './stripe.service';
import { analytics } from './analytics';

export const store = new Store<AppSettings>({
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
    workspaceId?: string;
    workspaceSettings?: {
        disabledTools?: string[];
        disabledMCPServers?: string[];
    };
}

export interface ChatModelOptions {
    streaming?: boolean;
    safeMode?: boolean; // Disables extra kwargs like parallel_tool_calls OR extra params like reasoning
    disableReasoning?: boolean; // Specifically disables reasoning but keeps tools if possible
}

export function createChatModel(provider: ModelProvider, model: ModelConfig, options: ChatModelOptions | boolean = true) {
    // Backwards compatibility for the third argument being 'streaming' boolean
    const streaming = typeof options === 'boolean' ? options : options.streaming ?? true;
    const safeMode = typeof options === 'object' ? options.safeMode : (arguments.length > 3 ? arguments[3] : false);
    const disableReasoning = typeof options === 'object' ? options.disableReasoning : false;

    const baseUrl = provider.baseUrl?.trim() || undefined;

    const baseConfig = {
        modelName: model.id,
        temperature: 0.1, // Reduced from 0.7 for higher deterministic execution
        maxTokens: 4096,  // Ensure consistent multi-step thinking/tool generation
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

function convertMessages(messages: Message[], systemPrompt?: string, disableVision: boolean = false): BaseMessage[] {
    const langchainMessages: BaseMessage[] = [];

    if (systemPrompt) {
        langchainMessages.push(new SystemMessage(systemPrompt));
    }

    for (const msg of messages) {
        if (msg.role === 'user') {
            langchainMessages.push(new HumanMessage(msg.content));
        } else if (msg.role === 'assistant') {
            const toolCalls = (msg as any).tool_calls || (msg as any).toolCalls;
            const toolResults = (msg as any).tool_results || (msg as any).toolResults;

            // 1. Add the assistant message (content + tool calls)
            langchainMessages.push(new AIMessage({
                content: msg.content || "",
                tool_calls: toolCalls?.map((tc: any) => ({
                    id: tc.id,
                    name: tc.name,
                    args: tc.args || tc.arguments || {}
                })) || []
            }));

            // 2. Add the tool response messages immediately after if they exist in history
            if (toolResults && toolResults.length > 0) {
                for (const tr of toolResults) {
                    let content: any = typeof tr.result === 'string' ? tr.result : JSON.stringify(tr.result || tr.error || "No result");

                    // Multimodal Handling: Check for screen capture data and convert to image block
                    if (!disableVision) {
                        try {
                            const parsed = typeof tr.result === 'string' ? JSON.parse(tr.result) : tr.result;
                            if (parsed && parsed.image_data && typeof parsed.image_data === 'string' && parsed.image_data.startsWith('data:image')) {
                                console.log('[AI Service] Detected screenshot in tool output. converting to multimodal message.');
                                content = [
                                    {
                                        type: 'text',
                                        text: parsed.message || 'Screenshot captured successfully.'
                                    },
                                    {
                                        type: 'image_url',
                                        image_url: {
                                            url: parsed.image_data
                                        }
                                    }
                                ];
                            }
                        } catch (e) {
                            // Not JSON or not an image, keep as text
                        }
                    }

                    langchainMessages.push(new ToolMessage({
                        content: content,
                        tool_call_id: tr.toolCallId || tr.id,
                    }));
                }
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

const BROWSER_AGENT_PROMPT = `**STRICT EXECUTION RULES (HIGHEST PRIORITY)**
1. **ACTOR > CHATTER**: Your primary value is in executing tasks, not explaining them.
2. **PLAN & ACT**: If you describe a plan, you MUST call at least one tool to start acting on it in the SAME response.
3. **NEVER conclude a turn with a promise but no tool call.** (e.g., Don't say "I will navigate" and then stop. CALL \`browser_navigate\`.)
4. **NO CONFIRMATION TRAPS**: Do not stop to ask "Should I proceed?" or "Ready for next step?". Assume full autonomy unless a human decision is literally impossible.

**IDENTITY & ROLE**
You are a **Deterministic Execution Agent** and **Browser Automation Specialist**.
While you have "human-like" interaction capabilities, your primary directive is **STRICT ADHERENCE** to instructions and parameters.
If the user provides a keyword, that is the **ONLY** keyword you use. Generating "better" or "broader" keywords out of thin air is a CRITICAL FAILURE.

**ANTI-SPAM & HUMAN BEHAVIOR PROTOCOLS (CRITICAL)**
You must behave like a genuine human user to avoid getting flagged/blocked.
1.  **VARY YOUR TIMING**: Do not act instantly. The underlying tools have randomized delays, but you should also respect natural pauses in your logic.
2.  **UNIQUE CONTENT IS MANDATORY**:
    *   **NEVER** use templates for replies or DMs.
    *   **NEVER** post nearly identical messages to multiple users.
    *   Each reply must be customized (1-2 sentences) and reference specific details from the target's post.
3.  **THROTTLE ACTIONS**:
    *   Do not "rapid-fire" likes or follows.
    *   If you just engaged with 3 items, wait or scroll before the next batch.
4.  **AVOID ILLOGICAL NAVIGATION**: Humans don't jump 10 pages in 1 second. Scroll naturally.

**CORE OPERATING PROTOCOL (THE O.O.D.A. LOOP)**
You must apply this cycle to every step of your execution. **STRICT REQUIREMENT**: Every time you call a tool, you MUST first provide a brief (1-sentence) narration of your reasoning in your response content. **NEVER CALL TOOLS IN SILENCE.**
    *   **EYES OPEN RULE (CRITICAL)**: You are **BLIND** until you call \`browser_dom_snapshot\`. You MUST call it (snapshot) BEFORE every single interaction (\`browser_click\`, \`browser_write\`). Guessing selectors because you "know how Google works" is a CRITICAL FAILURE. Pages are dynamic; if you haven't seen a snapshot in the current turn/state, you have NO EYES.

1.  **OBSERVE (Current State)**
    *   Where am I? (URL, Page Title)
    *   What is visible? (You MUST use \`browser_dom_snapshot\` to see. If you don't have a fresh snapshot, TAKE ONE.)
    *   Did my last action succeed? (Check tool output)

2.  **ORIENT (Analysis)**
    *   Does this page match my goal?
    *   If "Yes": What interactive elements (buttons, inputs) are relevant? (Extract them from the Snapshot's numeric IDs or aria labels).
    *   If "No": How do I get there? (Navigate, Search, Click Menu)
    *   *Crucial*: If a specific site tool (e.g., \`x_search\`) exists, prefer it. If NOT, use **Universal Browser Tools** immediately.

3.  **DECIDE (Strategy Selection)**
    *   **Happy Path**: Element found -> Call Tool.
    *   **Ambiguity**: Multiple similar elements -> Try different selectors or use more specific attributes.
    *   **Failure**: Element missing -> Scroll down? Search text? Try different selector?

4.  **ACT (Tool Execution)**
    *   Execute the chosen tool.

**UNIVERSAL NAVIGATION STRATEGY (HOW TO BROWSE ANYTHING)**
You can navigate **ANY** website, even those you've never seen.
1.  **Look Before You Leap (MANDATORY)**: You MUST call \`browser_dom_snapshot\` (snapshot) BEFORE every single interaction (\`browser_click\`, \`browser_write\`). Do NOT assume selectors from previous turns or snapshots are still valid if the page has changed or reloaded.
2.  **Initial Landing**: When arriving at a new generic site, ALWAYS call \`browser_dom_snapshot\`.
3.  **Semantic Search**: To find a link/button, do not guess selectors. Look at the snapshot text and use the **aria label** or **text content** for precision.
4.  **Dynamic Content**: If you expect an element but it's not in the snapshot, use \`browser_wait_for_selector\` or \`browser_scroll\` before snapshotting again.
5.  **Precision Interaction**:
    *   If standard \`browser_click\` is risky, try focusing on unique text or attributes.
    *   **ROBUST SELECTOR STRATEGY (STRICT)**:
        1. **PRIORITY 1**: Use the \`suggestedSelector\` field provided for each element in the \`browser_dom_snapshot\` output.
        2. **PRIORITY 2**: Manual Semantic Prefixes. Use \`text/Click Me\` or \`aria/Login\`.
        3. **PRIORITY 3**: Stable Attributes. Use \`data-testid="submit"\` or \`name="email"\`.
        *   **PROHIBITED**: NEVER use raw numerical IDs (e.g. "35" or the \`_ref\` field) as selectors in tool calls. They are volatile and will cause failures.
        *If an interaction fails, you MUST re-snapshot (\`browser_dom_snapshot\`) to find a new stable selector.*

**TOOL HIERARCHY & SELECTION**
1.  **PLATFORM-SPECIFIC TOOLS (TOP PRIORITY)**
    *   If you are on **X.com**, you MUST use tools starting with \`x_\` (e.g., \`x_scan_posts\`, \`x_advanced_search\`).

2.  **UNIVERSAL BROWSER TOOLS (FALLBACK)**
    *   Use these ONLY if a specialized tool for the current site does not exist or has failed.
    *   \`browser_navigate\`: Go to URL.
    *   \`browser_dom_snapshot\`: **YOUR EYES**. Use \`only_visible: true\` by default. This tool returns high-fidelity metadata for interactive elements, including \`ariaLabel\`, \`placeholder\`, \`testId\`, \`nodeId\`, and \`nameAttr\`. Use these for precise targeting in other tools.
    *   \`browser_wait_for_selector\`: Use to handle dynamic loading before snapshotting.
    *   \`browser_write\`: Write (insert) text into a field or contenteditable element. Uses native insertion for maximum reliability. You can use CSS selectors, ARIA labels, or the numeric \`id\` from the snapshot.
        *   **POST-INPUT PROTOCOL (MANDATORY)**: After typing in a search box or form field, you MUST ensure it is submitted. 
            1. Preferred: Set \`enter: true\` in \`browser_write\` to automatically press Enter.
            2. Alternative: Call \`browser_click\` on the associated "Search" or "Submit" button immediately after.
            *Typing text and stopping without submitting is a CRITICAL FAILURE.*
    *   \`browser_move\`: Move the mouse pointer to an element. Useful for triggering hover effects.

**PLATFORMS & SPECIALIZED STRATEGY**: 
*   **X (Twitter)**: Use \`x_advanced_search\` followed by \`x_scan_posts\`. **STRICT RULE**: Use the user's keywords EXACTLY. If the user provides operators like \`min_likes:50\`, map them to the correct tool parameters. Only refer to your "Advanced X Search" knowledge base for strategic patterns (like excluding replies) when the user's intent matches those strategies or to recover from zero results. NEVER add filters the user did not request. **CONTINUITY**: On timelines or search results, always use \`x_scan_posts(scroll_bottom: true)\` to discover new content until your objective is met. If you have finished all current tasks, output [COMPLETE] to stop.
*   **X Navigation & Tabs**: 
    - **Home**: Switch between "For you" and "Following" using \`x_switch_tab\`.
    - **Search Results**: After searching, you can refine results by switching tabs (e.g., "Latest" for real-time, "People" for accounts, "Media", "Lists") using \`x_switch_tab(tab_name: "Latest")\`. 
    - **Note**: Prefer using the \`filter\` parameter in \`x_search\` or \`x_advanced_search\` if you know the target tab beforehand, but use \`x_switch_tab\` if you are already on the page and need to change focus.
*   **Google Search**: This is your default research engine. You MUST automatically "upgrade" simple user requests into advanced **Google Dorking** queries to ensure high-fidelity results.
    - **AUTONOMY**: Never ask "Should I use dorking?". If the task involves finding people, companies, or lists, Dorking is the standard operating procedure.
    - **PLATFORM MATCHING (STRICT)**: If the user specifies a site (e.g., "x.com", "LinkedIn", "GitHub"), you MUST use that site in your \`site:\` operator. DO NOT substitute platforms.

**GOOGLE DORKING – AUTOMATIC RESEARCH PROTOCOL (CRITICAL)**
You must transform plain-text user requests into precise queries using these strategies:
1. **Core Operators**:
   - \`"phrase"\` (Exact), \`OR\` (Either), \`-term\` (Exclude), \`*\` (Wildcard), \`site:domain.com\` (Limit to site).
   - \`filetype:pdf|xls|csv\` (Files), \`intitle:"term"\` (In title), \`inurl:substr\` (In URL).
2. **QUERY UPGRADING (MANDATORY)**:
   - User: "Find SaaS founders on X" -> Dork: \`site:x.com -inurl:status "SaaS" "Founder"\`.
   - User: "List of AI startups" -> Dork: \`"AI startup" ("we are building" OR "launched") site:linkedin.com/in/\`.
   - **Pattern Matching**: Use \`"we are building"\`, \`"now in beta"\`, or \`"launched our startup"\` for discovery.
3. **Execution**: construction of a Dorking query is the INITIAL step for any lead generation task. Use \`browser_navigate\` to \`https://www.google.com/search?q=[UPGRADED_QUERY]\` followed by \`browser_dom_snapshot\` or \`browser_extract\`.


**ERROR RECOVERY & RESILIENCE**
*   **THOROUGHNESS (CRITICAL)**: If the user asks for "all" results, a summary of a list, or to "Engage/Scrape" a feed:
1.  Call \`browser_extract\` or \`x_scan_posts\` to get a structured overview.
    2.  **INFINITE FEED PROTOCOL**: If the results are on an infinite-scroll page (like X.com timeline or search), you MUST scroll down to load more content BEFORE concluding. 
    3.  **SCROLL & SNAPSHOT**: If you have processed visible items, call \`browser_scroll\` or \`x_scan_posts(scroll_bottom: true)\` and continue.
    4.  **NEVER** say "Done" or "I have finished" if you are in a feed and could find more by scrolling, unless you have reached a user-specified limit (e.g. "Find 10").
    *   Stopping after seeing only 4-5 results in an infinite feed is a FAILURE.
*   **NEVER** loop the same failed action.
*   **ERROR**: "Element not found" -> **FIX**:
    1.  Is it just off-screen? -> \`browser_scroll\`.
    2.  Is the selector wrong? -> Use more specific attributes or text matching.
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
4.  **CONTROL NODES & LOOPS**:
    *   **Loop Node**: This controls iteration.
        *   **Infinite Loop**: If configured with \`infinite: true\`, you MUST continue the loop indefinitely (start body -> finish body -> restart body) until a critical failure occurs (e.g. "Next Page" button not found) or the user stops it.
        *   **Count Loop**: If \`count: N\`, execute the body exactly N times.
        *   **List Loop**: If iterating over a list, run once for each item.
    *   **Condition Node**: Evaluate logic. True -> Output 1. False -> Output 2.

5.  **Visualization (MANDATORY)**: The user's ONLY way to see progress is through your reports.
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
8. **Universal Node Mapping**:
    *   **navigate** -> Call \`browser_navigate\`.
    *   **click** -> Call \`browser_click\`.
    *   **type** -> Call \`browser_type\`.
    *   **scroll** -> Call \`browser_scroll\`.
    *   **wait** -> Call \`wait\` (ensure duration matches).
    *   **extract** -> Call \`browser_get_page_content\` or \`browser_dom_snapshot\`.
    *   **analyze** -> Perform a step-by-step analysis of the current page state.

**KNOWLEDGE & SELF-LEARNING (MEMORY)**
You have a "Long-Term Memory" stored in the Supabase database. You MUST use the \`supabase\` MCP server (\`execute_sql\`) to manage this.
1. **DISCOVER YOUR IDENTITY**: At the start of any new session or when relevant, query the \`knowledge_bases\` and \`knowledge_content\` tables using the \`supabase\` MCP server to retrieve context about your **Persona**, **Ideal Customer Profile (ICP)**, **Tone**, **Business Rules**, **Advanced Search Strategies**, and **Google Dorking**. Look for bases with names like "Identity", "Context", "Agent Profile", "Advanced X Search", or "Google Dorking". Every message you write and every target you select MUST be filtered through this combined context. 
2. **PLATFORM EXPERTISE**: Before automating a new domain (e.g., linkedin.com), query \`platform_knowledge\` where \`domain\` matches the hostname. 
    *   **Instruction Overrides**: If the database contains an \`instruction\` for an element or URL, follow it strictly. It represents "Ground Truth" for that specific page.
    *   **Selector Overrides**: If a saved \`selector\` exists for a specific element (check \`notes\` or \`element_details\`), prefer it over your default guesses.
3. **EXPLORE CUSTOM BASES**: You have access to user-curated knowledge in \`knowledge_bases\` and \`knowledge_content\`. If you are unsure about a specific business rule, product detail, or strategy, query these tables to find relevant context.
4. **ACTIVE CONTRIBUTION**: If you discover a robust, stable selector (Priority 1 or 2) for an element that previously caused errors, or if you find a successful way to interact with a complex UI-component (like a specific modal), you SHOULD "learn" it by inserting/updating a record in \`platform_knowledge\`.

**DATA COLLECTION & LEAD GENERATION RULES**
*   **Goal**: "Find leads", "Scrape people", "Create list", "Capture targets".
*   **Universal Strategy**:
    1. Use the platform-specific search tool (e.g., \`x_search\`) to find targets.
    2. Use the platform-specific extraction tool (e.g., \`x_extract_profiles\`) to scan the results page.
    3. Use \`capture_leads_bulk\` to save ALL results to a target list in a single turn. **NEVER use \`db_create_target\` for search results; always batch them.**
*   **Strategic Detail**: When capturing leads, ensure the \`name\`, \`url\`, and headline/location/bio are preserved in the metadata for later personalization.
*   **Constraint**: Do NOT engage (like/reply) during data collection unless explicitly told. Do NOT save leads one-by-one.

**ENGAGEMENT RULES**
*   **Tone**: Matches the platform (X = Casual/Professional, Web = Informative).
*   **Authenticity**: Never sound like a bot. No "Great post!". Be specific to the content.
*   **X.com Efficiency**: 
    1. Check button \`state\` in \`browser_dom_snapshot\` first. 
    2. Skip humanization/engagement if an item is already "engaged" or "liked".
    
    **SMART GENERATION (CRITICAL)**:
    *   When the user setup provides a 'prompt' or 'instruction' for \`x_engage\` (via \`replyText\` or \`humanize_instruction\`), you MUST **GENERATE** the final content.
    *   **Rule**: If \`replyText\` is an instruction OR if \`humanize_instruction\` is provided (and \`enable_humanize\` is true):
        1.  READ the target post/tweet content.
        2.  GENERATE a relevant, high-quality reply.
            *   Base the content on \`replyText\` (e.g. "Ask about pricing").
            *   Apply the style/tone from \`humanize_instruction\` (e.g. "Make it witty").
        3.  Call \`x_engage\` with the **GENERATED TEXT** as the \`replyText\` argument.
    *   **NEVER** paste the raw instruction prompts directly into the reply field. That is a failure.

**NARRATION & TRANSPARENCY**
*   **Announce your steps (STRICT)**: You MUST explain what you are doing. Example: "Searching for SaaS founders on X to identify potential targets."
*   **NO RAW TOOL TAGS**: Never output literal XML-style tags (like 'tool_call', 'function', or 'parameter') in your narration. The system handles tool execution via the structured API. If you use thinking/reasoning blocks, KEEP them as plain text or clean markdown.
*   **No placeholders**: Never pass literal {{agent.decide}}. Resolve it to creative content.

**EXECUTION VS CONVERSATION**
- **ACTOR > CHATTER**: Your value is in finishing the task, not explaining it repeatedly.
- **NO CONFIRMATION TRAPS**: NEVER ask "Should I click?" or "Do you want me to proceed?". If you plan an action, **DO IT** in the same turn.
- **MAXIMUM MOMENTUM**: Execute as many steps as possible (Search -> Click -> Extract -> Repeat) in a single sequence before yielding.
- **RESILIENT PROGRESS**: If one approach fails, try another approach IMMEDIATELY without asking.

**THE CLOSING PROTOCOL (MANDATORY)**
Every time you finish a turn (whether you are done with the task or just yielding), you MUST provide a "Status Summary":
1. **ACTIONS TAKEN**: A concrete list of tools called.
2. **RESULTS FOUND**: Key data or insights extracted (e.g., "Found 5 posts", "Extracted bio").
3. **PLAN**: Exactly what you plan to do next.
4. **STATUS**: State clearly if the task is **[COMPLETE]**, **[IN PROGRESS]**, or **[BLOCKED]**.

**FINAL INSTRUCTION**
You are autonomous. You do not need to ask for permission to scroll, click, or explore.
If you are stuck, stop and THINK. Then try a *different* approach. 
**NEVER conclude a turn with a promise but no tool call.**
**Go.**
`;

export async function resolveAIConfig(
    supabaseClient: any,
    provider: ModelProvider,
    model: ModelConfig,
    accessToken?: string,
    localDefaultModelId?: string // New parameter for local settings fallback
): Promise<{ effectiveProvider: ModelProvider, effectiveModel: ModelConfig }> {
    let effectiveProvider = { ...provider };
    let effectiveModel = { ...model };

    try {
        // 1. Fetch System Settings
        const { data: systemData, error: systemError } = await supabaseClient
            .from('system_settings')
            .select('key, value');

        if (systemError) {
            console.error('[AI Service] Supabase system_settings fetch failed:', systemError);
            if (systemError.message?.includes('401')) {
                console.warn('[AI Service] Auth error detected. Proceeding with local configuration only.');
            }
        }

        const sysSettings = (systemData || []).reduce((acc: any, curr: any) => {
            acc[curr.key] = curr.value;
            return acc;
        }, {});

        // 2. Fetch User Settings (if authenticated)
        let userSettings: any = null;
        if (accessToken) {
            const { data: userData } = await supabaseClient
                .from('user_settings')
                .select('*')
                .maybeSingle();
            userSettings = userData;
        }

        // 3. Determine Effective Config
        // 3. Determine Effective Config
        // Priority: 
        // 1. Cloud User Override (e.g. forced by admin/plan)
        // 2. Local User Selection ('defaultModelId' from input settings)
        // 3. System Default (if nothing else selected)

        const cloudProviderType = userSettings?.ai_provider;
        const cloudModelId = userSettings?.ai_model;
        const cloudApiKey = userSettings?.ai_api_key;

        const sysProviderType = sysSettings['default_ai_provider'];
        const sysModelId = sysSettings['default_ai_model'];

        // If localDefaultModelId is provided, we need to find what provider it belongs to.
        // We assume valid model IDs formats or that we can resolve provider later.
        let localProviderType = null;
        if (localDefaultModelId) {
            // Heuristic: If we have store access (we are in main process), we could look it up.
            // But simpler: If the ID matches a known pattern or check all provider models.
            // Since we can't easily access the full provider list here without passing it, 
            // we rely on the caller to have handled some of this or we do basic checks.
            // OR: We check if the 'localDefaultModelId' matches the requested provider's models first.
        }

        const targetProviderType = cloudProviderType || (localDefaultModelId ? undefined : sysProviderType);
        const targetModelId = cloudModelId || localDefaultModelId || sysModelId;
        const targetApiKey = cloudApiKey || sysSettings['system_ai_api_key'];

        // If we have a local model ID but no provider override from cloud, 
        // we need to set the provider type correctly for that model.
        // If the 'localDefaultModelId' is set, we trust the caller (createChatModel) 
        // or we need to find the provider for this model ID.
        // However, resolveAIConfig is usually called with prompt-specific provider/model.
        // If ModelProvidersSettings set a default, it's globally stored.

        // Revised Logic:
        // If User Cloud Settings exist -> USE THEM (They are overrides)
        // Else If Local Default exists -> USE IT
        // Else If System Default exists -> USE IT

        let finalModelId = targetModelId;
        let finalProviderType = targetProviderType;

        // If we are using local default, we need to infer provider if not set
        if (!cloudProviderType && localDefaultModelId && !finalProviderType) {
            // We don't have the provider mapping here easily unless we pass all providers.
            // BUT, usually the 'provider' arg passed to this function is the 'start' point.
            // If the localDefaultModelId is inside the passed 'provider', we are good.
            // If it's a cross-provider switch (e.g. OpenAI -> Anthropic), we have a problem 
            // unless we fetch the full list.

            // To fix properly: We need to search all providers for this model ID.
            const { data: dbProviders } = await supabaseClient.from('model_providers').select('*');
            const providers: ModelProvider[] = (dbProviders || []).map((p: any) => ({
                id: p.id,
                name: p.name,
                type: p.type,
                apiKey: p.api_key,
                baseUrl: p.base_url,
                models: p.models || [],
                enabled: p.enabled
            }));

            const managedSystemProvider: ModelProvider[] = sysProviderType && sysModelId ? [{
                id: 'system-default',
                name: 'Reavion',
                type: sysProviderType as any,
                apiKey: 'managed-by-system',
                models: [{ id: sysModelId, name: 'Reavion Flash', providerId: 'system-default', contextWindow: 4096, enabled: true }],
                enabled: true
            }] : [];

            const allProviders = [...providers, ...managedSystemProvider];
            const foundProvider = allProviders.find((p: any) =>
                p.models?.some((m: any) => m.id === localDefaultModelId)
            );

            if (foundProvider) {
                finalProviderType = foundProvider.type;
                effectiveProvider = { ...foundProvider, apiKey: foundProvider.apiKey || effectiveProvider.apiKey };
            }
        } else if (!finalProviderType && sysProviderType) {
            finalProviderType = sysProviderType;
        }

        if (finalProviderType) {
            effectiveProvider.type = finalProviderType as any;
            effectiveProvider.id = finalProviderType;
            if (finalProviderType === 'openrouter' && !effectiveProvider.baseUrl) {
                effectiveProvider.baseUrl = 'https://openrouter.ai/api/v1';
            }
        }

        if (finalModelId) {
            effectiveModel.id = finalModelId;
            effectiveModel.providerId = effectiveProvider.id;
            effectiveModel.name = finalModelId;
        }

        if (targetApiKey && targetApiKey.trim() !== '') {
            effectiveProvider.apiKey = targetApiKey;
        } else if (accessToken && (!effectiveProvider.apiKey || effectiveProvider.apiKey === 'managed-by-system')) {
            // Fallback: Use user's access token if no specific API key is found (common for system proxies)
            console.log('[AI Service] Using User Access Token as Model API Key');
            effectiveProvider.apiKey = accessToken;
        } else if (effectiveProvider.type !== provider.type && (!effectiveProvider.apiKey || effectiveProvider.apiKey.trim() === '')) {
            console.warn(`[AI Service] Provider switched to ${effectiveProvider.type} but no API Key found in settings!`);
        }

    } catch (e) {
        console.error('[AI Service] Error resolving AI config:', e);
    }

    return { effectiveProvider, effectiveModel };
}

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
    const activeSupabaseClients = new Map<number, any>(); // Store active Supabase clients by window ID
    const activeTokens = new Map<number, { accessToken: string; refreshToken: string }>();

    ipcMain.handle('ai:stop', async (event) => {
        const window = BrowserWindow.fromWebContents(event.sender);
        if (window) {
            stopSignals.set(window.id, true);
        }

        // Also signal the renderer execution to stop immediately
        const contents = await getWebviewContents('main-tab');
        if (contents && (typeof contents.isDestroyed !== 'function' || !contents.isDestroyed())) {
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

        if (window && activeSupabaseClients.has(window.id)) {
            activeSupabaseClients.delete(window.id);
        }

        return { success: true };
    });

    ipcMain.handle('ai:update-session', async (event, { accessToken, refreshToken }: { accessToken: string; refreshToken: string }) => {
        const window = BrowserWindow.fromWebContents(event.sender);
        if (window) {
            // ALWAYS update the active tokens store first
            // This ensures that even if we don't have an active Supabase client instance (e.g., between chats),
            // the next chat or the currently running loop will pick up the fresh token via getAccessToken()
            console.log(`[AI Service] Updating session tokens for window ${window.id}`);
            activeTokens.set(window.id, { accessToken, refreshToken });

            const client = activeSupabaseClients.get(window.id);
            if (client) {
                console.log(`[AI Service] Updating active Supabase client session...`);
                // Debug log (redacted)
                console.log(`[AI Service] New Access Token: ${accessToken.substring(0, 10)}...`);

                try {
                    const { data, error } = await client.auth.setSession({
                        access_token: accessToken,
                        refresh_token: refreshToken
                    });

                    if (error) {
                        console.error('[AI Service] Failed to update Supabase client session:', error);
                        // We do NOT return error here, because we successfully updated activeTokens
                        // which is the primary source of truth for new operations.
                        // return { success: false, error: error.message }; 
                    }

                    if (data?.session) {
                        console.log('[AI Service] Supabase client session successfully refreshed');
                    }

                    return { success: true };
                } catch (e: any) {
                    console.error('[AI Service] Exception updating Supabase client session:', e);
                    // Ditto, proceed as success since tokens are updated
                    return { success: true, warning: e.message };
                }
            } else {
                console.log(`[AI Service] No active Supabase client to update (idle?), but tokens refreshed for future requests.`);
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
                initialUserPrompt,
                accessToken
            } = request;

            const scopedSupabase = await getScopedSupabase(accessToken, request.refreshToken);
            // Retrieve local default model ID from store
            const localDefaultModelId = store.get('defaultModelId');

            // Resolve Config
            const { effectiveProvider, effectiveModel } = await resolveAIConfig(scopedSupabase, provider, model, accessToken, localDefaultModelId);

            const isDiscovery = !initialUserPrompt || initialUserPrompt.trim().length < 2;
            // Using Safe Mode (no reasoning/tools-prep) for suggestions to ensure maximum compatibility
            const chatModel = createChatModel(effectiveProvider, effectiveModel, { streaming: false, safeMode: true });

            // Extract context for better suggestions
            const playbookContext = request.playbooks?.map(p => `- ${p.name}: ${p.description}`).join('\n') || 'No active playbooks.';
            const listContext = request.targetLists?.map(l => `- ${l.name} (${l.target_count} targets)`).join('\n') || 'No target lists yet.';

            const systemPrompt = `You are a high-performance growth strategist and AI orchestrator for Reavion, an autonomous agent that dominates social media and lead generation.
Your goal is to generate 3 BRILLIANT, high-impact suggestions that will WOW the user by showing what Reavion can truly do.

COMMANDS & CAPABILITIES:
- X.com (Twitter): Search, advanced search, scanning posts, multi-step engagement, liking, replying, following.
- Browser: Navigating, clicking, typing, scrolling, extracting data, taking snapshots.
- Database: Saving leads to Target Lists, running Playbooks.

AVAILABLE ASSETS:
Playbooks:
${playbookContext}

Target Lists:
${listContext}

INSTRUCTIONS:
${isDiscovery
                    ? "The user is at the start. Suggest 3 'Power Moves'. One for aggressive social growth on X, one for precise lead generation from any website, and one for competitive analysis or multi-platform research."
                    : `The user is interested in: "${initialUserPrompt}". Create 3 context-aware suggestions. One should be a direct continuation of their thought, one should be a more advanced version of it, and one should be a related 'cross-platform' synergy (e.g., if they mention X, suggest saving leads from X to a database).`}

Return ONLY a raw JSON array of objects: { "label": string (max 18 chars), "prompt": string (one clear sentence) }.

Example:
[
  { "label": "X Growth Hack", "prompt": "Find top SaaS influencers on X, scan their recent posts, and engage with high-value replies using my 'Growth' playbook." },
  { "label": "Social Intel", "prompt": "Search X for tech founders in New York, scan their profiles, and save them to my 'Early Adopters' list." }
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

    ipcMain.handle('ai:reset-context', async (event, workspaceId?: string) => {
        try {
            console.log(`[AI Service] Resetting context for workspace: ${workspaceId || 'current'}`);
            await resetBrowser();
            // Optional: clear any other state if needed (e.g. mcp cache)
            return { success: true };
        } catch (error) {
            console.error('Reset Context Error:', error);
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
                isPlaybookRun = false,
                workspaceSettings
            } = request;
            const window = BrowserWindow.fromWebContents(event.sender);
            if (window) {
                stopSignals.set(window.id, false);
            }

            // Create a scoped Supabase client for this request using the tokens
            const scopedSupabase = await getScopedSupabase(accessToken, refreshToken);
            if (accessToken) {
                console.log('[AI Service] Created scoped Supabase client with authenticated session');
            } else {
                console.warn('[AI Service] No access token provided, using anonymous client');
            }

            if (window) {
                activeSupabaseClients.set(window.id, scopedSupabase);
                if (accessToken && refreshToken) {
                    activeTokens.set(window.id, { accessToken, refreshToken });
                }
            }

            // Retrieve local default model ID from store
            const localDefaultModelId = store.get('defaultModelId');

            // Resolve AI Configuration
            const { effectiveProvider, effectiveModel } = await resolveAIConfig(scopedSupabase, provider, model, accessToken, localDefaultModelId);

            if (effectiveProvider.id !== provider.id || effectiveModel.id !== model.id) {
                console.log(`[AI Service] Using Resolved Config: ${effectiveProvider.type}/${effectiveModel.id}`);
            }

            // Track AI Action Start
            analytics.track('AI Action Started', {
                modelId: effectiveModel.id,
                providerId: effectiveProvider.type,
                isPlaybookRun: isPlaybookRun,
                infiniteMode: infiniteMode,
            });

            /* 
            // --- Resolve AI Configuration (System Defaults & User Overrides) ---
            let effectiveProvider = { ...provider };
            let effectiveModel = { ...model };

            try {
                // 1. Fetch System Settings
                const { data: systemData } = await scopedSupabase
                    .from('system_settings')
                    .select('key, value');

                const sysSettings = (systemData || []).reduce((acc: any, curr: any) => {
                    acc[curr.key] = curr.value;
                    return acc;
                }, {});

                // 2. Fetch User Settings (if authenticated)
                let userSettings: any = null;
                if (accessToken) {
                    const { data: userData } = await scopedSupabase
                        .from('user_settings')
                        .select('*')
                        .maybeSingle();
                    userSettings = userData;
                }

                // 3. Determine Effective Config
                // Priority: User Override > System Default > Request Original

                const targetProviderType = userSettings?.ai_provider || sysSettings['default_ai_provider'];
                const targetModelId = userSettings?.ai_model || sysSettings['default_ai_model'];
                const targetApiKey = userSettings?.ai_api_key || sysSettings['system_ai_api_key'];

                if (targetProviderType) {
                    console.log(`[AI Service] Applying Provider Override: ${targetProviderType}`);
                    effectiveProvider.type = targetProviderType as any;
                    effectiveProvider.id = targetProviderType; // Ensure ID matches type for consistency

                    // Specific fix for OpenRouter base URL if not present
                    if (targetProviderType === 'openrouter' && !effectiveProvider.baseUrl) {
                        effectiveProvider.baseUrl = 'https://openrouter.ai/api/v1';
                    }
                }

                if (targetModelId) {
                    console.log(`[AI Service] Applying Model Override: ${targetModelId}`);
                    effectiveModel.id = targetModelId;
                    effectiveModel.providerId = effectiveProvider.id;
                    effectiveModel.name = targetModelId; // Fallback name
                }

                if (targetApiKey && targetApiKey.trim() !== '') {
                    console.log('[AI Service] Applying API Key Override (Hidden)');
                    effectiveProvider.apiKey = targetApiKey;
                } else if (effectiveProvider.type !== provider.type && (!effectiveProvider.apiKey || effectiveProvider.apiKey.trim() === '')) {
                    // If we switched provider type via override, but didn't have a key override, 
                    // and the original request key is likely for the WRONG provider, we warn.
                    console.warn(`[AI Service] Provider switched to ${effectiveProvider.type} but no API Key found in settings! Using request key as fallback (may fail).`);
                }

            } catch (configError) {
                console.error('[AI Service] Error resolving AI configuration:', configError);
                // Fallback to original request on error
            } */


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
            const getAccessToken = () => {
                if (!window) return accessToken;
                return activeTokens.get(window.id)?.accessToken || accessToken;
            };

            const requestBrowserTools = createBrowserTools({ getSpeed, workspaceId: request.workspaceId, getAccessToken });
            const requestTargetTools = createTargetTools({ targetLists, supabaseClient: scopedSupabase, workspaceId: request.workspaceId });
            let requestPlaybookTools = createPlaybookTools({
                playbooks,
                supabaseClient: scopedSupabase,
                workspaceId: request.workspaceId,
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


            const requestIntegrationTools = createIntegrationTools(workspaceSettings, request.workspaceId);
            const requestUtilityTools = createUtilityTools({ provider: effectiveProvider, model: effectiveModel, workspaceId: request.workspaceId });

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
            const contents = await getWebviewContents('main-tab');
            if (contents && (typeof contents.isDestroyed !== 'function' || !contents.isDestroyed())) {
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
                    ? `\nThe user enabled **Infinite Loop Mode**. This means you must execute the task continuously without stopping:
- **IF DATA COLLECTION** (Leads/Scraping): 
    1. **CAPTURE IN BULK**: Use \`capture_leads_bulk\` to save ALL visible results on the current page at once.
    2. **DO NOT VISIT**: Never click into individual results unless you specifically need data that is missing from the snippet.
    3. **PAGINATE IMMEDIATELY**: After one \`capture_leads_bulk\`, immediately find and click the "Next" button. Use \`browser_extract\` to find pagination hints.
    4. **ROTATE SEARCHES**: If you hit the end of the pages or no results are found, change your search query keywords to find fresh data.
    5. **MOMENTUM**: Your goal is volume. Keep moving.
- **IF ENGAGEMENT**:
    1. Scan items.
    2. **IMMEDIATELY ENGAGE**: If scan results contain items you haven't engaged with, engage with them in the same turn or next turn. **DO NOT** just scroll/scan over and over without acting.
    3. **ROTATE**: If the current page/tab/search has no more new content, switch to a DIFFERENT search or TAB (e.g., move from "For You" to "Following", or try a new niche keyword).
- **Summaries**: Keep them extremely brief (1 line) and do not stop.`
                    : '';

            // --- CONTEXT INJECTION START ---
            // Fetch available resources to help the agent understand {{service.id}} tags
            let contextInjection = "\n\n**AVAILABLE RESOURCES (CONTEXT):**\nWhen the user or tool output refers to IDs (e.g. {{service.id}}), they map to the following:\n";

            // 1. Playbooks
            try {
                let query = scopedSupabase
                    .from('playbooks')
                    .select('id, name, description, graph')
                    .limit(20);

                if (request.workspaceId) {
                    query = query.eq('workspace_id', request.workspaceId);
                }

                const { data: playbooksData } = await query;
                if (playbooksData && playbooksData.length > 0) {
                    contextInjection += "\n**Playbooks ({{playbooks.ID}}):**\n";
                    playbooksData.forEach((p: any) => {
                        // Extract Node IDs for context context suggestion
                        const nodeIds = (p.graph as any)?.nodes?.map((n: any) => `"${n.label || n.id}" (${n.id})`).join(', ') || 'No nodes';
                        contextInjection += `- ${p.name}: {{playbooks.${p.id}}}\n  Description: ${p.description || 'None'}\n  Nodes: ${nodeIds}\n`;
                    });
                }
            } catch (e) { console.error('Error fetching playbooks context:', e); }

            // 2. Target Lists
            try {
                let query = scopedSupabase
                    .from('target_lists')
                    .select('id, name')
                    .limit(20);

                if (request.workspaceId) {
                    query = query.eq('workspace_id', request.workspaceId);
                }

                const { data: lists } = await query;
                if (lists && lists.length > 0) {
                    contextInjection += "\n**Target Lists ({{lists.ID}}):**\n";
                    lists.forEach((l: any) => contextInjection += `- ${l.name}: {{lists.${l.id}}}\n`);
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

            // 4. Platform-Specific Knowledge Base
            try {
                const { data: knowledge } = await (scopedSupabase as any)
                    .from('platform_knowledge')
                    .select('domain, url, action, selector, instruction, notes')
                    .eq('is_active', true);

                if (knowledge && knowledge.length > 0) {
                    contextInjection += "\n**PLATFORM KNOWLEDGE BASE (Use these overrides!):**\n";
                    knowledge.forEach((k: any) => {
                        const pathText = k.url ? ` (Path: ${k.url})` : '';
                        const instructionText = k.instruction ? ` | INSTRUCTION: "${k.instruction}"` : '';
                        contextInjection += `- [${k.domain}${pathText}] Action: ${k.action} -> Selector: \`${k.selector}\`${instructionText} (Notes: ${k.notes || 'N/A'})\n`;
                    });
                    contextInjection += "\n**NOTE**: When on these domains/paths, prioritize the recommended selectors and instructions above. They are verified by the system owner for maximum reliability.\n";
                }
            } catch (e) { console.error('Error fetching platform knowledge:', e); }

            // 5. User Knowledge Base
            try {
                const { data: userKBContent } = await scopedSupabase
                    .from('knowledge_content')
                    .select('id, title, content')
                    .limit(50);
                if (userKBContent && userKBContent.length > 0) {
                    contextInjection += "\n**User Knowledge Base ({{kb.ID}}):**\n";
                    userKBContent.forEach((c: any) => {
                        contextInjection += `- ${c.title || 'Untitled Knowledge'}: {{kb.${c.id}}}\n  Content: ${c.content}\n`;
                    });
                }
            } catch (e) { console.error('Error fetching user knowledge context:', e); }

            contextInjection += "\nUse these IDs when calling tools that require a list_id, playbook_id, etc. The user may write them as tags like 'Run {{playbooks.xyz}}', which translates to the ID 'xyz'.";

            // 4. Active Toolkit (Dynamic Capability Awareness)
            // This ensures the agent knows exactly which tools are instantiated for this session
            const activeToolNames = deduplicatedTools.map(t => t.name).join(', ');
            contextInjection += `\n\n**ACTIVE TOOLKIT (Reference):**\n${activeToolNames}\n`;
            // --- CONTEXT INJECTION END ---

            const now = new Date();
            const timeContext = `\n**TEMPORAL CONTEXT:**\n- Current Date: ${now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}\n- Current Time: ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}\n- ISO Timestamp: ${now.toISOString()}\n- Note: Use this "Current Date" as the anchor for all relative date calculations (e.g., "last week", "yesterday", "30 days ago").\n`;

            const nonVisionModels = ['glm-4.7', 'glm-4-9b', 'deepseek-chat', 'llama-3', 'mistral-large'];
            const modelLower = effectiveModel.id.toLowerCase();
            const isKnownNonVision = nonVisionModels.some(m => modelLower.includes(m)) ||
                (modelLower.startsWith('glm-') && !modelLower.includes('v'));

            const visionDirective = isKnownNonVision
                ? `\n\n**CRITICAL: NO VISION CAPABILITIES**\nYour current model (${effectiveModel.id}) CANNOT see images or screenshots. 
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

            const generalDirective = `
**CRITICAL: PROACTIVE EXECUTION**
- **FINISH WHAT YOU START**: Never end a turn with a "plan" or "promise" without executing at least one tool to advance that plan.
- **NO CHAT TRAPS**: Do not stop to summarize and wait for instructions unless you are [COMPLETE] or [BLOCKED].
- **MAXIMUM MOMENTUM**: Perform as many steps as possible in a single turn. 
- **ACT ON SIGHT**: If you scan a page and find actionable items (e.g., posts to reply to), proceed to act on them IMMEDIATELY. Do not stop to list them or ask for permission.
- **DETAILED REPORTING**: When you do stop, explain exactly what was achieved and what the remaining steps are.
`;

            const effectiveSystemPrompt = enableTools
                ? `${contextInjection}\n${timeContext}${visionDirective}${playbookDirective}${speedDirective}${generalDirective}\n${BROWSER_AGENT_PROMPT}${infiniteDirective}\n\n${systemPrompt || ''}`
                : systemPrompt;

            if (enableTools) {
                let chatModel = createChatModel(effectiveProvider, effectiveModel, false);
                console.log('Registering AI Tools:', deduplicatedTools.map(t => t.name).join(', '));
                // Bind tools without strict mode to avoid "all fields must be required" warning
                // The strict mode requires all schema fields to be required, which conflicts with optional tool parameters
                console.log(`[AI Service] Binding ${deduplicatedTools.length} tools to model`);
                let modelWithTools = chatModel.bindTools(deduplicatedTools, { strict: false } as any);

                let langchainMessages = convertMessages(messages, effectiveSystemPrompt);
                let fullResponse = '';
                let iteration = 0;
                let toolExecutionCount = 0;
                let consecutiveToolFailures = 0;
                let consecutiveEmptyOutputErrors = 0;
                const sentNarrations = new Set<string>(); // Track sent narrations to prevent duplicates
                // Tracking variable for vision capability fallback
                let disableVision = false;

                // --- USAGE TRACKING INITIALIZATION ---
                let isPro = false;
                let aiActionsLimit = 10;
                let currentUsage = 0;

                if (accessToken) {
                    try {
                        const currentToken = getAccessToken();
                        if (!currentToken) throw new Error('No access token available');
                        const userId = getUserIdFromToken(currentToken);
                        const [subRes, limits, usage] = await Promise.all([
                            scopedSupabase
                                .from('subscriptions')
                                .select('status')
                                .eq('user_id', userId)
                                .in('status', ['active', 'trialing'])
                                .limit(1)
                                .maybeSingle(),
                            systemSettingsService.getTierLimits(getAccessToken() || accessToken),
                            usageService.getUsage(getAccessToken() || accessToken, 'ai_actions')
                        ]);

                        isPro = !!subRes.data;
                        aiActionsLimit = limits.ai_actions_limit;
                        currentUsage = usage?.count || 0;

                        // FALLBACK TO STRIPE DIRECTLY IF SUPABASE RECORD MISSING
                        // This ensures Pro users are never blocked even if webhooks/DB sync is delayed
                        if (!isPro && userId) {
                            try {
                                const { data: profile } = await scopedSupabase
                                    .from('profiles')
                                    .select('stripe_customer_id, email')
                                    .eq('id', userId)
                                    .maybeSingle();

                                if (profile) {
                                    let cid = profile.stripe_customer_id;

                                    // If CID missing, try recovering by email
                                    if (!cid && profile.email) {
                                        const customer = await stripeService.createCustomer(profile.email);
                                        cid = customer.id;
                                        // Proactively update profile in background
                                        scopedSupabase.from('profiles').update({ stripe_customer_id: cid }).eq('id', userId).then();
                                    }

                                    if (cid) {
                                        const stripeSubs = await stripeService.getSubscriptions(cid);
                                        const activeSub = stripeSubs.find((s: any) => s.status === 'active' || s.status === 'trialing');
                                        if (activeSub) {
                                            isPro = true;
                                            console.log(`[AI Service] Pro status recovered via Stripe email lookup (${profile.email}) for user ${userId}`);
                                        }
                                    }
                                }
                            } catch (stripeErr) {
                                console.error('[AI Service] Stripe fallback verification failed:', stripeErr);
                            }
                        }

                        console.log(`[AI Service] Usage Init: ${currentUsage}/${aiActionsLimit} (Pro: ${isPro}, User: ${userId})`);
                        if (subRes.error) {
                            console.error('[AI Service] Subscription query error:', subRes.error);
                        }
                    } catch (e) {
                        console.error('[AI Service] Limit initialization error:', e);
                    }
                }

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
                    toolExecutionCount = 0; // Reset for this specific turn

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
                                if (e?.message?.includes("Cannot read properties of undefined (reading 'message')")) {
                                    console.debug('Raw Model Invoke Error (Handled):', e);
                                } else {
                                    console.error('Raw Model Invoke Error:', e);
                                }

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
                        // Extract error message safely
                        let errorMessage = 'Model call failed';
                        if (invokeError instanceof Error) {
                            errorMessage = invokeError.message;
                        } else if (invokeError && typeof invokeError === 'object') {
                            errorMessage = invokeError.message || invokeError.error || JSON.stringify(invokeError);
                        } else if (typeof invokeError === 'string') {
                            errorMessage = invokeError;
                        }

                        if (errorMessage.includes("Cannot read properties of undefined (reading 'message')")) {
                            console.debug('Model invoke error (Handled):', errorMessage);
                        } else {
                            console.error('Model invoke error:', invokeError);
                        }

                        // Check if it's a rate limit or API error - retry after delay

                        // Check if it's a rate limit or API error - retry after delay
                        if (errorMessage.includes('rate') || errorMessage.includes('limit') || errorMessage.includes('429')) {
                            console.log('Rate limited, waiting 5 seconds before retry...');
                            await new Promise(resolve => setTimeout(resolve, 5000));
                            continue; // Retry the iteration
                        }

                        // VISION FALLBACK: Handle models that don't support image input
                        if (errorMessage.toLowerCase().includes('image input') || errorMessage.includes('support image')) {
                            console.log('[Auto-Recovery] Model does not support vision. Retrying without images...');
                            disableVision = true;

                            // Sanitize existing history to remove any image blocks
                            langchainMessages = langchainMessages.map(msg => {
                                if (msg instanceof ToolMessage && Array.isArray(msg.content)) {
                                    // Find the text part and discard the image
                                    const textPart = (msg.content as any[]).find(c => c.type === 'text');
                                    if (textPart) {
                                        return new ToolMessage({
                                            content: textPart.text,
                                            tool_call_id: msg.tool_call_id,
                                            name: msg.name
                                        });
                                    }
                                    // Fallback if no text found (unlikely for our format)
                                    return new ToolMessage({
                                        content: "Image content removed (not supported by model)",
                                        tool_call_id: msg.tool_call_id,
                                        name: msg.name
                                    });
                                }
                                return msg;
                            });

                            continue; // Retry immediately with sanitized history
                        }

                        // Specific Auto-Recovery for internal LangChain/Model undefined errors
                        // This prevents the agent from stopping due to transient library errors
                        if (errorMessage.includes("Cannot read properties of undefined (reading 'message')")) {
                            console.debug('[AI Service] Suppressing internal LangChain undefined error. Retrying iteration...', errorMessage);
                            await new Promise(resolve => setTimeout(resolve, 2000));
                            continue;
                        }

                        // AUTO-RECOVERY LOGIC
                        // If model rejects tools or specific config (400 Bad Request / Schema validation), try a staged downgrade
                        const isToolIncompatible = errorMessage.toLowerCase().includes('not support') || errorMessage.toLowerCase().includes('tool use is not supported');
                        const isEmptyOutput = errorMessage.toLowerCase().includes('model output must contain either output text or tool calls') || errorMessage.toLowerCase().includes('cannot both be empty');

                        // Simple Retry for Empty Output (up to 2 times) before downgrading
                        if (isEmptyOutput && consecutiveEmptyOutputErrors < 2) {
                            console.log(`[Resilience] Model returned empty output (Attempt ${consecutiveEmptyOutputErrors + 1}/2). Retrying...`);
                            consecutiveEmptyOutputErrors++;
                            await new Promise(resolve => setTimeout(resolve, 1500));
                            continue;
                        }

                        if (errorMessage.includes('400') || errorMessage.includes('401') || errorMessage.includes('403') || isToolIncompatible || isEmptyOutput || errorMessage.toLowerCase().includes('schema') || errorMessage.toLowerCase().includes('validation')) {
                            console.log(`[Auto-Recovery] Model invocation failed (${errorMessage}). Attempting downgrade...`);

                            let success = false;

                            // Stage 1: Attempt without Reasoning BUT WITH tools
                            // Skip Stage 1 if tools are explicitly not supported
                            if (!isToolIncompatible) {
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
                                    console.error('[Auto-Recovery] Stage 1 Failed:', stage1Error?.message || stage1Error);
                                }
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
                                    const stage2ErrorMsg = stage2Error?.message || String(stage2Error);
                                    console.error('[Auto-Recovery] Stage 2 Failed:', stage2ErrorMsg);
                                    errorMessage = `Recovery failed: ${stage2ErrorMsg}`;
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

                    // Reset error counters on successful response
                    consecutiveEmptyOutputErrors = 0;

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

                        // AUTO-KICK: If the agent is talking but not acting, nudge it.
                        const isBrowserTask = requestToolsByName.has('browser_navigate');
                        const responseLower = responseContent.toLowerCase();
                        const isPromissory = responseLower.includes("i'll") || responseLower.includes("i will") ||
                            responseLower.includes("let me") || responseLower.includes("i'm going to") ||
                            responseLower.includes("first, i'll") || responseLower.includes("i will navigate");

                        if (isBrowserTask && isPromissory && iteration < 3 && !isPlaybookRun) {
                            console.log(`[AI Service] Stalling detected (Turn ${iteration}). Nudging...`);
                            langchainMessages.push(new HumanMessage("(System: Proceed with your plan. Execute the next action tool immediately. Do not stop to chat.)"));
                            continue;
                        }

                        // Only reset iteration for infinite mode if we DID NOT signal completion.
                        const hasFinishedSignal = responseLower.includes("[complete]") || responseLower.includes("i have finished") || responseLower.includes("mission accomplished");

                        if (infiniteMode && baseUserGoal && iteration < hardStopIterations && !hasFinishedSignal) {
                            console.log(`[AI Service] Infinite Mode: Autonomous loop continuing.`);
                            langchainMessages.push(
                                new HumanMessage(
                                    `Remain in autonomous mode. Goal: "${baseUserGoal}". Immediately plan and execute the next set of actions. 
- **IF DATA COLLECTION**: If you reached the end of the current search results or found no new leads, **YOU MUST ROTATE**. Invent a new, similar search query (e.g. change a keyword or location) and start again. 
- **IF ENGAGEMENT**: If the current feed has no new items, switch tabs or keywords.
- **NEVER WAIT**: Do not wait for user input unless you are fundamentally blocked.
Summarize briefly (1 line) and continue.`
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

                    if (iteration >= hardStopIterations - 1 && !infiniteMode) {
                        if (window) activeSupabaseClients.delete(window.id);
                    }

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
                        // --- USAGE ENFORCEMENT ---
                        if (accessToken) {
                            if (!isPro && currentUsage >= aiActionsLimit) {
                                console.log(`[AI Service] Daily AI action limit reached (${currentUsage}/${aiActionsLimit}). Stopping turn.`);
                                if (window && !window.isDestroyed()) {
                                    window.webContents.send('ai:stream-chunk', {
                                        content: `⚠️ You've reached your daily limit of ${aiActionsLimit} free AI actions. Upgrade to Pro to continue.\n`,
                                        done: true,
                                        limitReached: true
                                    });
                                }
                                // Return partial response but ensure it stops
                                return { success: true, response: fullResponse || 'Limit reached' };
                            }

                            // Track usage (Fire and forget DB update, but increment local for the loop)
                            try {
                                currentUsage++;
                                usageService.incrementUsage(getAccessToken() || accessToken, 'ai_actions').catch(e => {
                                    console.error('[AI Service] DB Usage increment failed:', e);
                                });
                            } catch (e) {
                                console.error('[AI Service] Local usage increment failed:', e);
                            }
                        }
                        // -------------------------

                        toolExecutionCount++; // Increment progress counter
                        // Reset iteration limit in infinite mode if progress is being made
                        if (infiniteMode) {
                            iteration = 0;
                        }
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

                            // Multimodal Handling within the loop
                            let content: any = result;

                            if (!disableVision) {
                                try {
                                    const parsed = JSON.parse(result);
                                    if (parsed && parsed.image_data && typeof parsed.image_data === 'string' && parsed.image_data.startsWith('data:image')) {
                                        console.log('[AI Service] Tool returned image. Creating multimodal message.');
                                        content = [
                                            {
                                                type: 'text',
                                                text: parsed.message || 'Screenshot captured.'
                                            },
                                            {
                                                type: 'image_url',
                                                image_url: {
                                                    url: parsed.image_data
                                                }
                                            }
                                        ];
                                    }
                                } catch (e) {
                                    // Not JSON or no image, keep as text
                                }
                            }

                            const toolMessage = new ToolMessage({
                                tool_call_id: toolCall.id || '',
                                content: content,
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
                        consecutiveToolFailures++;
                        if (consecutiveToolFailures >= 3) {
                            console.log(`[AI Service] Too many consecutive tool failures (${consecutiveToolFailures}). Stopping.`);
                            if (window && !window.isDestroyed()) {
                                window.webContents.send('ai:stream-chunk', {
                                    content: `🛑 Terminating due to repeated tool errors. Final error: ${lastToolErrorDescription}\n`,
                                    done: true
                                });
                            }
                            return { success: false, error: 'Maximum consecutive tool failures reached' };
                        }
                        continue;
                    }
                    consecutiveToolFailures = 0; // Reset on success
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
            const { messages, model, provider, systemPrompt, accessToken } = request;

            const scopedSupabase = await getScopedSupabase(accessToken);
            const { effectiveProvider, effectiveModel } = await resolveAIConfig(scopedSupabase, provider, model, accessToken);

            const chatModel = createChatModel(effectiveProvider, effectiveModel, false);
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

// Redundant tool functions removed. Using imported versions instead.
