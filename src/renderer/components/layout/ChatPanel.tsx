import { v4 as uuidv4 } from 'uuid';
import type { Conversation } from '@shared/types';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { ArrowUp, Square, Plus, Trash2, History, X, MessageSquare, PanelLeftClose, Globe, MousePointer, Type, ScrollText, FileText, ArrowLeft, ArrowRight, RefreshCw, Clock, Search, Eye, Check, Heart, UserPlus, Camera, Zap, Rocket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useChatStore } from '@/stores/chat.store';
import { useSettingsStore } from '@/stores/settings.store';
import { useAuthStore } from '@/stores/auth.store';
import { useAppStore } from '@/stores/app.store';
import { useDebugStore } from '@/stores/debug.store';
import { ChatMessage } from '@/components/chat/ChatMessage';
import { ModelSelector } from '@/components/chat/ModelSelector';
import { MaxStepsSelector } from '@/components/chat/MaxStepsSelector';
import { TimerDisplay } from '@/components/chat/TimerDisplay';
import { CircularLoader } from '@/components/ui/CircularLoader';
import { cn } from '@/lib/utils';
import { MentionInput } from '@/components/ui/mention-input';
import { useTargetsStore } from '@/stores/targets.store';
import { playbookService } from '@/services/playbookService';
import { supabase } from '@/lib/supabase';
import { useWorkspaceStore } from '@/stores/workspace.store';
import { useSubscriptionStore } from '@/stores/subscription.store';
import { useBillingStore } from '@/stores/billing.store';
import { toast } from 'sonner';
import { knowledgeService } from '@/services/knowledgeService';
import type { KnowledgeBase, KnowledgeContent } from '@shared/types';






const SYSTEM_PROMPT = `Analyze user request and orchestrate the necessary tools or playbooks. Be concise in your narration and strictly follow the provided playbook graph if applicable.`;

const TOOL_DISPLAY_NAMES: Record<string, string> = {
  browser_navigate: 'Navigate',
  browser_click: 'Click element',
  browser_click_at: 'Click coordinates',
  browser_click_coordinates: 'Click coordinates',
  browser_type: 'Type text',
  browser_scroll: 'Scroll page',
  browser_get_page_content: 'Read page',
  browser_get_visible_text: 'Read text',
  browser_inspect_element: 'Inspect Element',
  browser_highlight_elements: 'Highlight Elements',
  browser_get_console_logs: 'Console Logs',
  browser_get_accessibility_tree: 'Accessibility Tree',
  browser_snapshot: 'Snapshot',
  browser_hover: 'Hover element',
  browser_take_screenshot: 'Screenshot',
  browser_get_interactive_elements: 'Interactive elements',
  browser_get_page_structure: 'Page structure',
  browser_extract: 'Extract content',
  browser_go_back: 'Go back',
  browser_go_forward: 'Go forward',
  browser_reload: 'Reload page',
  browser_read_page: 'Read page',
  x_search: 'Search X',
  x_like: 'Like on X',
  x_reply: 'Reply on X',
  x_post: 'Post on X',
  x_follow: 'Follow on X',
  x_engage: 'Engaging on X',
};

const TOOL_SUMMARY_HINTS: Record<string, string> = {
  browser_snapshot: 'Captured page snapshot.',
  browser_inspect_element: 'Inspected element properties.',
  browser_highlight_elements: 'Highlighted elements on page.',
  browser_get_console_logs: 'Retrieved console logs.',
  browser_get_accessibility_tree: 'Analyzed accessibility tree.',
  browser_get_page_content: 'Read page content.',
  browser_get_visible_text: 'Collected visible text.',
  browser_wait: 'Waited for UI to settle.',
  browser_type: 'Typed into an input.',
  browser_click: 'Clicked targeted element.',
  browser_click_coordinates: 'Clicked via coordinates.',
  browser_scroll: 'Scrolled the viewport.',
  x_search: 'Opened an X search results page.',
  x_like: 'Engaged with a post via like.',
  x_reply: 'Preparing or sending a reply on X.',
  x_post: 'Composing a new post on X.',
  x_follow: 'Followed a user on X.',
  x_engage: 'Performing multi-action engagement on a post.',
};

function getToolDisplayName(name: string) {
  if (TOOL_DISPLAY_NAMES[name]) return TOOL_DISPLAY_NAMES[name];
  if (name.startsWith('browser_')) {
    return name
      .replace('browser_', '')
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }
  return name;
}

function formatToolNarration(toolName: string, message?: string) {
  const label = getToolDisplayName(toolName);
  if (message && message.trim()) {
    return `${label}: ${message.trim()}`;
  }
  return `${label}: ${TOOL_SUMMARY_HINTS[toolName] || 'Action completed.'}`;
}

