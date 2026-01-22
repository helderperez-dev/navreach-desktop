import { useRef, useCallback, useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/stores/app.store';
import { useDebugStore } from '@/stores/debug.store';
import { useSubscriptionStore } from '@/stores/subscription.store';
import { supabase } from '@/lib/supabase';
import { Sidebar } from './Sidebar';
import { useBillingStore } from '@/stores/billing.store';
import { ChatPanel } from './ChatPanel';
import { TitleBar } from './TitleBar';
import { WelcomeScreen } from './WelcomeScreen';
import { useWorkspaceStore } from '@/stores/workspace.store';
import { useTargetsStore } from '@/stores/targets.store';
import { BrowserView } from '@/components/browser/BrowserView';
import { SettingsLayout } from '@/components/settings/SettingsLayout';
import { DebugPanel } from '@/components/debug/DebugPanel';
import { TargetListView } from '@/components/targets/TargetListView';
import { PlaybooksView } from '@/components/playbooks/PlaybooksView';
import { UpgradeModal } from '@/components/billing/UpgradeModal';
import { PaymentModal } from '@/components/billing/PaymentModal';
import { EngagementDashboard } from '@/components/analytics/EngagementDashboard';
import { TaskQueueSidebar } from '@/components/tasks/TaskQueueSidebar';

export function MainLayout() {
  const {
    activeView,
    chatPanelCollapsed,
    chatPanelWidth,
    setChatPanelWidth,
    queueSidebarCollapsed,
    queueSidebarWidth,
    setQueueSidebarWidth,
    hasStarted,
    showPlaybookBrowser,
    playbookBrowserMaximized
  } = useAppStore();
  const { isUpgradeModalOpen, closeUpgradeModal, modalTitle, modalDescription } = useSubscriptionStore();
  const {
    isPaymentModalOpen,
    setPaymentModalOpen,
    clientSecret,
    handlePaymentSuccess,
    paymentContext,
    customerId,
    fetchCredits,
    fetchSubscription,
    loadCustomerId,
    loadStripeConfig
  } = useBillingStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const isResizingRef = useRef(false);
  const [isResizing, setIsResizing] = useState(false);
  const isResizingQueueRef = useRef(false);
  const [isResizingQueue, setIsResizingQueue] = useState(false);

  useEffect(() => {
    // Initialize global billing data
    fetchCredits();
    fetchSubscription();
    loadCustomerId();
    loadStripeConfig();

    // Fetch dynamic tier limits
    const initLimits = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      useSubscriptionStore.getState().fetchLimits(session?.access_token);
    };
    initLimits();

    // Global real-time subscription for targets/lists
    const workspaceId = useWorkspaceStore.getState().currentWorkspace?.id;
    if (workspaceId) {
      useTargetsStore.getState().subscribeToChanges();
    }

    return () => {
      useTargetsStore.getState().unsubscribe();
    };
  }, [useWorkspaceStore.getState().currentWorkspace?.id]);

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
      const newWidth = Math.min(Math.max(startWidth + delta, 350), 1000);
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

  const handleQueueResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizingQueueRef.current = true;
    setIsResizingQueue(true);
    const startX = e.clientX;
    const startWidth = queueSidebarWidth;

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;cursor:col-resize;';
    document.body.appendChild(overlay);

    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingQueueRef.current) return;
      const delta = startX - e.clientX; // Inverted because it's on the right
      const newWidth = Math.min(Math.max(startWidth + delta, 300), 600);
      setQueueSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      isResizingQueueRef.current = false;
      setIsResizingQueue(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      overlay.remove();
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [queueSidebarWidth, setQueueSidebarWidth]);


  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background">
      <TitleBar />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar />

        <div className="flex-1 flex overflow-hidden relative">
          <motion.div
            ref={containerRef}
            initial={false}
            animate={{
              width: (!chatPanelCollapsed && activeView === 'browser' && hasStarted) ? chatPanelWidth : 0,
              opacity: (!chatPanelCollapsed && activeView === 'browser' && hasStarted) ? 1 : 0
            }}
            transition={isResizing ? { duration: 0 } : { duration: 0.2, ease: 'easeInOut' }}
            className={cn(
              "h-full flex-shrink-0 overflow-hidden relative border-border transition-colors duration-200 bg-background z-10",
              (!chatPanelCollapsed && activeView === 'browser' && hasStarted) ? "border-r" : "border-r-0"
            )}
            style={{
              display: 'block'
            }}
          >
            <div className="h-full overflow-hidden w-full" style={{ width: chatPanelWidth }}>
              <ChatPanel />
            </div>
          </motion.div>

          {!chatPanelCollapsed && activeView === 'browser' && hasStarted && (
            <div
              onMouseDown={handleMouseDown}
              className="group relative w-px h-full cursor-col-resize flex-shrink-0 z-20 bg-border/20"
            >
              <div className="absolute inset-y-0 -left-2 -right-2 cursor-col-resize z-30" />
              <div className="absolute inset-y-0 -left-[0.5px] -right-[0.5px] bg-primary/0 group-hover:bg-primary/50 transition-colors z-20" />
            </div>
          )}

          <main className="flex-1 overflow-hidden relative">
            {/* Persistent Browser View - NEVER REMOUNTED for maximum stability */}
            <div
              className={cn(
                "absolute transition-opacity duration-300 ease-in-out bg-[#0A0A0B]",
                // Normal Browser View
                activeView === 'browser' && "inset-0 z-0",
                // Playbook Split View (Right Side)
                activeView === 'playbooks' && showPlaybookBrowser
                  ? (playbookBrowserMaximized
                    ? "inset-0 z-20 border-none"
                    : "top-0 bottom-0 right-0 w-1/2 border-l border-border z-0")
                  : (activeView !== 'browser' && "inset-0 opacity-0 pointer-events-none z-[-1]")
              )}
              style={{ willChange: 'opacity' }}
            >
              <BrowserView />
            </div>

            <AnimatePresence mode="wait">
              {/* Welcome Screen Overlay */}
              {!hasStarted && activeView === 'browser' && (
                <motion.div
                  key="welcome"
                  className="absolute inset-0 z-10 bg-background"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <WelcomeScreen onSubmit={() => { }} />
                </motion.div>
              )}

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
                  className={cn(
                    "h-full bg-background relative z-10 transition-all duration-300",
                    showPlaybookBrowser ? "w-1/2" : "w-full"
                  )}
                >
                  <PlaybooksView />
                </motion.div>
              )}
              {activeView === 'analytics' && (
                <motion.div
                  key="analytics"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="h-full bg-background relative z-10"
                >
                  <EngagementDashboard />
                </motion.div>
              )}
            </AnimatePresence>
          </main>

          <DebugPanel />
        </div>
      </div>

      {/* Task Queue Sidebar Overlay */}
      <AnimatePresence>
        {!queueSidebarCollapsed && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[100]"
              onClick={() => useAppStore.getState().toggleQueueSidebar()}
            />
            {/* Panel */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 bottom-0 border-l border-border/20 bg-background shadow-2xl z-[101] flex flex-col overflow-hidden"
              style={{ width: queueSidebarWidth }}
            >
              <TaskQueueSidebar />

              {/* Resizer for Queue Sidebar */}
              <div
                onMouseDown={handleQueueResizeMouseDown}
                className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize group z-10"
              >
                <div className="absolute inset-y-0 -left-1 -right-1 cursor-col-resize" />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>


      <UpgradeModal
        isOpen={isUpgradeModalOpen}
        onClose={closeUpgradeModal}
        title={modalTitle}
        description={modalDescription}
      />
      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        clientSecret={clientSecret}
        onSuccess={handlePaymentSuccess}
        amount={paymentContext.amount}
        description={paymentContext.description}
        promoCode={paymentContext.promoCode}
        formattedSubtotal={paymentContext.formattedSubtotal}
        formattedDiscount={paymentContext.formattedDiscount}
        customerId={customerId || undefined}
      />
    </div>
  );
}
