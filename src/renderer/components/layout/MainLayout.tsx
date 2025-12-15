import { useRef, useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/stores/app.store';
import { useDebugStore } from '@/stores/debug.store';
import { Sidebar } from './Sidebar';
import { ChatPanel } from './ChatPanel';
import { TitleBar } from './TitleBar';
import { BrowserView } from '@/components/browser/BrowserView';
import { SettingsLayout } from '@/components/settings/SettingsLayout';
import { DebugPanel } from '@/components/debug/DebugPanel';

export function MainLayout() {
  const { activeView, chatPanelCollapsed, chatPanelWidth, setChatPanelWidth } = useAppStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const isResizingRef = useRef(false);
  const [isResizing, setIsResizing] = useState(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    
    isResizingRef.current = true;
    setIsResizing(true);
    const startX = e.clientX;
    const startWidth = chatPanelWidth;
    
    // Apply styles immediately
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.body.style.pointerEvents = 'none';
    
    // Create overlay to capture all mouse events
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;cursor:col-resize;';
    document.body.appendChild(overlay);

    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return;
      const delta = e.clientX - startX;
      const newWidth = Math.min(Math.max(startWidth + delta, 280), 600);
      setChatPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      isResizingRef.current = false;
      setIsResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.body.style.pointerEvents = '';
      overlay.remove();
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [chatPanelWidth, setChatPanelWidth]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background">
      <TitleBar />
      
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        
        <AnimatePresence initial={false}>
          {!chatPanelCollapsed && activeView === 'browser' && (
            <motion.div 
              ref={containerRef}
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: chatPanelWidth, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={isResizing ? { duration: 0 } : { duration: 0.2, ease: 'easeInOut' }}
              className="h-full flex-shrink-0 overflow-hidden"
            >
              <div className="h-full overflow-hidden">
                <ChatPanel />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        
        {!chatPanelCollapsed && activeView === 'browser' && (
          <div
            onMouseDown={handleMouseDown}
            className="w-px h-full bg-border hover:bg-muted-foreground/50 cursor-col-resize transition-colors flex-shrink-0"
          />
        )}
        
        <main className="flex-1 overflow-hidden">
          <AnimatePresence mode="wait">
            {activeView === 'browser' && (
              <motion.div
                key="browser"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="h-full"
              >
                <BrowserView />
              </motion.div>
            )}
            {activeView === 'settings' && (
              <motion.div
                key="settings"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="h-full"
              >
                <SettingsLayout />
              </motion.div>
            )}
          </AnimatePresence>
        </main>
        
        <DebugPanel />
      </div>
    </div>
  );
}
