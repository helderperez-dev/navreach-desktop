import { v4 as uuidv4 } from 'uuid';
import { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowUp, Square, Plus, Trash2, History, X, MessageSquare, PanelLeftClose, Globe, MousePointer, Type, ScrollText, FileText, ArrowLeft, ArrowRight, RefreshCw, Clock, Search, Eye, Check, Heart, UserPlus, Camera, Loader2 } from 'lucide-react';
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
import { CircularLoader } from '@/components/ui/CircularLoader';
import { cn } from '@/lib/utils';
import { MentionInput } from '@/components/ui/mention-input';
import { useTargetsStore } from '@/stores/targets.store';
import { playbookService } from '@/services/playbookService';
import { ProcessedText } from '@/lib/mention-utils';
import { supabase } from '@/lib/supabase';



const SYSTEM_PROMPT = `You are an autonomous browser automation agent.
Your goal is to help the user with browser tasks, target management, and playbook execution.
Be autonomous, analyze page states, and use the tools provided to achieve the user's request.
IMPORTANT: When reporting results to the user, ALWAYS refer to items (like target lists, playbooks) by their NAME. Never expose UUIDs or internal IDs in your final response.`;

const TOOL_DISPLAY_NAMES: Record<string, string> = {
  browser_navigate: 'Navigate',
  browser_click: 'Click element',
  browser_click_at: 'Click coordinates',
  browser_click_coordinates: 'Click coordinates',
  browser_type: 'Type text',
  browser_scroll: 'Scroll page',
  browser_get_page_content: 'Read page',
  browser_get_visible_text: 'Read text',
  browser_snapshot: 'Snapshot',
  browser_wait: 'Wait',
  browser_find_elements: 'Find elements',
  browser_get_accessibility_tree: 'Accessibility tree',
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
    deleteConversation,
    isStreaming,
    setIsStreaming,
    getActiveConversation,
    maxIterations,
    setMaxIterations,
    infiniteMode,
    setInfiniteMode,
  } = useChatStore();

  const { modelProviders } = useSettingsStore();
  const { toggleChatPanel, setHasStarted } = useAppStore();
  const { addLog } = useDebugStore();
  const activeConversation = getActiveConversation();

  const { lists, fetchLists } = useTargetsStore();
  const { mcpServers, apiTools } = useSettingsStore(); // Using existing hook
  const [playbooks, setPlaybooks] = useState<any[]>([]);

  const { session } = useAuthStore();

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
      playbookService.getPlaybooks().then(data => {
        console.log(`[ChatPanel] Fetched ${data.length} playbooks`);
        setPlaybooks(data);
      }).catch(err => console.error('[ChatPanel] Failed to fetch playbooks:', err));

      fetchLists(); // targetsStore handles its own fetching logic but good to trigger it
    }
  }, [session, fetchLists]); // Re-run when session changes

  const getGlobalVariables = useCallback(() => {
    const groups: { nodeName: string; variables: { label: string; value: string; example?: string }[] }[] = [];

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
  }, [playbooks, lists, mcpServers, apiTools]);

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
    if (!activeConversationId || !content.trim()) return;

    // Deduplicate using first 50 chars as key
    const key = content.trim().slice(0, 50);
    if (savedMessagesRef.current.has(key)) return;
    savedMessagesRef.current.add(key);

    addMessage(activeConversationId, {
      role: 'assistant',
      content: content.trim(),
    });
  }, [activeConversationId, addMessage]);

  useEffect(() => {
    const unsubscribe = window.api.ai.onStreamChunk((data) => {
      if (data.done) {
        // End of stream - flush any remaining text
        if (streamingContentRef.current.trim()) {
          saveNarrationMessage(streamingContentRef.current);
        }

        setIsStreaming(false);
        streamingContentRef.current = '';
        setStreamingContent('');
        setLiveNarration([]);
        setCurrentToolCalls([]);

        toolHistoryRef.current = [];
        committedNarrativeLinesRef.current = 0;
        savedMessagesRef.current.clear();
      } else {
        const content = data.content;
        const streamData = data as any; // toolCall, toolResult

        // 1. Handle Text Content (Narration)
        if (content && content.trim()) {
          // If it's narration vs output
          if (streamData.isNarration !== false) { // True or undefined
            streamingContentRef.current += content;
            setStreamingContent(streamingContentRef.current);
          } else {
            // It is a final response part
            if (activeConversationId) {
              addMessage(activeConversationId, {
                role: 'assistant',
                content: content.trim(),
              });
            }
          }
        }

        // 2. Handle Tool Call Start
        if (streamData.toolCall) {
          // Flush pending narration before starting a tool
          if (streamingContentRef.current.trim()) {
            saveNarrationMessage(streamingContentRef.current);
            streamingContentRef.current = '';
            setStreamingContent('');
          }

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
          if (activeConversationId) {
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

            addMessage(activeConversationId, {
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
  }, [activeConversationId, addMessage, setIsStreaming, addLog, saveNarrationMessage]);

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


  const sendMessage = useCallback(async (content: string) => {
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

    const conversationId = activeConversationId || createConversation();
    if (!activeConversationId) {
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

    try {
      // The backend expects the whole history including the new message
      const messagesPayload = [
        ...validHistory,
        // If the store hasn't updated yet, we might need to append the new message. 
        // But addMessage is sync in Zustand actions usually. 
        // However, to be safe, validHistory comes from `conversations` variable which IS from the hook. 
        // The hook value `conversations` won't update until next render.
        // So validHistory is OLD. We must append.
        authMessage
      ] as any[];

      const result = await window.api.ai.chat({
        messages: messagesPayload,
        model: model,
        provider: provider,
        systemPrompt: SYSTEM_PROMPT,
        maxIterations,
        infiniteMode,
        initialUserPrompt: content, // This is used for some tailored prompts potentially
        accessToken: token,
        refreshToken: refreshToken,
        playbooks: playbooks,
        targetLists: lists
      });

      if (!result.success && result.error) {
        setIsStreaming(false);
        addMessage(conversationId, {
          role: 'assistant',
          content: `Error: ${result.error}`,
        });
      }
    } catch (error) {
      setIsStreaming(false);
      addMessage(conversationId, {
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`,
      });
    }
  }, [modelProviders, selectedModel, activeConversationId, createConversation, setActiveConversation, addMessage, input, setInput, setIsStreaming, setHasStarted, conversations, maxIterations, infiniteMode, playbooks, lists]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    await sendMessage(input.trim());
  }, [input, sendMessage]);

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
      handleSubmit(e);
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
    <div className="relative flex flex-col h-full bg-card">
      <div className="flex items-center justify-between h-12 px-4 border-b border-border">
        <h2 className="text-sm font-semibold">{showHistory ? 'Chat History' : 'Navreach Agent'}</h2>
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
              {conversations.length > 0 && (
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
                onClick={() => {
                  createConversation();
                  setHasStarted(false);
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
        <div className="absolute top-12 left-0 right-0 bottom-0 z-10 bg-card flex flex-col">
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {conversations.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No conversations yet
                </div>
              ) : (
                conversations.map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => {
                      setActiveConversation(conv.id);
                      setShowHistory(false);
                    }}
                    className={cn(
                      'w-full text-left px-3 py-2.5 rounded-lg transition-colors flex items-start gap-3',
                      conv.id === activeConversationId
                        ? 'bg-secondary border border-border'
                        : 'hover:bg-secondary/50 border border-transparent'
                    )}
                  >
                    <MessageSquare className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{conv.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {conv.messages.length} messages · {new Date(conv.updatedAt).toLocaleDateString()}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive/50 hover:text-destructive flex-shrink-0 opacity-0 group-hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteConversation(conv.id);
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
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
          <div className="space-y-1">
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
                {/* 1. Narration Text (Streaming) */}
                {streamingContent && (
                  <div className="bg-transparent px-4 py-2 text-sm text-gray-300 leading-relaxed animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <span className="typing-cursor">
                      <ProcessedText text={streamingContent} variables={getGlobalVariables()} />
                    </span>
                  </div>
                )}

                {/* 2. Live Tool Executions (Cards) */}
                {currentToolCalls.length > 0 && (
                  <div className="px-4 space-y-2">
                    {currentToolCalls.map((tool, idx) => {
                      const isSuccess = tool.status === 'success';
                      const isFailed = tool.status === 'failed';
                      const isRunning = tool.status === 'running';

                      const toolLabels: Record<string, string> = {
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
                        'browser_get_visible_text': 'Read text',
                      };

                      const label = toolLabels[tool.name] || tool.name;

                      return (
                        <div key={idx} className={cn(
                          "rounded-lg border border-white/5 bg-[#1e1e20] overflow-hidden transition-all duration-300",
                          isRunning ? "opacity-100" : "opacity-80"
                        )}>
                          <div className="flex items-center gap-3 px-3 py-2.5">
                            <div className={cn(
                              "flex items-center justify-center w-6 h-6 rounded-md border text-xs",
                              isSuccess ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500" :
                                isFailed ? "bg-red-500/10 border-red-500/20 text-red-500" :
                                  "bg-blue-500/10 border-blue-500/20 text-blue-400"
                            )}>
                              {isSuccess ? <Check className="h-3.5 w-3.5" /> :
                                isFailed ? <X className="h-3.5 w-3.5" /> :
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              }
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <span className={cn(
                                  "text-sm font-medium truncate",
                                  isSuccess ? "text-gray-300" :
                                    isFailed ? "text-red-300" : "text-blue-300"
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
              <div className="absolute bottom-full left-0 right-0 mb-2 mx-3 bg-[#1e1e20] border border-border/50 rounded-xl shadow-2xl overflow-hidden z-20 animate-in fade-in slide-in-from-bottom-2 duration-200">
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
                        idx === selectedSuggestionIndex ? "bg-white/5 text-white" : "text-gray-400 hover:text-gray-200"
                      )}
                    >
                      <div className={cn(
                        "w-6 h-6 rounded flex items-center justify-center border",
                        idx === selectedSuggestionIndex ? "border-white/20 bg-white/5" : "border-transparent"
                      )}>
                        <FileText className="h-3.5 w-3.5" />
                      </div>
                      <span className="font-medium">/{workflow.name}</span>
                      {idx === selectedSuggestionIndex && (
                        <span className="ml-auto text-[10px] text-muted-foreground font-mono bg-white/5 px-1.5 py-0.5 rounded">Enter</span>
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
              placeholder="Message NavReach... (Use @ for variables)"
              className="w-full min-h-[44px] max-h-[150px] px-4 pt-3 pb-3 text-sm bg-transparent border-0 resize-none focus:outline-none placeholder:text-muted-foreground/60 shadow-none focus-visible:ring-0"
            />
            {/* 
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Message NavReach..."
              rows={1}
              className="w-full min-h-[80px] max-h-[150px] px-4 pt-3 pb-3 text-sm bg-transparent border-0 resize-none focus:outline-none placeholder:text-muted-foreground/60"
            /> 
            */}
            <div className="px-3 py-2 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 flex-wrap text-[11px] text-muted-foreground">
                <ModelSelector />
                <MaxStepsSelector />
              </div>
              <div className="flex items-center">
                {isStreaming ? (
                  <button
                    type="button"
                    onClick={async () => {
                      // Tool actions are already saved immediately when they complete
                      // Clear streaming state
                      setIsStreaming(false);
                      setStreamingContent('');
                      streamingContentRef.current = '';
                      setLiveNarration([]);
                      toolHistoryRef.current = [];
                      savedMessagesRef.current.clear();

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
