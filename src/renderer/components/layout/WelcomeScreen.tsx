import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUp, MessageSquare, History, X, Trash2 } from 'lucide-react';
import { useAppStore } from '@/stores/app.store';
import { useChatStore } from '@/stores/chat.store';
import { useSettingsStore } from '@/stores/settings.store';
import { useAuthStore } from '@/stores/auth.store';
import { supabase } from '@/lib/supabase';
import { ModelSelector } from '@/components/chat/ModelSelector';
import { MaxStepsSelector } from '@/components/chat/MaxStepsSelector';
import { SpeedSelector } from '@/components/chat/SpeedSelector';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MentionInput } from '@/components/ui/mention-input';
import { cn } from '@/lib/utils';
import { useTargetsStore } from '@/stores/targets.store';
import { playbookService } from '@/services/playbookService';
import { useWorkspaceStore } from '@/stores/workspace.store';
import type { Conversation, KnowledgeBase, KnowledgeContent } from '@shared/types';
import { knowledgeService } from '@/services/knowledgeService';
import reavionLogo from '@assets/reavion-white-welcome.png';
import reavionLogoBlack from '@assets/reavion-black-welcome.png';



// --- SMART SUGGESTIONS LOGIC ---

type Suggestion = { label: string; prompt: string };

// --- UTILITIES ---
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);
  return debouncedValue;
}

// -------------------------------


const SYSTEM_PROMPT = `Analyze user request and orchestrate the necessary tools or playbooks. Be concise in your narration and strictly follow the provided playbook graph if applicable.`;

interface WelcomeScreenProps {
  onSubmit: () => void;
}

const STATIC_STARTERS: Suggestion[] = [];

