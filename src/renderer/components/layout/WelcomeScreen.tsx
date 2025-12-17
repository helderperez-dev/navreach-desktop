import { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUp, MessageSquare, History, X, Trash2 } from 'lucide-react';
import { useAppStore } from '@/stores/app.store';
import { useChatStore } from '@/stores/chat.store';
import { useSettingsStore } from '@/stores/settings.store';
import { ModelSelector } from '@/components/chat/ModelSelector';
import { MaxStepsSelector } from '@/components/chat/MaxStepsSelector';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import navreachLogo from '@assets/navreach-white-welcome.png';

const DEFAULT_SUGGESTIONS = [
  { label: 'Engage on X', prompt: 'Go to X and engage with posts about AI and startups - like and reply thoughtfully to 5 relevant posts' },
  { label: 'Find leads on LinkedIn', prompt: 'Search LinkedIn for founders in the SaaS space and send connection requests with personalized notes' },
  { label: 'Reply to comments', prompt: 'Go to my latest post on X and reply to all comments with thoughtful responses' },
  { label: 'Research competitors', prompt: 'Research my top 3 competitors on social media and summarize their content strategy' },
  { label: 'Schedule content', prompt: 'Help me draft and schedule 5 engaging posts for X about my product' },
  { label: 'Grow followers', prompt: 'Find and follow 20 relevant accounts in my niche on X who are likely to follow back' },
];

const CONTEXTUAL_SUGGESTIONS: Record<string, { label: string; prompt: string }[]> = {
  'x': [
    { label: 'Search X', prompt: 'Search X for posts about ' },
    { label: 'Post on X', prompt: 'Create and post a tweet about ' },
    { label: 'Like posts', prompt: 'Like the top 10 posts about ' },
    { label: 'Reply to posts', prompt: 'Reply thoughtfully to posts about ' },
  ],
  'twitter': [
    { label: 'Search X', prompt: 'Search X for posts about ' },
    { label: 'Post on X', prompt: 'Create and post a tweet about ' },
  ],
  'linkedin': [
    { label: 'Search LinkedIn', prompt: 'Search LinkedIn for ' },
    { label: 'Connect with people', prompt: 'Send connection requests to ' },
  ],
  'engage': [
    { label: 'Engage on X', prompt: 'Go to X and engage with posts about ' },
    { label: 'Comment on posts', prompt: 'Leave thoughtful comments on posts about ' },
  ],
  'follow': [
    { label: 'Follow accounts', prompt: 'Follow relevant accounts that post about ' },
    { label: 'Find influencers', prompt: 'Find and follow top influencers in ' },
  ],
  'post': [
    { label: 'Draft posts', prompt: 'Help me draft engaging posts about ' },
    { label: 'Schedule content', prompt: 'Create a content schedule for posts about ' },
  ],
};

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

interface WelcomeScreenProps {
  onSubmit: () => void;
}

export function WelcomeScreen({ onSubmit }: WelcomeScreenProps) {
  const [input, setInput] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { setHasStarted } = useAppStore();
  const {
    conversations,
    setActiveConversation,
    deleteConversation,
    selectedModel,
    createConversation,
    addMessage,
    setIsStreaming,
    maxIterations,
    infiniteMode,
  } = useChatStore();
  const { modelProviders } = useSettingsStore();

  const suggestions = useMemo(() => {
    if (!input.trim()) return DEFAULT_SUGGESTIONS.slice(0, 4);
    
    const lowerInput = input.toLowerCase();
    for (const [keyword, contextSuggestions] of Object.entries(CONTEXTUAL_SUGGESTIONS)) {
      if (lowerInput.includes(keyword)) {
        return contextSuggestions;
      }
    }
    return [];
  }, [input]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = '44px';
      if (input) {
        const scrollHeight = textareaRef.current.scrollHeight;
        textareaRef.current.style.height = `${Math.min(scrollHeight, 200)}px`;
      }
    }
  }, [input]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

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

    const conversationId = createConversation();
    const userMessage = input.trim();

    addMessage(conversationId, {
      role: 'user',
      content: userMessage,
    });

    setInput('');
    setIsStreaming(true);
    setHasStarted(true);
    onSubmit();

    try {
      const result = await window.api.ai.chat({
        messages: [{ role: 'user', content: userMessage, id: crypto.randomUUID(), timestamp: Date.now() }],
        model: model,
        provider: provider,
        systemPrompt: SYSTEM_PROMPT,
        maxIterations,
        infiniteMode,
        initialUserPrompt: userMessage,
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
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleSuggestionClick = (prompt: string) => {
    setInput(prompt);
    textareaRef.current?.focus();
  };

  return (
    <motion.div
      className="relative flex flex-col items-center justify-center h-full w-full bg-background"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.3 }}
    >
      {conversations.length > 0 && (
        <motion.div
          className="absolute top-4 right-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full"
            onClick={() => setShowHistory(true)}
            title="Chat history"
          >
            <History className="h-4 w-4" />
          </Button>
        </motion.div>
      )}

      <AnimatePresence>
        {showHistory && (
          <motion.div
            className="absolute top-0 right-0 h-full w-80 bg-card border-l border-border z-20 flex flex-col overflow-hidden"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          >
            <div className="flex items-center justify-between h-14 px-4 border-b border-border">
              <h3 className="text-sm font-medium">History</h3>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setShowHistory(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1">
                {conversations.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground text-sm">No conversations yet</p>
                ) : (
                  conversations.map((conv) => (
                    <div
                      key={conv.id}
                      className="group flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-secondary/50 transition-colors cursor-pointer"
                      onClick={() => {
                        setActiveConversation(conv.id);
                        setHasStarted(true);
                        setShowHistory(false);
                      }}
                    >
                      <MessageSquare className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0 max-w-[200px]">
                        <p className="text-sm truncate">{conv.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {conv.messages.length} messages · {new Date(conv.updatedAt).toLocaleDateString()}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive flex-shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteConversation(conv.id);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-col items-center w-full max-w-2xl px-6">
        <motion.img
          src={navreachLogo}
          alt="NavReach"
          className="h-12 mb-12 opacity-80"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 0.8, y: 0 }}
          transition={{ delay: 0.1, duration: 0.4 }}
        />

        <motion.div
          className="w-full"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
        >
          <form onSubmit={handleSubmit}>
            <div className="bg-secondary/30 rounded-2xl border border-border/40 focus-within:border-border focus-within:bg-secondary/40 transition-all overflow-hidden">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="What would you like me to do?"
                rows={1}
                autoFocus
                className="w-full min-h-[80px] max-h-[150px] px-4 pt-4 pb-3 text-sm bg-transparent border-0 resize-none focus:outline-none placeholder:text-muted-foreground/60"
              />
              <div className="px-3 py-2 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 flex-wrap text-[11px] text-muted-foreground">
                  <ModelSelector />
                  <MaxStepsSelector />
                </div>
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className="h-8 w-8 rounded-full bg-foreground text-background flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
              </div>
            </div>
          </form>
        </motion.div>

        {suggestions.length > 0 && (
          <motion.div
            className="mt-6 w-full"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.4 }}
          >
            <div className="flex flex-wrap gap-2 justify-center">
              {suggestions.map((suggestion, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSuggestionClick(suggestion.prompt)}
                  className="px-3 py-1.5 rounded-full text-xs text-muted-foreground bg-secondary/30 border border-border/30 hover:bg-secondary/50 hover:border-border/50 hover:text-foreground transition-colors"
                >
                  {suggestion.label}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