export function ChatPanel() {
  const [input, setInput] = useState('');

  const [streamingContent, setStreamingContent] = useState('');
  const [currentToolCalls, setCurrentToolCalls] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showMaxStepsPopover, setShowMaxStepsPopover] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const stepsPopoverRef = useRef<HTMLDivElement>(null);
  const streamingContentRef = useRef('');
  const toolActionsRef = useRef<HTMLDivElement>(null);
  const narrationRef = useRef<HTMLDivElement>(null);
  const committedNarrativeLinesRef = useRef(0);
  const pendingToolNamesRef = useRef<string[]>([]);
  const pendingToolsRef = useRef(new Map<string, any>()); // Tracks full tool call data by ID
  const toolHistoryRef = useRef<{ name: string; message?: string }[]>([]);
  const lastCycleHistoryCountRef = useRef(0);
  const [liveNarration, setLiveNarration] = useState<string[]>([]);
  const [workflows, setWorkflows] = useState<{ name: string }[]>([]);
  const [matchedWorkflows, setMatchedWorkflows] = useState<{ name: string }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);

  const {
    conversations,
    activeConversationId,
    selectedModel,
    createConversation,
    setActiveConversation,
    addMessage,
    updateMessage,
    mergeMessage,
    deleteConversation,
    isStreaming,
    setIsStreaming,
    getActiveConversation,
    maxIterations,
    setMaxIterations,
    infiniteMode,
    setInfiniteMode,
    setAgentStartTime,
    pendingPrompt,
    setPendingPrompt,
  } = useChatStore();

  const { dailyUsage, limits, trackAIAction, incrementAIActionLocal, isUpgradeModalOpen, closeUpgradeModal, openUpgradeModal, modalTitle, modalDescription } = useSubscriptionStore();
  const subscription = useBillingStore(state => state.subscription);
  const isPro = subscription?.status === 'active' || subscription?.status === 'trialing';

  // Local helper to check action allowance based on reactive state
  const canRunAIAction = () => {
    if (isPro) return true;
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (dailyUsage.date !== today) return true;
    return dailyUsage.aiActions < limits.ai_actions_limit;
  };

  const { currentWorkspace } = useWorkspaceStore();


  const { modelProviders } = useSettingsStore();
  const { toggleChatPanel, setHasStarted } = useAppStore();
  const { addLog } = useDebugStore();
  const activeConversation = getActiveConversation();

  const { lists, fetchLists } = useTargetsStore();
  const { mcpServers, apiTools } = useSettingsStore(); // Using existing hook
  const [playbooks, setPlaybooks] = useState<any[]>([]);

  const getDisplayTitle = useCallback((title: string) => {
    if (!title || title.trim() === '') return 'New Chat';

    // Look for playbook signature even if truncated
    if (title.toLowerCase().includes('{{playbooks.')) {
      const idMatch = title.match(/playbooks\.([a-f\d\-]+)/i);
      if (idMatch) {
        const idPrefix = idMatch[1];
        // Exact match first, then prefix match for truncated titles
        const playbook = playbooks.find(p => p.id === idPrefix || p.id.startsWith(idPrefix));
        return playbook ? `Playbook: ${playbook.name}` : 'Run Playbook';
      }
      return 'Run Playbook';
    }
    return title;
  }, [playbooks]);

  const { session } = useAuthStore();
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [knowledgeItems, setKnowledgeItems] = useState<KnowledgeContent[]>([]);

  const filteredConversations = useMemo(() => {
    return conversations.filter((conv: Conversation) =>
      !conv.id.startsWith('playbook-') &&
      conv.workspaceId === currentWorkspace?.id
    );
  }, [conversations, currentWorkspace?.id]);

  // Debug logging
  console.log('[ChatPanel] Render State:', {
    hasSession: !!session,
    hasToken: !!session?.access_token,
    playbooksLen: playbooks.length,
    listsLen: lists.length
  });

  useEffect(() => {
    // Only fetch data if we have a session (or retry when session becomes available)
    if (session) {
      console.log('[ChatPanel] Session detected, fetching playbooks and lists...');
      window.api.ai.listWorkflows().then(setWorkflows);

      const refreshData = async () => {
        try {
          const data = await playbookService.getPlaybooks(currentWorkspace?.id);
          console.log(`[ChatPanel] Fetched ${data.length} playbooks`);
          setPlaybooks(data);
        } catch (err) {
          console.error('[ChatPanel] Failed to fetch playbooks:', err);
        }
      };

      refreshData();
      fetchLists();

      const fetchKnowledge = async () => {
        try {
          const kbs = await knowledgeService.getKnowledgeBases();
          setKnowledgeBases(kbs);
          const allContent = await Promise.all(kbs.map(kb => knowledgeService.getKBContent(kb.id)));
          setKnowledgeItems(allContent.flat());
        } catch (err) {
          console.error('[ChatPanel] Failed to fetch knowledge:', err);
        }
      };
      fetchKnowledge();
    }
  }, [session, fetchLists, currentWorkspace?.id]);

  const getGlobalVariables = useCallback(() => {
    const groups: { nodeName: string; variables: { label: string; value: string; example?: string }[] }[] = [];

    // 1. Knowledge Bases (Priority)
    if (knowledgeItems.length > 0) {
      knowledgeBases.forEach(kb => {
        const items = knowledgeItems.filter(item => item.kb_id === kb.id);
        if (items.length > 0) {
          groups.push({
            nodeName: kb.name,
            variables: items.map(item => ({
              label: item.title || 'Untitled',
              value: `{{kb.${item.id}}}`,
              example: item.content
            }))
          });
        }
      });
    }

    if (playbooks.length > 0) {
      groups.push({
        nodeName: 'Playbooks',
        variables: playbooks.map(p => ({
          label: p.name,
          value: `{{playbooks.${p.id}}}`,
          example: p.description
        }))
      });
    }

    if (lists.length > 0) {
      groups.push({
        nodeName: 'Target Lists',
        variables: lists.map(l => ({
          label: l.name,
          value: `{{lists.${l.id}}}`,
          example: `${l.target_count || 0} targets`
        }))
      });
    }

    if (mcpServers.length > 0) {
      groups.push({
        nodeName: 'MCP Servers',
        variables: mcpServers.map(s => ({
          label: s.name,
          value: `{{mcp.${s.id}}}`,
          example: (s.config as any).command || (s.config as any).url || 'No config'
        }))
      });
    }

    if (apiTools.length > 0) {
      groups.push({
        nodeName: 'API Tools',
        variables: apiTools.map(t => ({
          label: t.name,
          value: `{{apis.${t.id}}}`,
          example: t.endpoint
        }))
      });
    }



    return groups;
  }, [playbooks, lists, mcpServers, apiTools, knowledgeBases, knowledgeItems]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConversation?.messages, streamingContent]);

  useEffect(() => {
    if (textareaRef.current) {
      // Reset to minimum height first, then calculate based on content
      textareaRef.current.style.height = '44px';
      if (input) {
        const scrollHeight = textareaRef.current.scrollHeight;
        textareaRef.current.style.height = `${Math.min(scrollHeight, 200)}px`;
      }
    }
  }, [input]);

  // Track saved messages to prevent duplicates
  const savedMessagesRef = useRef<Set<string>>(new Set());

  const saveNarrationMessage = useCallback((content: string) => {
    const { runningConversationId, activeConversationId } = useChatStore.getState();
    const targetId = runningConversationId || activeConversationId;
    if (!targetId || !content.trim()) return;

    mergeMessage(targetId, {
      role: 'assistant',
      content: content.trim(),
    });
  }, [mergeMessage]);

  useEffect(() => {
    const unsubscribe = window.api.ai.onStreamChunk((data) => {
      const { setRunningConversationId } = useChatStore.getState();

      if (data.done) {
        setIsStreaming(false);
        setAgentStartTime(null);
        setStreamingContent('');
        setLiveNarration([]);
        setCurrentToolCalls([]);

        // Clear running state
        setRunningConversationId(null);

        toolHistoryRef.current = [];
        committedNarrativeLinesRef.current = 0;
        savedMessagesRef.current.clear();
        streamingContentRef.current = '';
      } else {
        const { runningConversationId, activeConversationId } = useChatStore.getState();
        const targetId = runningConversationId || activeConversationId;

        const content = data.content;
        const streamData = data as any; // toolCall, toolResult, isNewTurn, limitReached

        // Handling limit reached signal from main process
        if (streamData.limitReached) {
          setIsStreaming(false);
          setRunningConversationId(null);
          setAgentStartTime(null);
          openUpgradeModal(
            "Daily Limit Reached",
            `You've reached your ${limits.ai_actions_limit} free AI actions for today. Upgrade to Pro to continue your automation.`
          );
          return;
        }

        // 0. Handle New Turn Signal (Starts a fresh chronological block)
        if (streamData.isNewTurn && targetId) {
          // Clear tracking for the new turn without double-merging
          streamingContentRef.current = '';
          setStreamingContent('');

          // NEW: Ensure we separate turns into distinct bubbles for better UX
          // (Reverting the merge-into-one-bubble experiment based on user feedback)
          addMessage(targetId, {
            role: 'assistant',
            content: '',
          });

          // Reset tracking for the new turn
          savedMessagesRef.current.clear();
        }

        // 1. Handle Text Content (Narration)
        if (content && content.trim()) {
          // If it's narration vs output
          if (streamData.isNarration !== false) { // True or undefined
            streamingContentRef.current += content;
            setStreamingContent(streamingContentRef.current);

            // Proactively merge into the current assistant message to show it in the turn list immediately
            if (targetId) {
              mergeMessage(targetId, {
                role: 'assistant',
                content: content,
              });
            }
          } else {
            // It is a final response part
            if (targetId) {
              mergeMessage(targetId, {
                role: 'assistant',
                content: content.trim(),
              });
            }
          }
        }

        // 2. Handle Tool Call Start
        if (streamData.toolCall) {
          // Update local usage UI immediately
          incrementAIActionLocal();

          // Note: Tracking and limit enforcement moved to Main Process for reliability
          // and to prevent double-counting.

          // Clear pending narration tracking before starting a tool without double-merging
          streamingContentRef.current = '';
          setStreamingContent('');

          const toolCall = streamData.toolCall;
          // Track for correlation
          pendingToolsRef.current.set(toolCall.id || toolCall.name, toolCall);

          const newTool = {
            id: toolCall.id,
            status: 'running',
            name: toolCall.name,
            args: toolCall.args,
            result: undefined,
            logs: [],
            startTime: Date.now(),
            duration: 0
          };

          setCurrentToolCalls(prev => [...prev, newTool]);
          addLog({
            type: 'tool',
            tool: toolCall.name,
            message: 'Executing...',
            data: toolCall.args
          });
        }

        // 3. Handle Tool Result
        if (streamData.toolResult) {
          // New structure: { toolCallId, result: { ... } }
          const { toolCallId, result } = streamData.toolResult;

          // Fallback for logic if ID missing
          const resolvedToolCallId = toolCallId;
          const originalTool = pendingToolsRef.current.get(resolvedToolCallId);
          // If not found by ID, try finding last running tool (fallback)
          const fallbackToolParams = originalTool || { name: 'unknown_tool', args: {} };

          // Update the live tool card status - Remove completed tool to keep list running-only
          setCurrentToolCalls(prev => prev.filter(t => {
            // Remove by ID if present
            if (resolvedToolCallId && t.id === resolvedToolCallId) return false;
            // Fallback: Remove if matching name and running (older logic/safety)
            if (!resolvedToolCallId && t.status === 'running' && t.name === fallbackToolParams.name) return false;
            return true;
          }));

          addLog({
            type: 'result',
            message: result.message || 'Done',
            data: result
          });

          // Save the completed tool interaction to history
          if (targetId) {
            const toolCallObj = {
              id: resolvedToolCallId || uuidv4(),
              name: fallbackToolParams.name,
              arguments: fallbackToolParams.args
            } as any;

            const toolResultObj = {
              toolCallId: toolCallObj.id,
              result: result,
              error: result.error
            } as any;

            mergeMessage(targetId, {
              role: 'assistant',
              content: '',
              toolCalls: [toolCallObj],
              toolResults: [toolResultObj]
            });

            // Clean up ref
            if (resolvedToolCallId) {
              pendingToolsRef.current.delete(resolvedToolCallId);
            }
          }
        }
      }
    });

    return () => unsubscribe();
  }, [addMessage, setIsStreaming, addLog, saveNarrationMessage, incrementAIActionLocal]);

  useEffect(() => {
    if (!showMaxStepsPopover) return;
    const handleClick = (event: MouseEvent) => {
      if (stepsPopoverRef.current && !stepsPopoverRef.current.contains(event.target as Node)) {
        setShowMaxStepsPopover(false);
      }
    };
    window.addEventListener('mousedown', handleClick);
    return () => window.removeEventListener('mousedown', handleClick);
  }, [showMaxStepsPopover]);

  // Listen for debug logs from main process
  useEffect(() => {
    const unsubscribe = window.api.debug?.onLog?.((data) => {
      addLog({
        type: data.type === 'error' ? 'error' : data.type === 'warning' ? 'info' : 'info',
        message: data.message,
        data: data.data
      });
    });
    return () => unsubscribe?.();
  }, [addLog]);

  useEffect(() => {
    if (!isStreaming) return;
    const container = toolActionsRef.current;
    if (container && pendingToolNamesRef.current.length === 0) {
      container.scrollTop = container.scrollHeight;
    }
  }, [streamingContent, isStreaming]);

  useEffect(() => {
    if (!isStreaming) return;
    const scroller = narrationRef.current;
    if (scroller) {
      scroller.scrollTop = scroller.scrollHeight;
    }
  }, [streamingContent, isStreaming]);


  const sendMessage = useCallback(async (content: string, options: { isIsolated?: boolean, playbookId?: string } = {}) => {
    if (!canRunAIAction()) {
      openUpgradeModal(
        "Daily Limit Reached",
        "You've used your 10 free AI actions for today. Upgrade to Pro to continue automating at scale."
      );
      return;
    }

    const { isIsolated = false, playbookId = null } = options;
    const enabledProviders = modelProviders.filter((p) => p.enabled);

    if (!selectedModel && enabledProviders.length === 0) {
      alert('Please configure a model provider in Settings first.');
      return;
    }

    let provider = selectedModel
      ? modelProviders.find((p) => p.id === selectedModel.providerId)
      : enabledProviders[0];

    let model = selectedModel;

    if (!provider && enabledProviders.length > 0) {
      provider = enabledProviders[0];
      model = provider.models[0] ? { ...provider.models[0], providerId: provider.id } : null;
    }

    if (!provider || !model) {
      alert('Please select a model or configure a provider in Settings.');
      return;
    }

    const conversationId = isIsolated
      ? `playbook-${playbookId || Date.now()}`
      : (activeConversationId || createConversation());

    // For isolated runs, ensure the conversation exists in the store so messages can be added
    if (isIsolated && !conversations.some(c => c.id === conversationId)) {
      useChatStore.setState((state) => ({
        conversations: [{
          id: conversationId,
          title: 'Playbook Execution',
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          modelId: model.id,
          workspaceId: currentWorkspace?.id
        }, ...state.conversations]
      }));
    }

    // Always switch to the new conversation, even for isolated runs, 
    // so the user can visually track the agent's progress.
    if (!activeConversationId || conversationId !== activeConversationId) {
      setActiveConversation(conversationId);
    }

    // Add user message immediately
    addMessage(conversationId, {
      role: 'user',
      content: content,
    });

    // Clear input if it matches content (handle manual send vs programmatic)
    if (input === content) {
      setInput('');
    }

    setIsStreaming(true);
    useChatStore.getState().setRunningConversationId(conversationId); // Track running agent conversation
    setAgentStartTime(Date.now());
    setHasStarted(true);

    // Retrieve tokens
    const { session } = useAuthStore.getState();
    let token = session?.access_token;
    let refreshToken = session?.refresh_token;

    if (!token) {
      // Fallback
      const { data } = await supabase.auth.getSession();
      token = data.session?.access_token;
      refreshToken = data.session?.refresh_token;
    }

    // Prepare history
    const history = conversations.find(c => c.id === conversationId)?.messages || [];
    // We just added the user message, so history includes it if we fetch fresh, 
    // but the store might not update immediately in this closure. 
    // Actually addMessage updates the store synchronously usually, but let's be safe.
    // The main process expects "messages" array.

    // Construct the full message list for the API
    const authMessage = { role: 'user', content: content, id: crypto.randomUUID(), timestamp: Date.now() };
    // Get previous messages excluding the one we just added (to avoid dupes if we rely on store)
    // Actually, simpler to just pass the history + text? 
    // The window.api.ai.chat expects `messages` array.
    // Let's grab the latest state from store helper or refetch. 
    // Better: just construct it here.
    const validHistory = history.map(m => ({
      role: m.role,
      content: m.content || '',
      toolCalls: m.toolCalls,
      toolResults: m.toolResults
    }));

    let latestPlaybooks = playbooks;
    if (playbookId || isIsolated) {
      try {
        console.log('[ChatPanel] Refreshing playbooks before execution to ensure latest nodes/rules...');
        latestPlaybooks = await playbookService.getPlaybooks(useWorkspaceStore.getState().currentWorkspace?.id);
        setPlaybooks(latestPlaybooks);
      } catch (err) {
        console.warn('[ChatPanel] Failed to refresh playbooks, using stale state', err);
      }
    }

    try {
      if (!canRunAIAction()) {
        setIsStreaming(false);
        openUpgradeModal(
          "Daily Limit Reached",
          `You've reached your ${limits.ai_actions_limit} free AI actions for today. Upgrade to Pro to continue your automation.`
        );
        return;
      }

      // The backend expects the whole history including the new message
      // If isolated, we only send the current message to ensure a fresh, independent instance
      const messagesPayload = isIsolated
        ? [authMessage]
        : [
          ...validHistory,
          authMessage
        ] as any[];

      let speed: 'slow' | 'normal' | 'fast' = 'normal';
      if (playbookId) {
        const pb = latestPlaybooks.find(p => p.id === playbookId);
        if (pb?.execution_defaults?.speed) {
          speed = pb.execution_defaults.speed;
        }
      }

      const result = await window.api.ai.chat({
        messages: messagesPayload,
        model: model,
        provider: provider,
        systemPrompt: SYSTEM_PROMPT,
        maxIterations,
        infiniteMode,
        initialUserPrompt: content,
        accessToken: token,
        refreshToken: refreshToken,
        playbooks: latestPlaybooks,
        targetLists: lists,
        speed,
        isPlaybookRun: isIsolated,
        workspaceId: currentWorkspace?.id,
        workspaceSettings: currentWorkspace?.settings
      });

      if (!result.success && result.error) {
        setIsStreaming(false);
        setAgentStartTime(null);
        addMessage(conversationId, {
          role: 'assistant',
          content: `Error: ${result.error}`,
        });
      }
    } catch (error) {
      setIsStreaming(false);
      setAgentStartTime(null);
      addMessage(conversationId, {
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`,
      });
    }
  }, [modelProviders, selectedModel, activeConversationId, createConversation, setActiveConversation, addMessage, input, setInput, setIsStreaming, setHasStarted, conversations, maxIterations, infiniteMode, playbooks, lists]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    await sendMessage(input.trim());
  }, [input, sendMessage, isStreaming]);

  useEffect(() => {
    if (pendingPrompt && !isStreaming) {
      // Small delay to ensure everything is mounted/ready
      const timer = setTimeout(() => {
        if (typeof pendingPrompt === 'string') {
          sendMessage(pendingPrompt);
        } else {
          sendMessage(pendingPrompt.content, {
            isIsolated: pendingPrompt.isIsolated,
            playbookId: pendingPrompt.playbookId
          });
        }
        setPendingPrompt(null);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [pendingPrompt, isStreaming, sendMessage, setPendingPrompt]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showSuggestions) {
      if (e.key === 'ArrowDown') {
        setSelectedSuggestionIndex((prev) => (prev + 1) % matchedWorkflows.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedSuggestionIndex((prev) => (prev - 1 + matchedWorkflows.length) % matchedWorkflows.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const selected = matchedWorkflows[selectedSuggestionIndex];
        if (selected) {
          setInput(`/${selected.name} `);
          setShowSuggestions(false);
        }
      } else if (e.key === 'Escape') {
        setShowSuggestions(false);
      }
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isStreaming) {
        handleSubmit(e);
      }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInput(value);

    if (value.startsWith('/')) {
      const query = value.slice(1).toLowerCase();
      const matches = workflows.filter((w) => w.name.toLowerCase().includes(query));
      setMatchedWorkflows(matches);
      setShowSuggestions(matches.length > 0);
      setSelectedSuggestionIndex(0);
    } else {
      setShowSuggestions(false);
    }
  };

  return (
    <div className="relative flex flex-col h-full bg-card min-w-0 w-full overflow-hidden">
      <div className="flex items-center justify-between h-12 px-4 border-b border-border/10 sticky top-0 z-20 gap-2">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <h2 className="text-sm font-semibold truncate">{showHistory ? 'Chat History' : 'Reavion Agent'}</h2>
          {!showHistory && <TimerDisplay />}
        </div>
        <div className="flex items-center gap-1">
          {showHistory ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setShowHistory(false)}
              title="Close history"
            >
              <X className="h-4 w-4" />
            </Button>
          ) : (
            <>
              {filteredConversations.length > 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setShowHistory(true)}
                  title="Chat history"
                >
                  <History className="h-4 w-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={async () => {
                  try {
                    await window.api.ai.stop();
                  } catch (e) {
                    console.error('Failed to stop AI:', e);
                  }
                  createConversation();
                  setHasStarted(false);
                  window.api.ai.resetContext(currentWorkspace?.id);
                }}
                title="New chat"
              >
                <Plus className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={toggleChatPanel}
                title="Close chat"
              >
                <PanelLeftClose className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      {showHistory && (
        <div className="absolute inset-0 top-12 z-10 bg-card flex flex-col">
          <ScrollArea className="flex-1 h-full">
            <div className="p-2 space-y-1">
              {filteredConversations.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No conversations yet
                </div>
              ) : (
                filteredConversations
                  .map((conv) => (
                    <button
                      key={conv.id}
                      onClick={() => {
                        setActiveConversation(conv.id);
                        setShowHistory(false);
                      }}
                      className={cn(
                        'group w-full text-left px-3 py-2.5 rounded-lg transition-colors flex items-center gap-3 min-w-0 mb-1',
                        conv.id === activeConversationId
                          ? 'bg-secondary border border-border'
                          : 'hover:bg-secondary/50 border border-transparent'
                      )}
                    >
                      <MessageSquare className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0 flex flex-col justify-center">
                        <div className="text-[13px] font-semibold truncate text-foreground/90 pr-2" title={getDisplayTitle(conv.title)}>
                          {getDisplayTitle(conv.title)}
                        </div>
                        <div className="text-[11px] text-muted-foreground/60 truncate pr-2">
                          {conv.messages.length} messages · {new Date(conv.updatedAt).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="flex-shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive/50 hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all rounded-md"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteConversation(conv.id);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </button>
                  ))
              )}
            </div>
          </ScrollArea>
        </div>
      )}

      <ScrollArea className="flex-1">
        {!activeConversation || activeConversation.messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6 py-12 text-muted-foreground">
            <p className="text-sm">Start a conversation to see agent activity here.</p>
          </div>
        ) : (
          <div className="space-y-1 w-full overflow-x-hidden min-w-0">
            {activeConversation.messages.map((message, i) => (
              <ChatMessage
                key={message.id || i}
                message={message}
                variables={getGlobalVariables()} // Assuming getGlobalVariables() is the correct source for variables
                onRetry={message.role === 'user' ? (content) => {
                  setInput(content);
                } : undefined} // Reverted onRetry to original logic as handleRetry is not defined
                onApprove={() => sendMessage('Approved, proceed.')}
                isLast={i === activeConversation.messages.length - 1}
              />
            ))}
            {isStreaming && (
              <div className="space-y-2 mt-2">
                {/* 1. Narration Text (Streaming) - HIDDEN to prevent duplication with ChatMessage
                {streamingContent && (
                  <div className="bg-transparent px-4 py-2 text-sm text-foreground/80 leading-relaxed">
                    <span className="typing-cursor">
                      <ProcessedText text={streamingContent} variables={getGlobalVariables()} />
                    </span>
                  </div>
                )}
                */}

                {/* 2. Live Tool Executions (Cards) */}
                {currentToolCalls.length > 0 && (
                  <div className="px-4 space-y-2">
                    {currentToolCalls.map((tool, idx) => {
                      const isSuccess = tool.status === 'success';
                      const isFailed = tool.status === 'failed';
                      const isRunning = tool.status === 'running';

                      const getLiveToolLabel = (name: string) => {
                        const labels: Record<string, string> = {
                          'browser_navigate': 'Navigating',
                          'browser_click': 'Clicking Element',
                          'browser_type': 'Typing',
                          'browser_scroll': 'Scrolling',
                          'browser_snapshot': 'Snapshot',
                          'browser_wait': 'Waiting',
                          'x_search': 'Searching X',
                          'x_like': 'Liking Post',
                          'x_reply': 'Replying',
                          'x_post': 'Posting',
                          'x_engage': 'Engaging',
                          'x_scan_posts': 'Scanning Posts',
                          'browser_move_to_element': 'Focusing',
                          'browser_get_visible_text': 'Read text',
                        };
                        if (labels[name]) return labels[name];
                        return name
                          .replace(/^browser_/, '')
                          .replace(/^x_/, '')
                          .split('_')
                          .map(w => w.charAt(0).toUpperCase() + w.slice(1))
                          .join(' ');
                      };

                      const label = getLiveToolLabel(tool.name);

                      return (
                        <div key={idx} className={cn(
                          "rounded-lg border border-border bg-card/50 overflow-hidden transition-all duration-300",
                          isRunning ? "opacity-100" : "opacity-80"
                        )}>
                          <div className="flex items-center gap-3 px-3 py-2.5">
                            <div className={cn(
                              "flex items-center justify-center w-6 h-6 rounded-md border text-xs",
                              isSuccess ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500" :
                                isFailed ? "bg-destructive/10 border-destructive/20 text-destructive" :
                                  "bg-primary/10 border-primary/20 text-primary"
                            )}>
                              {isSuccess ? <Check className="h-3.5 w-3.5" /> :
                                isFailed ? <X className="h-3.5 w-3.5" /> :
                                  <CircularLoader className="h-3.5 w-3.5" />
                              }
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <span className={cn(
                                  "text-sm font-medium truncate",
                                  isSuccess ? "text-foreground/80" :
                                    isFailed ? "text-destructive" : "text-primary/80"
                                )}>
                                  {label}
                                </span>
                                {tool._duration && (
                                  <span className="text-[10px] text-muted-foreground font-mono ml-2">
                                    {(tool._duration / 1000).toFixed(1)}s
                                  </span>
                                )}
                              </div>

                              {/* Hide args/result snippet to keep UI focused on action only */}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 3. Thinking Indicator (if no content yet) */}
                {!streamingContent && currentToolCalls.length === 0 && (
                  <div className="px-6 py-4 flex items-center gap-3 text-muted-foreground">
                    <CircularLoader className="h-4 w-4" />
                    <span className="text-sm animate-pulse">Thinking...</span>
                  </div>
                )}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </ScrollArea>

      <div className="p-3 space-y-2">
        <form onSubmit={handleSubmit}>
          <div className="bg-secondary/30 rounded-2xl border border-border/40 focus-within:border-border transition-all overflow-hidden">
            {showSuggestions && (
              <div className="absolute bottom-full left-0 right-0 mb-2 mx-3 bg-popover border border-border/50 rounded-xl shadow-2xl overflow-hidden z-20 animate-in fade-in slide-in-from-bottom-2 duration-200">
                <div className="px-3 py-2 border-b border-border/30 bg-secondary/20">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 flex items-center gap-2">
                    <ScrollText className="h-3 w-3" /> Growth Aliases
                  </span>
                </div>
                <div className="max-h-[200px] overflow-y-auto py-1">
                  {matchedWorkflows.map((workflow, idx) => (
                    <button
                      key={workflow.name}
                      onMouseMove={() => setSelectedSuggestionIndex(idx)}
                      onClick={() => {
                        setInput(`/${workflow.name} `);
                        setShowSuggestions(false);
                      }}
                      className={cn(
                        "w-full px-3 py-2 text-sm text-left flex items-center gap-3 transition-colors",
                        idx === selectedSuggestionIndex ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <div className={cn(
                        "w-6 h-6 rounded flex items-center justify-center border",
                        idx === selectedSuggestionIndex ? "border-primary/20 bg-primary/10" : "border-transparent"
                      )}>
                        <FileText className="h-3.5 w-3.5" />
                      </div>
                      <span className="font-medium">/{workflow.name}</span>
                      {idx === selectedSuggestionIndex && (
                        <span className="ml-auto text-[10px] text-muted-foreground font-mono bg-muted/50 px-1.5 py-0.5 rounded">Enter</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <MentionInput
              value={input}
              onChange={(e) => {
                const value = e.target.value;
                setInput(value);

                if (value.startsWith('/')) {
                  const query = value.slice(1).toLowerCase();
                  const matches = workflows.filter((w) => w.name.toLowerCase().includes(query));
                  setMatchedWorkflows(matches);
                  setShowSuggestions(matches.length > 0);
                  setSelectedSuggestionIndex(0);
                } else {
                  setShowSuggestions(false);
                }
              }}
              onKeyDown={handleKeyDown}
              variableGroups={getGlobalVariables()}
              placeholder="Message Reavion..."
              className="w-full min-h-[44px] max-h-[200px] px-4 pt-3 pb-2 text-sm bg-transparent border-0 resize-none focus:outline-none placeholder:text-muted-foreground/60 shadow-none focus-visible:ring-0 scrollbar-thin scrollbar-thumb-muted-foreground/20"
            />
            <div className="px-3 py-2.5 flex items-end justify-between gap-2 border-t border-border/5">
              <div className="flex flex-col gap-1.5 min-w-0 flex-1 overflow-hidden">
                <div className="flex items-center gap-3 flex-wrap text-[10px] text-muted-foreground/60">
                  <ModelSelector />
                  <MaxStepsSelector />
                  {!isPro && (
                    <div className="flex items-center gap-1 text-[10px] text-primary/60 font-medium">
                      <Zap className="h-2.5 w-2.5 fill-current" />
                      <span>{Math.max(0, limits.ai_actions_limit - dailyUsage.aiActions)} actions left today</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center">
                {isStreaming ? (
                  <button
                    type="button"
                    onClick={async (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      // Tool actions are already saved immediately when they complete
                      // Clear streaming state
                      // Clear streaming state
                      setIsStreaming(false);
                      setAgentStartTime(null);
                      setStreamingContent('');
                      streamingContentRef.current = '';
                      setLiveNarration([]);
                      toolHistoryRef.current = [];
                      savedMessagesRef.current.clear();

                      // Clear running state
                      useChatStore.getState().setRunningConversationId(null);

                      // Add a simple stop indicator
                      if (activeConversationId) {
                        addMessage(activeConversationId, {
                          role: 'system',
                          content: 'Stopped',
                        });
                      }
                      try {
                        await window.api.ai.stop();
                      } catch (e) {
                        console.error('Failed to stop AI:', e);
                      }
                    }}
                    className="w-8 h-8 rounded-full bg-foreground flex items-center justify-center hover:bg-foreground/90 transition-colors"
                    title="Stop generation"
                  >
                    <Square className="h-3 w-3 text-background fill-background" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!input.trim()}
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center transition-all",
                      input.trim()
                        ? "bg-foreground text-background hover:bg-foreground/90"
                        : "bg-muted text-muted-foreground cursor-not-allowed"
                    )}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
