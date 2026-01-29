import { motion } from 'framer-motion';
import { Compass, Settings, PanelLeft, MessageSquare, Users, Workflow, CreditCard, Zap, BarChart2, Layers } from 'lucide-react';
import { CircularLoader } from '@/components/ui/CircularLoader';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/stores/app.store';
import { useSubscriptionStore } from '@/stores/subscription.store';
import { useBillingStore } from '@/stores/billing.store';
import { useTasksStore } from '@/stores/tasks.store';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { useEffect } from 'react';

import { WorkspaceSelector } from './WorkspaceSelector';

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  view: 'browser' | 'settings' | 'targets' | 'playbooks' | 'analytics';
}
const navItems: NavItem[] = [
  { id: 'browser', label: 'Browser', icon: <Compass className="h-5 w-5" />, view: 'browser' },
  { id: 'playbooks', label: 'Playbooks', icon: <Workflow className="h-5 w-5" />, view: 'playbooks' },
  { id: 'targets', label: 'Targets', icon: <Users className="h-5 w-5" />, view: 'targets' },
  { id: 'analytics', label: 'Analytics', icon: <BarChart2 className="h-5 w-5" />, view: 'analytics' },
];

export function Sidebar() {
  const {
    sidebarCollapsed,
    toggleSidebar,
    activeView,
    setActiveView,
    chatPanelCollapsed,
    toggleChatPanel,
    queueSidebarCollapsed,
    toggleQueueSidebar
  } = useAppStore();
  const { dailyUsage, openUpgradeModal, limits } = useSubscriptionStore();
  const subscription = useBillingStore(state => state.subscription);
  const isLoading = useBillingStore(state => state.isLoading);
  const isPro = subscription?.status === 'active' || subscription?.status === 'trialing';
  const { pendingCount, fetchTasks, subscribeToChanges, unsubscribe } = useTasksStore();

  // Subscribe to realtime task updates
  useEffect(() => {
    fetchTasks();
    subscribeToChanges();
    return () => unsubscribe();
  }, [fetchTasks, subscribeToChanges, unsubscribe]);

  return (
    <TooltipProvider delayDuration={400}>
      <motion.aside
        initial={false}
        animate={{ width: sidebarCollapsed ? 56 : 200 }}
        transition={{ duration: 0.2, ease: 'easeInOut' }}
        className="flex flex-col h-full bg-background border-r border-border/20 transition-colors duration-200"
      >
        <nav className={cn("flex-1 pt-3 pb-1 space-y-1", sidebarCollapsed ? "px-2" : "px-3")}>
          {navItems.map((item) => (
            <Tooltip key={item.id} open={sidebarCollapsed ? undefined : false}>
              <TooltipTrigger asChild>
                <Button
                  variant={activeView === item.view ? 'secondary' : 'ghost'}
                  size={sidebarCollapsed ? "icon" : "default"}
                  className={cn(
                    'w-full justify-start gap-3 transition-all duration-200 h-9 px-2',
                    sidebarCollapsed && 'justify-center w-full h-10',
                    activeView === item.view
                      ? 'bg-muted text-foreground font-medium shadow-none'
                      : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground shadow-none'
                  )}
                  onClick={() => setActiveView(item.view)}
                >
                  <span className="flex-shrink-0">{item.icon}</span>
                  {!sidebarCollapsed && (
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-sm"
                    >
                      {item.label}
                    </motion.span>
                  )}
                </Button>
              </TooltipTrigger>
              {sidebarCollapsed && (
                <TooltipContent side="right" sideOffset={8}>
                  {item.label}
                </TooltipContent>
              )}
            </Tooltip>
          ))}

          {chatPanelCollapsed && activeView === 'browser' && (
            <Tooltip open={sidebarCollapsed ? undefined : false}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size={sidebarCollapsed ? "icon" : "default"}
                  className={cn(
                    'w-full justify-start gap-3 transition-all duration-200 h-9 px-2',
                    sidebarCollapsed && 'justify-center w-full h-10',
                    'text-muted-foreground hover:bg-muted/50 hover:text-foreground shadow-none'
                  )}
                  onClick={toggleChatPanel}
                >
                  <MessageSquare className="h-5 w-5 flex-shrink-0" />
                  {!sidebarCollapsed && (
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-sm"
                    >
                      AI Chat
                    </motion.span>
                  )}
                </Button>
              </TooltipTrigger>
              {sidebarCollapsed && (
                <TooltipContent side="right" sideOffset={8}>
                  Open AI Chat
                </TooltipContent>
              )}
            </Tooltip>
          )}

          <Tooltip open={sidebarCollapsed ? undefined : false}>
            <TooltipTrigger asChild>
              <Button
                variant={!queueSidebarCollapsed ? 'secondary' : 'ghost'}
                size={sidebarCollapsed ? "icon" : "default"}
                className={cn(
                  'w-full justify-start gap-3 transition-all duration-200 h-9 px-2',
                  sidebarCollapsed && 'justify-center w-full h-10',
                  !queueSidebarCollapsed
                    ? 'bg-muted text-foreground font-medium shadow-none'
                    : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground shadow-none'
                )}
                onClick={toggleQueueSidebar}
              >
                <div className="relative flex-shrink-0">
                  <Layers className="h-5 w-5" />
                  {/* Badge over icon only when collapsed */}
                  {sidebarCollapsed && pendingCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-[16px] h-4 px-1 text-[9px] font-bold bg-primary text-primary-foreground rounded-full shadow-sm animate-in zoom-in-50 duration-200">
                      {pendingCount > 99 ? '99+' : pendingCount}
                    </span>
                  )}
                </div>
                {!sidebarCollapsed && (
                  <>
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-sm"
                    >
                      Queue
                    </motion.span>
                    {/* Badge to the right when expanded */}
                    {pendingCount > 0 && (
                      <span className="ml-auto flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[10px] font-bold bg-primary text-primary-foreground rounded-full shadow-sm animate-in zoom-in-50 duration-200">
                        {pendingCount > 99 ? '99+' : pendingCount}
                      </span>
                    )}
                  </>
                )}
              </Button>
            </TooltipTrigger>
            {sidebarCollapsed && (
              <TooltipContent side="right" sideOffset={8}>
                Queue {pendingCount > 0 && `(${pendingCount} pending)`}
              </TooltipContent>
            )}
          </Tooltip>
        </nav>

        {isLoading && !sidebarCollapsed && (
          <div className="flex justify-center mb-4 py-4">
            <CircularLoader className="h-4 w-4 text-primary/60" />
          </div>
        )}

        {!isLoading && !isPro && !sidebarCollapsed && (
          <div className="mx-3 mb-4 p-3 rounded-xl bg-muted/30 border border-border/50">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="h-3.5 w-3.5 text-primary" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-primary">Free Plan</span>
            </div>

            {(() => {
              const remaining = Math.max(0, limits.ai_actions_limit - dailyUsage.aiActions);
              // const percentRemaining = (remaining / limits.ai_actions_limit) * 100;
              const isLow = remaining <= 5;
              const isWarning = remaining <= 20;

              return (
                <div className="space-y-1.5 mb-3">
                  <div className="flex justify-between text-[10px] font-medium transition-colors duration-300">
                    <span className={cn(
                      isLow ? "text-red-500 font-bold animate-pulse" :
                        isWarning ? "text-orange-500" :
                          "text-muted-foreground"
                    )}>
                      {remaining === 0 ? "Daily limit reached" :
                        isLow ? `Only ${remaining} left!` :
                          `${remaining} actions left`}
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-secondary/50 rounded-full overflow-hidden">
                    <motion.div
                      className={cn(
                        "h-full transition-colors duration-500",
                        remaining === 0 ? "bg-red-600" :
                          isLow ? "bg-red-500" :
                            isWarning ? "bg-orange-500" :
                              "bg-primary"
                      )}
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, (dailyUsage.aiActions / limits.ai_actions_limit) * 100)}%` }}
                      transition={{ type: "spring", stiffness: 50, damping: 20 }}
                    />
                  </div>
                </div>
              );
            })()}

            <Button
              variant="default"
              size="sm"
              className="w-full h-7 text-[10px] font-bold bg-primary hover:bg-primary/90 shadow-sm"
              onClick={() => openUpgradeModal()}
            >
              Upgrade to Pro
            </Button>
          </div>
        )}



        <div className={cn("py-2 border-t border-border/20 space-y-1", sidebarCollapsed ? "px-2" : "px-3")}>
          <div className="mb-2">
            <WorkspaceSelector isCollapsed={sidebarCollapsed} />
          </div>

          <Tooltip open={sidebarCollapsed ? undefined : false}>
            <TooltipTrigger asChild>
              <Button
                variant={activeView === 'settings' ? 'secondary' : 'ghost'}
                size={sidebarCollapsed ? "icon" : "default"}
                className={cn(
                  'w-full justify-start gap-3 transition-all duration-200 h-9 px-2',
                  sidebarCollapsed && 'justify-center w-full h-10',
                  activeView === 'settings' ? 'bg-muted text-foreground font-medium shadow-none' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground shadow-none'
                )}
                onClick={() => setActiveView('settings')}
              >
                <Settings className="h-5 w-5 flex-shrink-0" />
                {!sidebarCollapsed && <span className="text-sm">Settings</span>}
              </Button>
            </TooltipTrigger>
            {sidebarCollapsed && (
              <TooltipContent side="right" sideOffset={8}>
                Settings
              </TooltipContent>
            )}
          </Tooltip>

          <Tooltip open={sidebarCollapsed ? undefined : false}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size={sidebarCollapsed ? "icon" : "default"}
                className={cn(
                  "w-full justify-start gap-3 transition-all duration-200 h-9 px-2",
                  sidebarCollapsed && "h-10 w-full justify-center",
                  "text-muted-foreground hover:bg-muted/50 hover:text-foreground shadow-none"
                )}
                onClick={toggleSidebar}
              >
                <PanelLeft className="h-5 w-5 flex-shrink-0 rotate-180" />
                {!sidebarCollapsed && <span className="text-sm">Collapse</span>}
              </Button>
            </TooltipTrigger>
            {sidebarCollapsed && (
              <TooltipContent side="right" sideOffset={8}>
                Expand Sidebar
              </TooltipContent>
            )}
          </Tooltip>
        </div>
      </motion.aside>
    </TooltipProvider >
  );
}
