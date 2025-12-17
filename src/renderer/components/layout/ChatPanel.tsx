import { v4 as uuidv4 } from 'uuid';
import { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowUp, Square, Plus, Trash2, History, X, MessageSquare, PanelLeftClose, Globe, MousePointer, Type, ScrollText, FileText, ArrowLeft, ArrowRight, RefreshCw, Clock, Search, Eye, Check, Heart, UserPlus, Camera, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useChatStore } from '@/stores/chat.store';
import { useSettingsStore } from '@/stores/settings.store';
import { useAppStore } from '@/stores/app.store';
import { useDebugStore } from '@/stores/debug.store';
import { ChatMessage } from '@/components/chat/ChatMessage';
import { ModelSelector } from '@/components/chat/ModelSelector';
import { MaxStepsSelector } from '@/components/chat/MaxStepsSelector';
import { CircularLoader } from '@/components/ui/CircularLoader';
import { cn } from '@/lib/utils';

const SYSTEM_PROMPT = `You are an autonomous browser automation agent. You analyze the page and decide actions based on what you see.

WORKFLOW:
1. browser_navigate to the URL
2. browser_wait 2000ms for page load
3. browser_snapshot to see all interactive elements
4. Analyze the snapshot and decide what to click/type based on the task
5. After each action, browser_snapshot again to see the result
6. Continue until task is complete

HOW TO USE SNAPSHOT:
- The snapshot lists ALL interactive elements with their selectors and bounding boxes (rect)
- Find elements by their label/name (e.g., "Reply", "Like", "Post", "Search")
- Use the selector shown (e.g., [data-testid="reply"]) with browser_click
- Use index parameter when multiple elements match (0 for first, 1 for second, etc.)
- Check "Modal Open: true/false" to know if a dialog is open

HOW TO DECIDE ACTIONS:
- To click something: find it in snapshot, use its selector with browser_click
- To type text: find the input field in snapshot, use browser_type with its selector
- If element not visible: browser_scroll down, then browser_snapshot again
- If modal opens: look for input fields and submit buttons in the new snapshot

FALLBACK STRATEGIES (When normal click fails or elements are missing):
1. **Coordinate Click (Fast)**:
   - Check the snapshot for the element's 'rect' (x, y, w, h)
   - Calculate center: x = rect.x + rect.w/2, y = rect.y + rect.h/2
   - Call browser_click_coordinates(x, y)

2. **Vision Analysis (Robust)**:
   - Call browser_take_screenshot -> returns a file path
   - Use read_file to view the screenshot image
   - Analyze the image to find the element's visual position (x, y coordinates)
   - Call browser_click_coordinates(x, y) based on your visual analysis

TOOLS:
- browser_navigate: Go to URL
- browser_snapshot: See all page elements (ALWAYS use this to understand the page)
- browser_click: Click element by selector, use index for nth match
- browser_type: Type text into input field
- browser_scroll: Scroll page if elements not visible
- browser_wait: Wait for content to load
- browser_click_coordinates: Click specific x,y position (fallback)
- browser_take_screenshot: Save page image for analysis

Be autonomous. Analyze snapshots. Find elements. Complete the task.`;

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

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;

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

    let conversationId = activeConversationId;
    if (!conversationId) {
      conversationId = createConversation();
    }

    const userMessage = input.trim();
    addMessage(conversationId, {
      role: 'user',
      content: userMessage,
    });

    setInput('');
    setIsStreaming(true);
    setStreamingContent('');

    const conversation = useChatStore.getState().conversations.find((c) => c.id === conversationId);
    const messages = conversation?.messages || [];
    const initialUserPrompt =
      conversation?.messages.find((message) => message.role === 'user')?.content || userMessage;

    try {
      const result = await window.api.ai.chat({
        messages: messages,
        model: model,
        provider: provider,
        systemPrompt: SYSTEM_PROMPT,
        maxIterations,
        infiniteMode,
        initialUserPrompt,
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
  }, [input, isStreaming, selectedModel, modelProviders, activeConversationId, createConversation, addMessage, setIsStreaming]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="relative flex flex-col h-full bg-card">
      <div className="flex items-center justify-between h-12 px-4 border-b border-border">
        <h2 className="text-sm font-semibold">{showHistory ? 'Chat History' : 'AI Assistant'}</h2>
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
            {activeConversation.messages.map((message) => (
              <ChatMessage
                key={message.id}
                message={message}
                onRetry={message.role === 'user' ? (content) => {
                  setInput(content);
                } : undefined}
              />
            ))}
            {isStreaming && (
              <div className="space-y-2 mt-2">
                {/* 1. Narration Text (Streaming) */}
                {streamingContent && (
                  <div className="bg-transparent px-4 py-2 text-sm text-gray-300 leading-relaxed animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <span className="typing-cursor">{streamingContent}</span>
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
                        'x_search': 'Searching X',
                        'x_like': 'Liking Post',
                        'x_reply': 'Replying',
                        'x_post': 'Posting',
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

                              {/* Show args snippet if running (hide for snapshots) */}
                              {isRunning && tool.args && tool.name !== 'browser_snapshot' && (
                                <div className="text-[11px] text-muted-foreground truncate mt-0.5 opacity-70 font-mono">
                                  {JSON.stringify(tool.args).slice(0, 50)}
                                </div>
                              )}

                              {/* Show result snippet if done (hide for snapshots) */}
                              {!isRunning && isSuccess && tool.result && tool.name !== 'browser_snapshot' && (
                                <div className="text-[11px] text-muted-foreground/60 truncate mt-0.5 opacity-70 font-mono">
                                  {JSON.stringify(tool.result).slice(0, 50)}
                                </div>
                              )}

                              {/* Error Message */}
                              {isFailed && tool.result?.error && (
                                <div className="text-[11px] text-red-400/80 truncate mt-0.5">
                                  {tool.result.error}
                                </div>
                              )}
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
          <div className="bg-secondary/30 rounded-2xl border border-border/40 focus-within:border-border focus-within:bg-secondary/40 transition-all overflow-hidden">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message NavReach..."
              rows={1}
              className="w-full min-h-[80px] max-h-[150px] px-4 pt-3 pb-3 text-sm bg-transparent border-0 resize-none focus:outline-none placeholder:text-muted-foreground/60"
            />
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