export function WelcomeScreen({ onSubmit }: WelcomeScreenProps) {
  const [input, setInput] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { setHasStarted, theme } = useAppStore();
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>(
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemTheme(e.matches ? 'dark' : 'light');
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  const isActualDark = theme === 'dark' || (theme === 'system' && systemTheme === 'dark');
  const {
    conversations,
    setActiveConversation,
    deleteConversation,
    selectedModel,
    createConversation,
    addMessage,
    setIsStreaming,
    setAgentStartTime,
    maxIterations,
    agentRunLimit,
    infiniteMode,
    executionSpeed,
  } = useChatStore();
  const { modelProviders, mcpServers, apiTools } = useSettingsStore();
  const { lists, fetchLists, segments, fetchSegments } = useTargetsStore();
  const { currentWorkspace } = useWorkspaceStore();
  const { session } = useAuthStore();
  const [playbooks, setPlaybooks] = useState<any[]>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [knowledgeItems, setKnowledgeItems] = useState<KnowledgeContent[]>([]);

  const filteredConversations = useMemo(() => {
    return conversations.filter((conv: Conversation) =>
      !conv.id.startsWith('playbook-') &&
      conv.workspaceId === currentWorkspace?.id
    );
  }, [conversations, currentWorkspace?.id]);

  useEffect(() => {
    playbookService.getPlaybooks(currentWorkspace?.id).then(setPlaybooks);
    if (session) {
      fetchLists();
      fetchSegments();

      // Fetch Knowledge
      const fetchKnowledge = async () => {
        try {
          const kbs = await knowledgeService.getKnowledgeBases();
          setKnowledgeBases(kbs);
          const allContent = await Promise.all(kbs.map(kb => knowledgeService.getKBContent(kb.id)));
          setKnowledgeItems(allContent.flat());
        } catch (err) {
          console.error('[WelcomeScreen] Failed to fetch knowledge:', err);
        }
      };
      fetchKnowledge();
    }
  }, [currentWorkspace?.id, session]);

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

    if (segments.length > 0) {
      groups.push({
        nodeName: 'Segments',
        variables: segments.map(s => ({
          label: s.name,
          value: `{{segments.${s.id}}}`,
          example: s.description || 'Custom segmentation filter'
        }))
      });
    }

    return groups;
  }, [playbooks, lists, segments, mcpServers, apiTools, knowledgeBases, knowledgeItems]);

  const debouncedInput = useDebounce(input, 400);
  const [suggestions, setSuggestions] = useState<Suggestion[]>(STATIC_STARTERS);
  const [isSuggesting, setIsSuggesting] = useState(false);

  /* 
    Optimization: Track last fetched input to avoid redundant calls 
    when dependencies like modelProviders update but input hasn't changed.
  */
  const lastFetchedInput = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    const fetchSuggestions = async () => {
      if (!active) return;

      // If input is empty, clear suggestions and don't fetch "fallbacks"
      if (!debouncedInput || debouncedInput.trim().length === 0) {
        setSuggestions([]);
        lastFetchedInput.current = debouncedInput;
        if (active) setIsSuggesting(false);
        return;
      }

      // Prevent redundant fetches for the same input
      if (lastFetchedInput.current === debouncedInput) {
        return;
      }

      setIsSuggesting(true);
      try {
        // ALWAYS use the Reavion (system-default) model for suggestions
        // This ensures fast, free, and consistent results regardless of user's chat selection.
        const provider = {
          id: 'system-default',
          type: 'system-default',
          name: 'Reavion System',
          enabled: true,
          models: []
        };

        const model = {
          id: 'system-default',
          name: 'Reavion Default',
          providerId: 'system-default',
          enabled: true
        };

        // Mark this input as fetched/fetching to prevent race/dupes
        lastFetchedInput.current = debouncedInput;

        const result = await (window.api.ai as any).suggest({
          messages: [],
          model: model,
          provider: provider,
          initialUserPrompt: debouncedInput
        });

        if (active && result.success && result.suggestions && result.suggestions.length > 0) {
          setSuggestions(result.suggestions);
        }
      } catch (error) {
        if (active) console.error('Failed to fetch suggestions:', error);
      } finally {
        if (active) setIsSuggesting(false);
      }
    };

    fetchSuggestions();
    return () => { active = false; };
  }, [debouncedInput]);
  // ... (lines in between) ...




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
    setActiveConversation(conversationId);
    const userMessage = input.trim();

    addMessage(conversationId, {
      role: 'user',
      content: userMessage,
    });

    setInput('');
    setIsStreaming(true);
    setAgentStartTime(Date.now());
    setHasStarted(true);
    onSubmit();

    // Use session from hook (guaranteed to be synced with App state)
    let token = session?.access_token;
    let refreshToken = session?.refresh_token;

    // Final fallback
    if (!token) {
      console.warn('[WelcomeScreen] Token missing in store, trying direct fetch...');
      const { data } = await supabase.auth.getSession();
      token = data.session?.access_token;
      refreshToken = data.session?.refresh_token;
    }

    let speed: 'slow' | 'normal' | 'fast' = executionSpeed;
    // Auto-boost for Reavion Nexus if not explicitly on 'slow'
    if (model.providerId === 'system-default' && speed === 'normal') {
      speed = 'fast';
    }

    try {
      const result = await window.api.ai.chat({
        messages: [{ role: 'user', content: userMessage, id: crypto.randomUUID(), timestamp: Date.now() }],
        model: model,
        provider: provider,
        systemPrompt: SYSTEM_PROMPT,
        maxIterations,
        infiniteMode,
        agentRunLimit,
        initialUserPrompt: userMessage,
        accessToken: token,
        refreshToken: refreshToken,
        playbooks: playbooks,
        targetLists: lists,
        segments: segments,
        speed: speed,
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
      {filteredConversations.length > 0 && (
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
                {filteredConversations.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground text-sm">No conversations yet</p>
                ) : (
                  filteredConversations
                    .map((conv) => (
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


        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="mb-12"
        >
          <img
            src={isActualDark ? reavionLogo : reavionLogoBlack}
            alt="Reavion"
            className="h-8 w-auto select-none opacity-80"
            draggable={false}
          />
        </motion.div>

        <motion.div
          className="w-full"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
        >
          <form onSubmit={handleSubmit}>
            <div className="relative group/input bg-secondary/30 rounded-2xl border border-border/40 focus-within:border-border transition-all overflow-hidden backdrop-blur-sm">
              <MentionInput
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="How can Reavion help you today?"
                variableGroups={getGlobalVariables()}
                autoFocus
                className="w-full min-h-[44px] max-h-[150px] px-4 pt-3 pb-2 text-sm bg-transparent border-0 resize-none focus:outline-none placeholder:text-muted-foreground/60 shadow-none focus-visible:ring-0"
              />
              <div className="px-3 py-1.5 flex items-center justify-between gap-3 border-t border-border/5">
                <div className="flex items-center gap-0.5">
                  <ModelSelector />
                  <MaxStepsSelector />
                  <SpeedSelector />
                </div>
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center transition-all",
                    input.trim()
                      ? "bg-white text-black hover:bg-white/90"
                      : "bg-white/5 text-white/20 cursor-not-allowed"
                  )}
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
              </div>
            </div>
          </form>
        </motion.div>

        <AnimatePresence mode="wait">
          {suggestions.length > 0 && (
            <motion.div
              key={suggestions.map(s => s.label).join(',')}
              className="mt-6 w-full flex justify-center"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
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
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
