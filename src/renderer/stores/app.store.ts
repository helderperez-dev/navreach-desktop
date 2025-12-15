import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AppState {
  sidebarCollapsed: boolean;
  chatPanelCollapsed: boolean;
  chatPanelWidth: number;
  theme: 'light' | 'dark' | 'system';
  activeView: 'browser' | 'settings';
  toggleSidebar: () => void;
  toggleChatPanel: () => void;
  setChatPanelWidth: (width: number) => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setActiveView: (view: 'browser' | 'settings') => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      chatPanelCollapsed: false,
      chatPanelWidth: 400,
      theme: 'dark',
      activeView: 'browser',
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      toggleChatPanel: () => set((state) => ({ chatPanelCollapsed: !state.chatPanelCollapsed })),
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
      setActiveView: (activeView) => set({ activeView }),
    }),
    {
      name: 'navreach-app-store',
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        chatPanelCollapsed: state.chatPanelCollapsed,
        chatPanelWidth: state.chatPanelWidth,
        theme: state.theme,
      }),
    }
  )
);
