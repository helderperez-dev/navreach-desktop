import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import type { Message, Conversation, ModelConfig } from '@shared/types';

interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  selectedModel: ModelConfig | null;
  isStreaming: boolean;
  maxIterations: number;
  infiniteMode: boolean;
  createConversation: () => string;
  setActiveConversation: (id: string | null) => void;
  addMessage: (conversationId: string, message: Omit<Message, 'id' | 'timestamp'>) => void;
  updateMessage: (conversationId: string, messageId: string, content: string) => void;
  deleteConversation: (id: string) => void;
  clearConversations: () => void;
  setSelectedModel: (model: ModelConfig | null) => void;
  setIsStreaming: (streaming: boolean) => void;
  getActiveConversation: () => Conversation | undefined;
  setMaxIterations: (value: number) => void;
  setInfiniteMode: (value: boolean) => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      conversations: [],
      activeConversationId: null,
      selectedModel: null,
      isStreaming: false,
      maxIterations: 10,
      infiniteMode: false,

      createConversation: () => {
        const id = uuidv4();
        const conversation: Conversation = {
          id,
          title: 'New Chat',
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          modelId: get().selectedModel?.id || '',
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
        return state.conversations.find((c) => c.id === state.activeConversationId);
      },

      setMaxIterations: (value) =>
        set({ maxIterations: Math.min(Math.max(Math.round(value) || 1, 1), 50) }),

      setInfiniteMode: (value) => set({ infiniteMode: value }),
    }),
    {
      name: 'navreach-chat-store',
      partialize: (state) => ({
        conversations: state.conversations,
        selectedModel: state.selectedModel,
        maxIterations: state.maxIterations,
        infiniteMode: state.infiniteMode,
      }),
    }
  )
);
