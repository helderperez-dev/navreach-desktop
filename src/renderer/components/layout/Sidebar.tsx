import { motion } from 'framer-motion';
import { Compass, Settings, PanelLeft, MessageSquare, Users, Workflow } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/stores/app.store';
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
    </TooltipProvider>
  );
}
