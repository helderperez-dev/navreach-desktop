import { create } from 'zustand';

export interface DebugLog {
  id: string;
  timestamp: Date;
  type: 'tool' | 'result' | 'error' | 'info';
  tool?: string;
  message: string;
  data?: any;
}

interface DebugStore {
  logs: DebugLog[];
  isDebugPanelOpen: boolean;
  addLog: (log: Omit<DebugLog, 'id' | 'timestamp'>) => void;
  clearLogs: () => void;
  toggleDebugPanel: () => void;
  setDebugPanelOpen: (open: boolean) => void;
}

export const useDebugStore = create<DebugStore>((set) => ({
  logs: [],
  isDebugPanelOpen: false,
  
  addLog: (log) => set((state) => ({
    logs: [...state.logs, {
      ...log,
      id: crypto.randomUUID(),
      timestamp: new Date(),
    }].slice(-100), // Keep last 100 logs
  })),
  
  clearLogs: () => set({ logs: [] }),
  
  toggleDebugPanel: () => set((state) => ({ 
    isDebugPanelOpen: !state.isDebugPanelOpen 
  })),
  
  setDebugPanelOpen: (open) => set({ isDebugPanelOpen: open }),
}));
