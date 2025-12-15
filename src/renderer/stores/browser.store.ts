import { create } from 'zustand';

interface BrowserState {
  tabId: string;
  url: string;
  title: string;
  isLoading: boolean;
  webContentsId: number | null;
  setUrl: (url: string) => void;
  setTitle: (title: string) => void;
  setIsLoading: (loading: boolean) => void;
  setWebContentsId: (id: number | null) => void;
}

export const useBrowserStore = create<BrowserState>((set) => ({
  tabId: 'main-tab',
  url: 'https://www.google.com',
  title: 'New Tab',
  isLoading: false,
  webContentsId: null,
  setUrl: (url) => set({ url }),
  setTitle: (title) => set({ title }),
  setIsLoading: (isLoading) => set({ isLoading }),
  setWebContentsId: (webContentsId) => set({ webContentsId }),
}));
