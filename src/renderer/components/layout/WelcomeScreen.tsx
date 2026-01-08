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
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MentionInput } from '@/components/ui/mention-input';
import { useTargetsStore } from '@/stores/targets.store';
import { playbookService } from '@/services/playbookService';
import { useWorkspaceStore } from '@/stores/workspace.store';
import type { Conversation } from '@shared/types';

import reavionLogoWhite from '@assets/reavion-white-welcome.png';
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

const STATIC_STARTERS: Suggestion[] = [
  { label: 'X Growth', prompt: 'Search X for people talking about "SaaS marketing", scan their recent posts, and engage with helpful replies.' },
  { label: 'Lead Sourcing', prompt: 'Search LinkedIn for Founders in the AI niche, scrape their profile details and save them to a new list.' },
  { label: 'Competitor Intel', prompt: 'Go to a competitor website, extract their pricing and main features, and summarize how I can beat them.' }
];

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
    setAgentStartTime,
    maxIterations,
    agentRunLimit,
    infiniteMode,
  } = useChatStore();
  const { modelProviders, mcpServers, apiTools } = useSettingsStore();
  const { lists, fetchLists } = useTargetsStore();
  const { currentWorkspace } = useWorkspaceStore();
  const { session } = useAuthStore();
  const [playbooks, setPlaybooks] = useState<any[]>([]);

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
    }
  }, [currentWorkspace?.id, session]);

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

  const debouncedInput = useDebounce(input, 1000);
  const [suggestions, setSuggestions] = useState<Suggestion[]>(STATIC_STARTERS);
  const [isSuggesting, setIsSuggesting] = useState(false);

  useEffect(() => {
    let active = true;
    const fetchSuggestions = async () => {
      if (!active) return;
      setIsSuggesting(true);
      try {
        // Resolve current model
        const enabledProviders = modelProviders.filter((p) => p.enabled);
        let provider = selectedModel
          ? modelProviders.find((p) => p.id === selectedModel.providerId)
          : enabledProviders[0];

        let model = selectedModel;
        if (!provider && enabledProviders.length > 0) {
          provider = enabledProviders[0];
          model = provider.models[0] ? { ...provider.models[0], providerId: provider.id } : null;
        }

        if (!provider || !model) {
          // No model config, keep defaults or clear
          return;
        }

        // Optimization: Don't fetch if input is just whitespace (but allowed if empty for discovery)
        if (debouncedInput.length > 0 && !debouncedInput.trim()) {
          if (active) setIsSuggesting(false);
          return;
        }

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
  }, [debouncedInput, modelProviders, selectedModel]);
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
          className="mb-12"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 0.8, y: 0 }}
          transition={{ delay: 0.1, duration: 0.4 }}
        >
          <img
            src={reavionLogoWhite}
            alt="Reavion"
            className="h-8 opacity-80 hidden dark:block"
          />
          <img
            src={reavionLogoBlack}
            alt="Reavion"
            className="h-8 opacity-80 block dark:hidden"
          />
        </motion.div>

        <motion.div
          className="w-full"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
        >
          <form onSubmit={handleSubmit}>
            <div className="bg-secondary/30 rounded-2xl border border-border/40 focus-within:border-border transition-all">
              <MentionInput
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="How can Reavion help you today?"
                variableGroups={getGlobalVariables()}
                autoFocus
                className="w-full min-h-[50px] max-h-[150px] px-4 pt-4 pb-3 text-sm bg-transparent border-0 resize-none focus:outline-none placeholder:text-muted-foreground/60 shadow-none focus-visible:ring-0"
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
            <div className={`flex flex-wrap gap-2 justify-center transition-opacity duration-500 ${isSuggesting ? 'opacity-50' : 'opacity-100'}`}>
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
