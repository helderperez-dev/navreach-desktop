import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useChatStore } from './chat.store';
import { useBrowserStore } from './browser.store';

interface AppState {
  sidebarCollapsed: boolean;
  chatPanelCollapsed: boolean;
  chatPanelWidth: number;
  theme: 'light' | 'dark' | 'system';
  activeView: 'browser' | 'settings' | 'targets' | 'playbooks';
  hasStarted: boolean;
  showPlaybookBrowser: boolean;
  playbookBrowserMaximized: boolean;
  toggleSidebar: () => void;
  toggleChatPanel: () => void;
  togglePlaybookBrowser: () => void;
  togglePlaybookBrowserMaximized: () => void;
  setShowPlaybookBrowser: (show: boolean) => void;
  setChatPanelWidth: (width: number) => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setActiveView: (view: 'browser' | 'settings' | 'targets' | 'playbooks') => void | Promise<void>;
  setHasStarted: (started: boolean) => void;
  reset: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      sidebarCollapsed: false,
      chatPanelCollapsed: false,
      chatPanelWidth: 400,
      theme: 'dark',
      activeView: 'browser',
      hasStarted: false,
      showPlaybookBrowser: false,
      playbookBrowserMaximized: false,
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      toggleChatPanel: () => set((state) => ({ chatPanelCollapsed: !state.chatPanelCollapsed })),
      togglePlaybookBrowser: () => set((state) => ({ showPlaybookBrowser: !state.showPlaybookBrowser, playbookBrowserMaximized: false })),
      togglePlaybookBrowserMaximized: () => set((state) => ({ playbookBrowserMaximized: !state.playbookBrowserMaximized })),
      setShowPlaybookBrowser: (show) => set({ showPlaybookBrowser: show, playbookBrowserMaximized: false }),
      setChatPanelWidth: (width) => set({ chatPanelWidth: width }),
      setTheme: (theme) => {
        const root = document.documentElement;
        if (theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
          root.classList.add('dark');
        } else {
          root.classList.remove('dark');
        }
        set({ theme });
      },
      setActiveView: async (view) => {
        const currentView = get().activeView;
        if (view === currentView) return;

        // Force stop ANY agent running when switching views (Isolation)
        const { isStreaming, setIsStreaming } = useChatStore.getState();
        if (isStreaming) {
          console.log(`[AppStore] View switch detected (${currentView} -> ${view}). Stopping active agent session.`);
          await window.api.ai.stop();
          setIsStreaming(false);
          useChatStore.getState().setPendingPrompt(null);

          // Cleanup browser if we were in playbooks
          if (currentView === 'playbooks') {
            set({ showPlaybookBrowser: false });
            useBrowserStore.getState().resetBrowserState();
          }
        }

        // 2. If entering browser, reset to Welcome screen (new chat context)
        if (view === 'browser') {
          useChatStore.getState().setActiveConversation(null);
          set({ hasStarted: false });
        }

        set({ activeView: view });
      },
      setHasStarted: (hasStarted) => set((state) => ({
        hasStarted,
        // Force chat panel to open if we are starting a session
        chatPanelCollapsed: hasStarted ? false : state.chatPanelCollapsed
      })),
      reset: () => set({
        hasStarted: false,
        activeView: 'browser',
        showPlaybookBrowser: false,
        playbookBrowserMaximized: false
      })
    }),
    {
      name: 'reavion-app-store',
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        chatPanelCollapsed: state.chatPanelCollapsed,
        chatPanelWidth: state.chatPanelWidth,
        theme: state.theme,
      }),
    }
  )
);
