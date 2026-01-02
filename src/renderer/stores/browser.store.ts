import { create } from 'zustand';

interface BrowserState {
  tabId: string;
  url: string;
  title: string;
  isLoading: boolean;
  webContentsId: number | null;
  isRecording: boolean;
  setUrl: (url: string) => void;
  setTitle: (title: string) => void;
  setIsLoading: (loading: boolean) => void;
  setWebContentsId: (id: number | null) => void;
  setIsRecording: (isRecording: boolean) => void;
  resetBrowserState: () => void;
}

export const useBrowserStore = create<BrowserState>((set) => ({
  tabId: 'main-tab',
  url: '',
  title: 'New Tab',
  isLoading: false,
  webContentsId: null,
  isRecording: false,
  setUrl: (url) => set({ url }),
  setTitle: (title) => set({ title }),
  setIsLoading: (isLoading) => set({ isLoading }),
  setWebContentsId: (webContentsId) => set({ webContentsId }),
  setIsRecording: (isRecording) => set({ isRecording }),
  resetBrowserState: () => set({
    url: '',
    title: 'New Tab',
    isLoading: false
  }),
}));
