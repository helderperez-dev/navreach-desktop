import { motion } from 'framer-motion';
import { Compass, Settings, PanelLeft, MessageSquare, Users, Workflow, CreditCard, Zap } from 'lucide-react';
import { CircularLoader } from '@/components/ui/CircularLoader';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/stores/app.store';
import { useSubscriptionStore } from '@/stores/subscription.store';
import { useBillingStore } from '@/stores/billing.store';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  view: 'browser' | 'settings' | 'targets' | 'playbooks';
}
const navItems: NavItem[] = [
  { id: 'browser', label: 'Browser', icon: <Compass className="h-5 w-5" />, view: 'browser' },
  { id: 'targets', label: 'Targets', icon: <Users className="h-5 w-5" />, view: 'targets' },
  { id: 'playbooks', label: 'Playbooks', icon: <Workflow className="h-5 w-5" />, view: 'playbooks' },
  { id: 'settings', label: 'Settings', icon: <Settings className="h-5 w-5" />, view: 'settings' },
];

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar, activeView, setActiveView, chatPanelCollapsed, toggleChatPanel } = useAppStore();
  const { dailyUsage, openUpgradeModal, limits } = useSubscriptionStore();
  const subscription = useBillingStore(state => state.subscription);
  const isLoading = useBillingStore(state => state.isLoading);
  const isPro = subscription?.status === 'active' || subscription?.status === 'trialing';

  return (
    <TooltipProvider delayDuration={0}>
      <motion.aside
        initial={false}
        animate={{ width: sidebarCollapsed ? 56 : 200 }}
        transition={{ duration: 0.2, ease: 'easeInOut' }}
        className="flex flex-col h-full bg-sidebar border-r border-border/30 transition-colors duration-200"
      >
        <nav className={cn("flex-1 py-2 space-y-1", sidebarCollapsed ? "px-2" : "px-3")}>
          {navItems.map((item) => (
            <Tooltip key={item.id}>
              <TooltipTrigger asChild>
                <Button
                  variant={activeView === item.view ? 'secondary' : 'ghost'}
                  size={sidebarCollapsed ? "icon" : "default"}
                  className={cn(
                    'w-full justify-start gap-3 transition-all duration-200',
                    sidebarCollapsed && 'justify-center h-10 w-full',
                    activeView === item.view ? 'bg-muted text-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                  )}
                  onClick={() => setActiveView(item.view)}
                >
                  <span className="flex-shrink-0">{item.icon}</span>
                  {!sidebarCollapsed && (
                    <motion.span
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: 'auto' }}
                      exit={{ opacity: 0, width: 0 }}
                      className="text-sm font-medium"
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
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size={sidebarCollapsed ? "icon" : "default"}
                  className={cn(
                    'w-full justify-start gap-3 hover:bg-muted/50 transition-all duration-200',
                    sidebarCollapsed && 'justify-center h-10 w-full'
                  )}
                  onClick={toggleChatPanel}
                >
                  <MessageSquare className="h-5 w-5 flex-shrink-0" />
                  {!sidebarCollapsed && (
                    <motion.span
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: 'auto' }}
                      exit={{ opacity: 0, width: 0 }}
                      className="text-sm font-medium"
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
        </nav>

        {isLoading && !sidebarCollapsed && (
          <div className="flex justify-center mb-4 py-4">
            <CircularLoader className="h-4 w-4 text-primary/60" />
          </div>
        )}

        {!isLoading && !isPro && !sidebarCollapsed && (
          <div className="mx-3 mb-4 p-3 rounded-xl bg-gradient-to-br from-primary/10 to-blue-500/10 border border-primary/20">
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



        <div className={cn("py-2 border-t border-border/30", sidebarCollapsed ? "px-2" : "px-3")}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size={sidebarCollapsed ? "icon" : "default"}
                className={cn(
                  "w-full justify-start gap-3",
                  sidebarCollapsed && "h-10 w-full justify-center"
                )}
                onClick={toggleSidebar}
              >
                <PanelLeft className="h-5 w-5 flex-shrink-0" />
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
