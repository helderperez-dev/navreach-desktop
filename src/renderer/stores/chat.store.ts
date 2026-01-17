import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import type { Message, Conversation, ModelConfig } from '@shared/types';
import { useWorkspaceStore } from './workspace.store';

interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  selectedModel: ModelConfig | null;
  isStreaming: boolean;
  maxIterations: number;
  infiniteMode: boolean;
  agentStartTime: number | null;
  agentRunLimit: number | null; // in minutes
  currentSessionTime: number; // in seconds
  pendingPrompt: string | { content: string, isIsolated?: boolean, playbookId?: string } | null;
  createConversation: () => string;
  setActiveConversation: (id: string | null) => void;
  addMessage: (conversationId: string, message: Omit<Message, 'id' | 'timestamp'>) => void;
  updateMessage: (conversationId: string, messageId: string, content: string) => void;
  mergeMessage: (conversationId: string, message: Partial<Message> & { role: 'assistant' | 'system' }) => void;
  deleteConversation: (id: string) => void;
  clearConversations: () => void;
  setSelectedModel: (model: ModelConfig | null) => void;
  setIsStreaming: (streaming: boolean) => void;
  getActiveConversation: () => Conversation | undefined;
  setMaxIterations: (value: number) => void;
  setInfiniteMode: (value: boolean) => void;
  setAgentStartTime: (time: number | null) => void;
  setAgentRunLimit: (min: number | null) => void;
  setCurrentSessionTime: (sec: number) => void;
  setPendingPrompt: (prompt: string | { content: string, isIsolated?: boolean, playbookId?: string } | null) => void;
  assignWorkspaces: (workspaceId: string) => void;
  reset: () => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      conversations: [],
      activeConversationId: null,
      selectedModel: null,
      isStreaming: false,
      maxIterations: 30,
      infiniteMode: false,
      agentStartTime: null,
      agentRunLimit: null,
      currentSessionTime: 0,
      pendingPrompt: null,

      createConversation: () => {
        const id = uuidv4();
        // Fallback to local storage if store state isn't immediately available during hydration/boot
        const workspaceId = useWorkspaceStore.getState().currentWorkspace?.id ||
          localStorage.getItem('reavion_current_workspace_id') ||
          undefined;

        const conversation: Conversation = {
          id,
          title: 'New Chat',
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          modelId: get().selectedModel?.id || '',
          workspaceId: workspaceId,
        };
        set((state) => ({
          conversations: [conversation, ...state.conversations],
          activeConversationId: id,
        }));
        return id;
      },

      setActiveConversation: (id) => set({ activeConversationId: id }),

      addMessage: (conversationId, message) => {
        const newMessage: Message = {
          ...message,
          id: uuidv4(),
          timestamp: Date.now(),
        };
        set((state) => ({
          conversations: state.conversations.map((conv) =>
            conv.id === conversationId
              ? {
                ...conv,
                messages: [...conv.messages, newMessage],
                updatedAt: Date.now(),
                title: conv.messages.length === 0 && message.role === 'user'
                  ? message.content.slice(0, 50) + (message.content.length > 50 ? '...' : '')
                  : conv.title,
              }
              : conv
          ),
        }));
      },

      updateMessage: (conversationId, messageId, content) => {
        set((state) => ({
          conversations: state.conversations.map((conv) =>
            conv.id === conversationId
              ? {
                ...conv,
                messages: conv.messages.map((msg) =>
                  msg.id === messageId ? { ...msg, content } : msg
                ),
                updatedAt: Date.now(),
              }
              : conv
          ),
        }));
      },
      mergeMessage: (conversationId, messageUpdate) => {
        set((state) => ({
          conversations: state.conversations.map((conv) => {
            if (conv.id !== conversationId) return conv;

            const messages = [...conv.messages];
            const lastMsg = messages[messages.length - 1];

            // Only merge if roles match and it's assistant/system
            if (lastMsg && lastMsg.role === messageUpdate.role) {
              const newContent = messageUpdate.content !== undefined ? messageUpdate.content : '';
              const existingContent = lastMsg.content || '';

              // Robust De-duplication Logic
              const normalizedNew = newContent.trim();
              const normalizedExisting = existingContent.trim();

              // 1. Skip empty updates if they aren't tool calls
              const isTextUpdate = newContent.length > 0;
              const hasTools = (messageUpdate.toolCalls?.length || 0) > 0 || (messageUpdate.toolResults?.length || 0) > 0;

              let shouldAppend = true;

              if (isTextUpdate && lastMsg.role === 'assistant') {
                // A. Exact suffix check (fastest)
                if (existingContent.endsWith(newContent)) {
                  shouldAppend = false;
                }
                // B. Trimmed suffix check (ignores trailing whitespace differences)
                else if (normalizedNew.length > 5 && normalizedExisting.endsWith(normalizedNew)) {
                  shouldAppend = false;
                }
                // C. Large block repetition check (prevents paragraph duplication)
                // Only apply if the new content is substantial (>20 chars) to avoid blocking common words
                else if (normalizedNew.length > 20 && normalizedExisting.includes(normalizedNew)) {
                  shouldAppend = false;
                }
              }

              // Calculate separator (add space if joining words, but not if starts/ends with whitespace)
              const needsSpace = shouldAppend && isTextUpdate &&
                existingContent.length > 0 &&
                !existingContent.match(/\s$/) &&
                !newContent.match(/^\s/);

              const finalContent = shouldAppend
                ? (existingContent + (needsSpace ? ' ' : '') + newContent)
                : existingContent;

              const updatedLastMsg = {
                ...lastMsg,
                content: finalContent,
                toolCalls: [
                  ...(lastMsg.toolCalls || []),
                  ...(messageUpdate.toolCalls || [])
                ],
                toolResults: [
                  ...(lastMsg.toolResults || []),
                  ...(messageUpdate.toolResults || [])
                ]
              };
              messages[messages.length - 1] = updatedLastMsg;
              return { ...conv, messages, updatedAt: Date.now() };
            }

            // Otherwise, add as new (same as addMessage)
            const newMessage: Message = {
              role: messageUpdate.role,
              content: messageUpdate.content || '',
              toolCalls: messageUpdate.toolCalls || [],
              toolResults: messageUpdate.toolResults || [],
              id: uuidv4(),
              timestamp: Date.now(),
            };
            return {
              ...conv,
              messages: [...conv.messages, newMessage],
              updatedAt: Date.now()
            };
          })
        }));
      },

      deleteConversation: (id) => {
        set((state) => {
          const newConversations = state.conversations.filter((c) => c.id !== id);
          return {
            conversations: newConversations,
            activeConversationId:
              state.activeConversationId === id
                ? newConversations[0]?.id || null
                : state.activeConversationId,
          };
        });
      },

      clearConversations: () => set({ conversations: [], activeConversationId: null }),

      setSelectedModel: (model) => set({ selectedModel: model }),

      setIsStreaming: (streaming) => set({ isStreaming: streaming }),

      getActiveConversation: () => {
        const state = get();
        const workspaceId = useWorkspaceStore.getState().currentWorkspace?.id;
        return state.conversations.find((c) =>
          c.id === state.activeConversationId &&
          (!c.workspaceId || c.workspaceId === workspaceId)
        );
      },

      setMaxIterations: (value) =>
        set({ maxIterations: Math.min(Math.max(Math.round(value) || 1, 1), 100) }),

      setInfiniteMode: (value) => set({ infiniteMode: value }),

      setAgentStartTime: (time) => set({ agentStartTime: time }),
      setAgentRunLimit: (min) => set({ agentRunLimit: min }),
      setCurrentSessionTime: (sec) => set({ currentSessionTime: sec }),
      setPendingPrompt: (prompt) => set({ pendingPrompt: prompt }),
      assignWorkspaces: (workspaceId) => {
        set((state) => ({
          conversations: state.conversations.map(conv =>
            !conv.workspaceId ? { ...conv, workspaceId } : conv
          )
        }));
      },
      reset: () => {
        set({
          conversations: [],
          activeConversationId: null,
          currentSessionTime: 0,
          pendingPrompt: null,
          isStreaming: false,
          agentStartTime: null,
          // We intentionally DO NOT reset maxIterations, infiniteMode, selectedModel
          // as these are more like persisted "client preferences" than "user data"
        });
      }
    }),
    {
      name: 'reavion-chat-store',
      partialize: (state) => ({
        conversations: state.conversations,
        selectedModel: state.selectedModel,
        maxIterations: state.maxIterations,
        infiniteMode: state.infiniteMode,
        agentRunLimit: state.agentRunLimit,
      }),
    }
  )
);
