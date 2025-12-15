import { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowUp, Square, Plus, Trash2, History, X, MessageSquare, PanelLeftClose, Loader2, Bot, Globe, MousePointer, Type, ScrollText, FileText, ArrowLeft, ArrowRight, RefreshCw, Clock, Search, Eye, Check, Sparkles, Infinity as InfinityIcon, SlidersHorizontal, Heart, UserPlus, Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useChatStore } from '@/stores/chat.store';
import { useSettingsStore } from '@/stores/settings.store';
import { useAppStore } from '@/stores/app.store';
import { useDebugStore } from '@/stores/debug.store';
import { ChatMessage } from '@/components/chat/ChatMessage';
import { ModelSelector } from '@/components/chat/ModelSelector';
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
  const { toggleChatPanel } = useAppStore();
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

  const pushNarrativeLines = useCallback((raw: string, flush = false) => {
    if (!activeConversationId) return;
    const rawLines = raw.split('\n');
    const narrativeLines: string[] = [];
    for (const line of rawLines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (
        trimmed.startsWith('🔧') ||
        trimmed.startsWith('✅') ||
        trimmed.startsWith('❌') ||
        trimmed.startsWith('🔨')
      ) {
        continue;
      }
      narrativeLines.push(trimmed);
    }
    let commitTarget = narrativeLines.length;
    if (!flush && !raw.endsWith('\n')) {
      commitTarget = Math.max(0, commitTarget - 1);
    }
    if (commitTarget < committedNarrativeLinesRef.current) {
      committedNarrativeLinesRef.current = commitTarget;
    }
    if (commitTarget > committedNarrativeLinesRef.current) {
      const newLines = narrativeLines.slice(committedNarrativeLinesRef.current, commitTarget).map((line) => line.trim()).filter(Boolean);
      newLines.forEach((line) => {
        addMessage(activeConversationId, {
          role: 'assistant',
          content: line,
        });
      });
      committedNarrativeLinesRef.current = commitTarget;
    }
    if (flush) {
      committedNarrativeLinesRef.current = 0;
    }
  }, [activeConversationId, addMessage]);

  useEffect(() => {
    const unsubscribe = window.api.ai.onStreamChunk((data) => {
      if (data.done) {
        setIsStreaming(false);
        // Use ref to get the latest content (avoids stale closure issue)
        const finalContent = streamingContentRef.current;
        pushNarrativeLines(finalContent, true);
        streamingContentRef.current = '';
        setStreamingContent('');
        setLiveNarration([]);
      } else {
        // Log tool usage to debug panel with full details from stream data
        const content = data.content;
        const streamData = data as any; // Extended stream data includes toolCall and toolResult
        
        // Use toolCall data if available (sent from main process)
        if (streamData.toolCall) {
          addLog({ 
            type: 'tool', 
            tool: streamData.toolCall.name, 
            message: 'Executing...', 
            data: streamData.toolCall.args
          });
          pendingToolNamesRef.current.push(streamData.toolCall.name);
        } else if (content.includes('🔧 Using tool:')) {
          const toolMatch = content.match(/🔧 Using tool: (\S+)/);
          if (toolMatch) {
            addLog({ type: 'tool', tool: toolMatch[1], message: 'Executing...' });
            pendingToolNamesRef.current.push(toolMatch[1]);
          }
        }
        
        // Use toolResult data if available (sent from main process)
        if (streamData.toolResult) {
          addLog({ 
            type: 'result', 
            message: streamData.toolResult.message || 'Done',
            data: streamData.toolResult
          });
          const toolName = pendingToolNamesRef.current.shift();
          if (toolName) {
            const entry = {
              name: toolName,
              message: streamData.toolResult.message,
            };
            toolHistoryRef.current.push(entry);
            setLiveNarration((prev) => {
              const formatted = formatToolNarration(entry.name, entry.message);
              return [...prev.slice(-4), formatted];
            });
          }
        } else if (content.includes('✅')) {
          const resultMatch = content.match(/✅ (.+)/);
          if (resultMatch) {
            addLog({ type: 'result', message: resultMatch[1].slice(0, 300) });
            const toolName = pendingToolNamesRef.current.shift();
            if (toolName) {
              const entry = {
                name: toolName,
                message: resultMatch[1].trim(),
              };
              toolHistoryRef.current.push(entry);
              setLiveNarration((prev) => {
                const formatted = formatToolNarration(entry.name, entry.message);
                return [...prev.slice(-4), formatted];
              });
            }
          }
        }
        
        if (content.includes('❌')) {
          const errorMatch = content.match(/❌ (.+)/);
          if (errorMatch) {
            addLog({ type: 'error', message: errorMatch[1].slice(0, 500) });
          }
        }
        
        // Update both ref and state
        streamingContentRef.current += data.content;
        const updatedContent = streamingContentRef.current;
        setStreamingContent(updatedContent);
        pushNarrativeLines(updatedContent, false);
      }
    });

    return () => unsubscribe();
  }, [activeConversationId, addMessage, setIsStreaming, addLog, pushNarrativeLines]);

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
                onClick={() => createConversation()}
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
              <ChatMessage key={message.id} message={message} />
            ))}
            {isStreaming && (
              <div className="px-3 py-3">
                {(() => {
                  // Tool name aliases for completed tools
                  const toolLabels: Record<string, string> = {
                    'browser_navigate': 'Navigated',
                    'browser_click': 'Clicked',
                    'browser_click_at': 'Clicked',
                    'browser_type': 'Typed',
                    'browser_scroll': 'Scrolled',
                    'browser_get_page_content': 'Read page',
                    'browser_get_visible_text': 'Read text',
                    'browser_get_interactive_elements': 'Found elements',
                    'browser_get_page_structure': 'Analyzed structure',
                    'browser_extract': 'Extracted',
                    'browser_go_back': 'Went back',
                    'browser_go_forward': 'Went forward',
                    'browser_reload': 'Reloaded',
                    'browser_wait': 'Waited',
                    'browser_find_elements': 'Found elements',
                    'browser_get_accessibility_tree': 'Analyzed page',
                    'browser_hover': 'Hovered',
                    'browser_snapshot': 'Snapshot',
                    'x_search': 'X search',
                    'x_like': 'X like',
                    'x_reply': 'X reply',
                    'x_post': 'X post',
                    'x_follow': 'X follow',
                  };
                  
                  // Tool icons for current action
                  const toolIcons: Record<string, React.ReactNode> = {
                    'browser_navigate': <Globe className="h-3.5 w-3.5 animate-pulse" />,
                    'browser_click': <MousePointer className="h-3.5 w-3.5 animate-bounce" />,
                    'browser_click_at': <MousePointer className="h-3.5 w-3.5 animate-bounce" />,
                    'browser_type': <Type className="h-3.5 w-3.5 animate-pulse" />,
                    'browser_scroll': <ScrollText className="h-3.5 w-3.5 animate-bounce" />,
                    'browser_get_page_content': <FileText className="h-3.5 w-3.5 animate-pulse" />,
                    'browser_get_visible_text': <FileText className="h-3.5 w-3.5 animate-pulse" />,
                    'browser_get_interactive_elements': <Search className="h-3.5 w-3.5 animate-pulse" />,
                    'browser_get_page_structure': <Eye className="h-3.5 w-3.5 animate-pulse" />,
                    'browser_extract': <FileText className="h-3.5 w-3.5 animate-pulse" />,
                    'browser_go_back': <ArrowLeft className="h-3.5 w-3.5" />,
                    'browser_go_forward': <ArrowRight className="h-3.5 w-3.5" />,
                    'browser_reload': <RefreshCw className="h-3.5 w-3.5 animate-spin" />,
                    'browser_wait': <Clock className="h-3.5 w-3.5 animate-pulse" />,
                    'browser_find_elements': <Search className="h-3.5 w-3.5 animate-pulse" />,
                    'browser_get_accessibility_tree': <Eye className="h-3.5 w-3.5 animate-pulse" />,
                    'browser_hover': <MousePointer className="h-3.5 w-3.5 animate-pulse" />,
                    'browser_snapshot': <Camera className="h-3.5 w-3.5 animate-pulse" />,
                    'x_search': <Search className="h-3.5 w-3.5 animate-pulse" />,
                    'x_like': <Heart className="h-3.5 w-3.5 animate-pulse" />,
                    'x_reply': <MessageSquare className="h-3.5 w-3.5 animate-pulse" />,
                    'x_post': <Type className="h-3.5 w-3.5 animate-pulse" />,
                    'x_follow': <UserPlus className="h-3.5 w-3.5 animate-pulse" />,
                  };
                  
                  // Tool labels for "ing" form (while running)
                  const toolRunningLabels: Record<string, string> = {
                    'browser_navigate': 'Navigating',
                    'browser_click': 'Clicking',
                    'browser_click_at': 'Clicking',
                    'browser_type': 'Typing',
                    'browser_scroll': 'Scrolling',
                    'browser_get_page_content': 'Reading page',
                    'browser_get_visible_text': 'Reading text',
                    'browser_get_interactive_elements': 'Finding elements',
                    'browser_get_page_structure': 'Analyzing structure',
                    'browser_extract': 'Extracting',
                    'browser_go_back': 'Going back',
                    'browser_go_forward': 'Going forward',
                    'browser_reload': 'Reloading',
                    'browser_wait': 'Waiting',
                    'browser_find_elements': 'Finding elements',
                    'browser_get_accessibility_tree': 'Analyzing page',
                    'browser_hover': 'Hovering',
                    'browser_snapshot': 'Capturing snapshot',
                    'x_search': 'Searching on X',
                    'x_like': 'Liking on X',
                    'x_reply': 'Replying on X',
                    'x_post': 'Posting on X',
                    'x_follow': 'Following on X',
                  };
                  
                  // Parse streaming content
                  const lines = streamingContent.split('\n');
                  const allTools: { tool: string; completed: boolean }[] = [];
                  const textLines: string[] = [];
                  let lastTool: string | null = null;
                  
                  for (const line of lines) {
                    if (line.startsWith('🔧 Using tool:')) {
                      const tool = line.replace('🔧 Using tool:', '').trim();
                      allTools.push({ tool, completed: false });
                      lastTool = tool;
                    } else if (line.startsWith('✅') || line.startsWith('❌')) {
                      // Mark the last tool as completed
                      if (allTools.length > 0) {
                        allTools[allTools.length - 1].completed = true;
                      }
                    } else if (line.trim() && !line.startsWith('🔧') && !line.startsWith('✅') && !line.startsWith('❌')) {
                      textLines.push(line);
                    }
                  }
                  
                  const completedTools = allTools.filter(t => t.completed).map(t => t.tool);
                  const currentTool = allTools.length > 0 && !allTools[allTools.length - 1].completed 
                    ? allTools[allTools.length - 1].tool 
                    : null;
                  const textContent = textLines.join('\n').trim();
                  
                  // Static icons for completed tools (no animation)
                  const completedIcons: Record<string, React.ReactNode> = {
                    'browser_navigate': <Globe className="h-3.5 w-3.5 text-emerald-500/80" />,
                    'browser_click': <MousePointer className="h-3.5 w-3.5 text-emerald-500/80" />,
                    'browser_click_at': <MousePointer className="h-3.5 w-3.5 text-emerald-500/80" />,
                    'browser_type': <Type className="h-3.5 w-3.5 text-emerald-500/80" />,
                    'browser_scroll': <ScrollText className="h-3.5 w-3.5 text-emerald-500/80" />,
                    'browser_get_page_content': <FileText className="h-3.5 w-3.5 text-emerald-500/80" />,
                    'browser_extract': <FileText className="h-3.5 w-3.5 text-emerald-500/80" />,
                    'browser_go_back': <ArrowLeft className="h-3.5 w-3.5 text-emerald-500/80" />,
                    'browser_go_forward': <ArrowRight className="h-3.5 w-3.5 text-emerald-500/80" />,
                    'browser_reload': <RefreshCw className="h-3.5 w-3.5 text-emerald-500/80" />,
                    'browser_wait': <Clock className="h-3.5 w-3.5 text-emerald-500/80" />,
                    'browser_find_elements': <Search className="h-3.5 w-3.5 text-emerald-500/80" />,
                    'browser_get_accessibility_tree': <Eye className="h-3.5 w-3.5 text-emerald-500/80" />,
                    'browser_hover': <MousePointer className="h-3.5 w-3.5 text-emerald-500/80" />,
                    'browser_snapshot': <Camera className="h-3.5 w-3.5 text-emerald-500/80" />,
                    'x_search': <Search className="h-3.5 w-3.5 text-emerald-500/80" />,
                    'x_like': <Heart className="h-3.5 w-3.5 text-emerald-500/80" />,
                    'x_reply': <MessageSquare className="h-3.5 w-3.5 text-emerald-500/80" />,
                    'x_post': <Type className="h-3.5 w-3.5 text-emerald-500/80" />,
                    'x_follow': <UserPlus className="h-3.5 w-3.5 text-emerald-500/80" />,
                  };
                  
                  return (
                    <div className="rounded-2xl border border-white/5 bg-[#141417] p-3 space-y-3 shadow-inner shadow-black/30">
                      <div className="rounded-2xl bg-[#1d1d21] border border-white/5 px-4 py-3 text-sm text-gray-100 leading-relaxed space-y-2">
                        <div className="text-muted-foreground text-xs flex items-center gap-2">
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-300" />
                          <span>{currentTool ? 'Executing tool...' : 'Planning next steps'}</span>
                        </div>
                        {textContent && (
                          <div className="max-h-32 overflow-y-auto pr-1 text-[13px] space-y-1 text-white/90">
                            {textContent.split('\n').filter(Boolean).map((line, i) => (
                              <div key={i} className="flex items-start gap-2">
                                <span className="text-xs text-violet-300 mt-[2px]">•</span>
                                <p className="leading-snug">{line}</p>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground/70 pt-1 border-t border-white/5">
                          {currentTool
                            ? `${toolRunningLabels[currentTool] || currentTool}...`
                            : textContent
                            ? 'Narrating...'
                            : completedTools.length > 0
                            ? 'Awaiting next tool...'
                            : 'Preparing first action...'}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-white/5 bg-black/20 p-3 space-y-2">
                        <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.2em] text-muted-foreground/80">
                          <span>Tool actions</span>
                          <span className="text-[10px] text-muted-foreground/60">{completedTools.length} done</span>
                        </div>
                        <div ref={toolActionsRef} className="space-y-1 max-h-56 overflow-y-auto pr-1">
                          {completedTools.map((tool, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground/80">
                              {completedIcons[tool] || <Check className="h-3.5 w-3.5 text-emerald-500/80" />}
                              <span>{toolLabels[tool] || tool}</span>
                            </div>
                          ))}
                          {currentTool && (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              {toolIcons[currentTool] || <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                              <span>{toolRunningLabels[currentTool] || currentTool}...</span>
                            </div>
                          )}
                          {!currentTool && textContent && (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <div className="w-3.5 h-3.5 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
                              <span>Working...</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </ScrollArea>

      <div className="p-3 space-y-3">
        <form onSubmit={handleSubmit}>
          <div className="relative bg-secondary/30 rounded-2xl border border-border/40 focus-within:border-border focus-within:bg-secondary/40 transition-all">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message NavReach..."
              rows={1}
              className="w-full min-h-[120px] max-h-[200px] px-4 py-2.5 pb-14 text-sm bg-transparent rounded-2xl border-0 resize-none focus:outline-none placeholder:text-muted-foreground/60"
            />
            <div className="absolute bottom-3 left-4 right-2 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3 flex-wrap text-[11px] text-muted-foreground">
                <ModelSelector />
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowMaxStepsPopover((prev) => !prev)}
                    className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-[10px] uppercase tracking-wide border border-border/60 text-muted-foreground hover:text-foreground hover:border-border transition-colors"
                  >
                    <SlidersHorizontal className="h-3 w-3" />
                    <span>Max steps · {infiniteMode ? '∞' : maxIterations}</span>
                  </button>
                  {showMaxStepsPopover && (
                    <div
                      ref={stepsPopoverRef}
                      className="absolute z-30 bottom-full mb-2 min-w-[220px] rounded-xl border border-border bg-popover p-4 text-foreground shadow-2xl backdrop-blur-md right-0"
                    >
                      <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-muted-foreground/80 mb-3">
                        <span>Max iterations</span>
                        <button
                          type="button"
                          onClick={() => setShowMaxStepsPopover(false)}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          Close
                        </button>
                      </div>
                      <div className="space-y-3">
                        <input
                          type="range"
                          min={1}
                          max={50}
                          value={maxIterations}
                          onChange={(e) => setMaxIterations(Number(e.target.value))}
                          className="w-full accent-foreground"
                        />
                        <div className="flex items-center justify-between gap-3">
                          <input
                            type="number"
                            min={1}
                            max={50}
                            value={maxIterations}
                            onChange={(e) => setMaxIterations(Number(e.target.value))}
                            className="w-16 h-8 rounded-md border border-border bg-background/60 px-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-border"
                          />
                          <button
                            type="button"
                            onClick={() => setInfiniteMode(!infiniteMode)}
                            className={cn(
                              'w-10 h-10 rounded-full border flex items-center justify-center transition-colors',
                              infiniteMode
                                ? 'border-emerald-400/60 text-emerald-400 bg-emerald-400/10'
                                : 'border-border text-muted-foreground hover:text-foreground'
                            )}
                            title={infiniteMode ? 'Infinite loop enabled' : 'Enable infinite loop mode'}
                          >
                            <InfinityIcon className="h-4 w-4" />
                          </button>
                        </div>
                        <p className="text-xs text-muted-foreground/70 leading-relaxed">
                          {infiniteMode
                            ? 'Infinite loop mode keeps the agent running new cycles until you stop it.'
                            : 'Adjust how many tool iterations the agent can perform before stopping.'}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center">
                {isStreaming ? (
                  <button
                    type="button"
                    onClick={() => setIsStreaming(false)}
                    className="w-8 h-8 rounded-full bg-foreground flex items-center justify-center hover:bg-foreground/90 transition-colors"
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
