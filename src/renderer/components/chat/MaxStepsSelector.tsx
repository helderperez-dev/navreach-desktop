import { useChatStore } from '@/stores/chat.store';
import { Clock, Plus, Minus, ChevronLeft, ChevronRight, Infinity, List } from 'lucide-react';
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
    setInfiniteMode(true);
    setAgentRunLimit(null);
    setIsOpen(false);
  };

  const currentLabel = isTimerMode
    ? `Timer (${agentRunLimit}m)`
    : (infiniteMode ? '∞ Infinite' : 'Normal');

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
            "h-7 px-2 text-[11px] hover:bg-white/5 transition-all text-muted-foreground hover:text-foreground gap-1.5",
            isTimerMode && "text-blue-400 bg-blue-500/5 hover:bg-blue-500/10 border border-blue-500/10"
          )}
        >
          {isTimerMode ? <Clock className="h-3 w-3" /> : (infiniteMode ? <Infinity className="h-3 w-3" /> : <List className="h-3 w-3" />)}
          Max steps · {currentLabel}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-56 p-2 bg-[#0A0A0A]/95 backdrop-blur-3xl border-white/10 shadow-2xl overflow-hidden" align="start">
        <div className={cn(
          "transition-all duration-300 transform",
          view === 'timer' ? "-translate-x-full opacity-0 pointer-events-none absolute" : "translate-x-0 opacity-100"
        )}>
          <div className="px-2 py-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest border-b border-white/5 mb-1">
            Session Limit
          </div>

          <div className="space-y-0.5">
            <button
              onClick={() => handleSelectSteps(30)}
              className={cn(
                "w-full flex items-center justify-between px-3 py-2.5 rounded-md text-[11px] transition-colors",
                !infiniteMode && !agentRunLimit ? "bg-primary/20 text-primary-foreground font-bold" : "hover:bg-white/5 text-muted-foreground"
              )}
            >
              <div className="flex items-center gap-2">
                <List className="h-3.5 w-3.5" />
                <span>Normal (Auto)</span>
              </div>
              {!infiniteMode && !agentRunLimit && <div className="h-1 w-1 rounded-full bg-primary" />}
            </button>

            <button
              onClick={handleSelectInfinite}
              className={cn(
                "w-full flex items-center justify-between px-3 py-2.5 rounded-md text-[11px] transition-colors",
                infiniteMode && !agentRunLimit ? "bg-purple-500/20 text-white font-bold" : "hover:bg-white/5 text-muted-foreground"
              )}
            >
              <div className="flex items-center gap-2">
                <Infinity className="h-3.5 w-3.5 text-purple-400" />
                <span>Infinite Mode</span>
              </div>
              {infiniteMode && !agentRunLimit && <div className="h-1 w-1 rounded-full bg-purple-400" />}
            </button>

            <button
              onClick={() => {
                setInfiniteMode(true);
                if (!agentRunLimit) setAgentRunLimit(60);
                setView('timer');
              }}
              className={cn(
                "w-full flex items-center justify-between px-3 py-2.5 rounded-md text-[11px] transition-colors group",
                isTimerMode ? "bg-blue-500/20 text-white font-bold" : "hover:bg-white/5 text-muted-foreground"
              )}
            >
              <div className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-blue-400" />
                <span>Fixed Timer</span>
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
          <div className="flex items-center gap-3 p-2 border-b border-white/5 mb-3">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 rounded-full hover:bg-white/10"
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
                className="h-10 w-10 rounded-full border border-white/5 bg-white/5 hover:bg-blue-500/20 hover:text-blue-400 transition-all active:scale-90"
                onClick={() => setAgentRunLimit(Math.max(1, (agentRunLimit || 60) - 5))}
              >
                <Minus className="h-4 w-4" />
              </Button>

              <div className="flex-1 flex flex-col items-center justify-center">
                <div className="text-3xl font-mono font-black text-white tabular-nums">
                  {agentRunLimit}
                </div>
                <div className="text-[9px] font-bold text-muted-foreground uppercase mt-[-4px]">Minutes</div>
              </div>

              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-full border border-white/5 bg-white/5 hover:bg-blue-500/20 hover:text-blue-400 transition-all active:scale-90"
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
                      ? "h-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]"
                      : "h-0.5 bg-white/10"
                  )}
                />
              ))}
            </div>

            <Button
              className="w-full h-8 text-[11px] bg-blue-600 hover:bg-blue-500 text-white font-bold"
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
