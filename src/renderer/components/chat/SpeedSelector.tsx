import { useChatStore } from '@/stores/chat.store';
import { Gauge, Zap, Rabbit, Turtle, Check, ChevronUp } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useState } from 'react';

const SPEED_OPTIONS = [
    { id: 'slow', label: 'Precise', icon: Turtle, description: 'Human-like delays, safest for outreach.' },
    { id: 'normal', label: 'Balanced', icon: Gauge, description: 'Standard execution speed.' },
    { id: 'fast', label: 'Fast', icon: Zap, description: 'High-speed execution for rapid tasks.' },
] as const;

export function SpeedSelector() {
    const { executionSpeed, setSpeed } = useChatStore();
    const [isOpen, setIsOpen] = useState(false);

    const currentOption = SPEED_OPTIONS.find(o => o.id === executionSpeed) || SPEED_OPTIONS[1];
    const Icon = currentOption.icon;

    return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                        "h-7 px-2 text-[11px] shadow-none hover:bg-white/5 transition-all text-muted-foreground/60 hover:text-foreground gap-1.5 rounded-md"
                    )}
                >
                    <ChevronUp className="h-3 w-3 opacity-50" />
                    {currentOption.label}
                </Button>
            </PopoverTrigger>

            <PopoverContent className="w-56 p-1.5 bg-popover backdrop-blur-3xl border-border shadow-2xl" align="start">
                <div className="px-2 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border/50 mb-1">
                    Execution Speed
                </div>
                <div className="space-y-0.5">
                    {SPEED_OPTIONS.map((option) => {
                        const OptIcon = option.icon;
                        const isActive = executionSpeed === option.id;

                        return (
                            <button
                                key={option.id}
                                onClick={() => {
                                    setSpeed(option.id);
                                    setIsOpen(false);
                                }}
                                className={cn(
                                    "w-full flex flex-col items-start px-3 py-2 rounded-md transition-all text-left group",
                                    isActive ? "bg-white/5 text-foreground" : "hover:bg-white/[0.03] text-muted-foreground"
                                )}
                            >
                                <div className="flex items-center justify-between w-full">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[11px] font-medium">{option.label}</span>
                                    </div>
                                    {isActive && <div className="h-1.5 w-1.5 rounded-full bg-primary" />}
                                </div>
                                <p className="text-[9px] text-muted-foreground/60 mt-0.5 leading-tight">
                                    {option.description}
                                </p>
                            </button>
                        );
                    })}
                </div>
            </PopoverContent>
        </Popover>
    );
}
