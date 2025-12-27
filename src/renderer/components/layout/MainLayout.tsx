import { useRef, useCallback, useState } from 'react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/stores/app.store';
import { useDebugStore } from '@/stores/debug.store';
import { Sidebar } from './Sidebar';
import { ChatPanel } from './ChatPanel';
import { TitleBar } from './TitleBar';
import { WelcomeScreen } from './WelcomeScreen';
import { BrowserView } from '@/components/browser/BrowserView';
import { SettingsLayout } from '@/components/settings/SettingsLayout';
import { DebugPanel } from '@/components/debug/DebugPanel';
import { TargetListView } from '@/components/targets/TargetListView';
import { PlaybooksView } from '@/components/playbooks/PlaybooksView';

export function MainLayout() {
  const { activeView, chatPanelCollapsed, chatPanelWidth, setChatPanelWidth, hasStarted } = useAppStore();
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

    // Create overlay to capture all mouse events
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;cursor:col-resize;';
    document.body.appendChild(overlay);

    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return;
      const delta = e.clientX - startX;
      // Use the actual sidebar width if possible, but 400 is the default in store
      // The logic here should simply be: new width = startWidth + delta
      const newWidth = Math.min(Math.max(startWidth + delta, 500), 700);
      setChatPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      isResizingRef.current = false;
      setIsResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
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

        <AnimatePresence mode="wait">
          {!hasStarted && activeView === 'browser' ? (
            <motion.div
              key="welcome"
              className="flex-1 overflow-hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <WelcomeScreen onSubmit={() => { }} />
            </motion.div>
          ) : (
            <motion.div
              key="main"
              className="flex flex-1 overflow-hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <AnimatePresence initial={false}>
                {!chatPanelCollapsed && activeView === 'browser' && (
                  <motion.div
                    ref={containerRef}
                    initial={{ width: 0, opacity: 0 }}
                    animate={{ width: chatPanelWidth, opacity: 1 }}
                    exit={{ width: 0, opacity: 0 }}
                    transition={isResizing ? { duration: 0 } : { duration: 0.2, ease: 'easeInOut' }}
                    className="h-full flex-shrink-0 overflow-hidden relative"
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
                  className="group relative w-px h-full cursor-col-resize flex-shrink-0 z-20 bg-border"
                >
                  {/* Expanded invisible hit area for easier grabbing */}
                  <div className="absolute inset-y-0 -left-1.5 -right-1.5 cursor-col-resize z-30" />
                  {/* Visual hover indicator */}
                  <div className="absolute inset-y-0 -left-[0.5px] -right-[0.5px] bg-primary/0 group-hover:bg-primary/50 transition-colors z-20" />
                </div>
              )}

              <main className="flex-1 overflow-hidden relative">
                {/* Persistent Browser View - Keeps webview alive in background */}
                <div
                  className={cn(
                    "absolute inset-0 w-full h-full bg-background",
                    activeView === 'browser' ? "z-0" : "opacity-0 pointer-events-none z-[-1]"
                  )}
                >
                  <BrowserView />
                </div>

                <AnimatePresence mode="wait">
                  {activeView === 'settings' && (
                    <motion.div
                      key="settings"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="h-full bg-background relative z-10"
                    >
                      <SettingsLayout />
                    </motion.div>
                  )}
                  {activeView === 'targets' && (
                    <motion.div
                      key="targets"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="h-full bg-background relative z-10"
                    >
                      <TargetListView />
                    </motion.div>
                  )}
                  {activeView === 'playbooks' && (
                    <motion.div
                      key="playbooks"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="h-full bg-background relative z-10"
                    >
                      <PlaybooksView />
                    </motion.div>
                  )}
                </AnimatePresence>
              </main>

              <DebugPanel />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
