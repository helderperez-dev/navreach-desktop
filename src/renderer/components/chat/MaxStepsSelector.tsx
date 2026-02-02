import { useChatStore } from '@/stores/chat.store';
import { useSubscriptionStore } from '@/stores/subscription.store';
import { Clock, Plus, Minus, ChevronLeft, ChevronRight, Infinity, List, Lock, ChevronUp } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useState } from 'react';

const STEP_OPTIONS = [5, 10, 15, 20, 25, 30, 40, 50];

export function MaxStepsSelector() {
  const {
    maxIterations,
    setMaxIterations,
    infiniteMode,
    setInfiniteMode,
    agentRunLimit,
    setAgentRunLimit
  } = useChatStore();

  const { isPro, openUpgradeModal } = useSubscriptionStore();
  const pro = isPro();

  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<'main' | 'timer'>('main');

  const isTimerMode = infiniteMode && !!agentRunLimit;

  const handleSelectSteps = (steps: number) => {
    setInfiniteMode(false);
    setAgentRunLimit(null);
    setMaxIterations(steps);
    setIsOpen(false);
  };

  const handleSelectInfinite = () => {
    if (!pro) {
      openUpgradeModal(
        "Infinite Mode is a Pro Feature",
        "Upgrade to Pro to let the agent run without any step limits and handle complex, long-running research tasks autonomously."
      );
      setIsOpen(false);
      return;
    }
    setInfiniteMode(true);
    setAgentRunLimit(null);
    setIsOpen(false);
  };

  const currentLabel = isTimerMode
    ? `${agentRunLimit}m`
    : (infiniteMode ? 'Infinite' : 'Normal');

  return (
    <Popover open={isOpen} onOpenChange={(open) => {
      setIsOpen(open);
      if (!open) setTimeout(() => setView('main'), 200);
    }}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "h-7 px-2 text-[11px] shadow-none hover:bg-white/5 transition-all text-muted-foreground/60 hover:text-foreground gap-1.5 rounded-md",
            isTimerMode && "bg-white/5"
          )}
        >
          <ChevronUp className="h-3 w-3 opacity-50" />
          {currentLabel}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-56 p-2 bg-popover backdrop-blur-3xl border-border shadow-2xl overflow-hidden" align="start">
        <div className={cn(
          "transition-all duration-300 transform",
          view === 'timer' ? "-translate-x-full opacity-0 pointer-events-none absolute" : "translate-x-0 opacity-100"
        )}>
          <div className="px-2 py-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border/50 mb-1">
            Session Limit
          </div>

          <div className="space-y-0.5">
            <button
              onClick={() => handleSelectSteps(30)}
              className={cn(
                "w-full flex items-center justify-between px-3 py-2.5 rounded-md text-[11px] transition-colors",
                !infiniteMode && !agentRunLimit ? "bg-secondary text-foreground" : "hover:bg-accent/50 text-muted-foreground"
              )}
            >
              <div className="flex items-center gap-2">
                <span>Normal</span>
              </div>
              {!infiniteMode && !agentRunLimit && <div className="h-1.5 w-1.5 rounded-full bg-primary" />}
            </button>

            <button
              onClick={handleSelectInfinite}
              className={cn(
                "w-full flex items-center justify-between px-3 py-2.5 rounded-md text-[11px] transition-colors",
                infiniteMode && !agentRunLimit ? "bg-secondary text-foreground" : "hover:bg-accent/50 text-muted-foreground"
              )}
            >
              <div className="flex items-center gap-2">
                <span>Infinite Mode</span>
                {!pro && <Lock className="h-2.5 w-2.5 opacity-40 ml-1" />}
              </div>
              {infiniteMode && !agentRunLimit && <div className="h-1.5 w-1.5 rounded-full bg-primary" />}
            </button>

            <button
              onClick={() => {
                if (!pro) {
                  openUpgradeModal(
                    "Fixed Timer is a Pro Feature",
                    "Upgrade to Pro to set precise execution windows for your agents, perfect for time-boxed automation and monitoring."
                  );
                  setIsOpen(false);
                  return;
                }
                setInfiniteMode(true);
                if (!agentRunLimit) setAgentRunLimit(60);
                setView('timer');
              }}
              className={cn(
                "w-full flex items-center justify-between px-3 py-2.5 rounded-md text-[11px] transition-colors group",
                isTimerMode ? "bg-secondary text-foreground" : "hover:bg-accent/50 text-muted-foreground"
              )}
            >
              <div className="flex items-center gap-2">
                <span>Fixed Timer</span>
                {!pro && <Lock className="h-2.5 w-2.5 opacity-40 ml-1" />}
              </div>
              <div className="flex items-center gap-2">
                {isTimerMode && <span className="text-[10px] opacity-70">{agentRunLimit}m</span>}
                <ChevronRight className="h-3 w-3 opacity-30 group-hover:opacity-100" />
              </div>
            </button>
          </div>
        </div>

        {/* Timer Config View */}
        <div className={cn(
          "transition-all duration-300 transform inset-0",
          view === 'main' ? "translate-x-full opacity-0 pointer-events-none absolute" : "translate-x-0 opacity-100 relative"
        )}>
          <div className="flex items-center gap-3 p-2 border-b border-border/50 mb-3">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 rounded-full hover:bg-accent"
              onClick={() => setView('main')}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Timer Settings</span>
          </div>

          <div className="px-2 py-4 space-y-6">
            <div className="flex items-center justify-between gap-4">
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-full border border-border bg-accent/20 hover:bg-primary/10 hover:text-primary transition-all active:scale-90"
                onClick={() => setAgentRunLimit(Math.max(1, (agentRunLimit || 60) - 5))}
              >
                <Minus className="h-4 w-4" />
              </Button>

              <div className="flex-1 flex flex-col items-center justify-center">
                <div className="text-3xl font-mono font-black text-foreground tabular-nums">
                  {agentRunLimit}
                </div>
                <div className="text-[9px] font-bold text-muted-foreground uppercase mt-[-4px]">Minutes</div>
              </div>

              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-full border border-border bg-accent/20 hover:bg-primary/10 hover:text-primary transition-all active:scale-90"
                onClick={() => setAgentRunLimit((agentRunLimit || 0) + 5)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex gap-1.5 h-1 items-end justify-center px-2">
              {[...Array(12)].map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex-1 rounded-full transition-all duration-500",
                    (i + 1) * 10 <= (agentRunLimit || 0)
                      ? "h-full bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.3)]"
                      : "h-0.5 bg-muted"
                  )}
                />
              ))}
            </div>

            <Button
              className="w-full h-8 text-[11px] bg-primary hover:bg-primary/90 text-primary-foreground font-bold"
              onClick={() => setIsOpen(false)}
            >
              Done
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
