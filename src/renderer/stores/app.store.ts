import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useChatStore } from './chat.store';
import { useBrowserStore } from './browser.store';

interface AppState {
  sidebarCollapsed: boolean;
  chatPanelCollapsed: boolean;
  chatPanelWidth: number;
  theme: 'light' | 'dark' | 'system';
  activeView: 'browser' | 'settings' | 'targets' | 'playbooks' | 'analytics';
  hasStarted: boolean;
  showPlaybookBrowser: boolean;
  playbookBrowserMaximized: boolean;
  showOnboarding: boolean;
  targetSidebarCollapsed: boolean;
  queueSidebarCollapsed: boolean;
  queueSidebarWidth: number;
  toggleSidebar: () => void;
  toggleTargetSidebar: () => void;
  toggleChatPanel: () => void;
  togglePlaybookBrowser: () => void;
  togglePlaybookBrowserMaximized: () => void;
  toggleQueueSidebar: () => void;
  setShowPlaybookBrowser: (show: boolean) => void;
  setChatPanelWidth: (width: number) => void;
  setQueueSidebarWidth: (width: number) => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setActiveView: (view: 'browser' | 'settings' | 'targets' | 'playbooks' | 'analytics') => void | Promise<void>;
  setHasStarted: (started: boolean) => void;
  setShowOnboarding: (show: boolean) => void;
  reset: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      sidebarCollapsed: false,
      chatPanelCollapsed: false,
      chatPanelWidth: 400,
      theme: 'system',
      activeView: 'browser',
      hasStarted: false,
      showPlaybookBrowser: false,
      playbookBrowserMaximized: false,
      showOnboarding: false,
      targetSidebarCollapsed: false,
      queueSidebarCollapsed: true,
      queueSidebarWidth: 350,
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      toggleTargetSidebar: () => set((state) => ({ targetSidebarCollapsed: !state.targetSidebarCollapsed })),
      toggleChatPanel: () => set((state) => ({ chatPanelCollapsed: !state.chatPanelCollapsed })),
      togglePlaybookBrowser: () => set((state) => ({ showPlaybookBrowser: !state.showPlaybookBrowser, playbookBrowserMaximized: false })),
      togglePlaybookBrowserMaximized: () => set((state) => ({ playbookBrowserMaximized: !state.playbookBrowserMaximized })),
      setShowPlaybookBrowser: (show) => set({ showPlaybookBrowser: show, playbookBrowserMaximized: false }),
      setChatPanelWidth: (width) => set({ chatPanelWidth: width }),
      setQueueSidebarWidth: (width) => set({ queueSidebarWidth: width }),
      toggleQueueSidebar: () => set((state) => ({ queueSidebarCollapsed: !state.queueSidebarCollapsed })),
      setTheme: (theme) => {
        const root = document.documentElement;
        const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

        if (isDark) {
          root.classList.add('dark');
          root.style.colorScheme = 'dark';
        } else {
          root.classList.remove('dark');
          root.style.colorScheme = 'light';
        }
        set({ theme });
      },
      setActiveView: async (view) => {
        const currentView = get().activeView;
        if (view === currentView) return;



        set({ activeView: view });
      },
      setHasStarted: (hasStarted) => set((state) => ({
        hasStarted,
        // Force chat panel to open if we are starting a session
        chatPanelCollapsed: hasStarted ? false : state.chatPanelCollapsed
      })),
      setShowOnboarding: (show) => set({ showOnboarding: show }),
      reset: () => set({
        hasStarted: false,
        activeView: 'browser',
        showPlaybookBrowser: false,
        playbookBrowserMaximized: false,
        showOnboarding: false
      })
    }),
    {
      name: 'reavion-app-store',
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        chatPanelCollapsed: state.chatPanelCollapsed,
        chatPanelWidth: state.chatPanelWidth,
        theme: state.theme,
        targetSidebarCollapsed: state.targetSidebarCollapsed,
        queueSidebarCollapsed: state.queueSidebarCollapsed,
        queueSidebarWidth: state.queueSidebarWidth,
      }),
    }
  )
);
