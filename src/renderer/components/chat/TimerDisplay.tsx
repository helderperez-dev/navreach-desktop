import { useEffect, useState } from 'react';
import { useChatStore } from '@/stores/chat.store';
import { Clock, AlertCircle, Timer } from 'lucide-react';
import { cn } from '@/lib/utils';

export function TimerDisplay() {
    const {
        isStreaming,
        setIsStreaming,
        agentStartTime,
        setAgentStartTime,
        agentRunLimit,
        currentSessionTime,
        setCurrentSessionTime
    } = useChatStore();

    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (isStreaming && agentStartTime) {
            setIsVisible(true);
            interval = setInterval(() => {
                const elapsed = Math.floor((Date.now() - agentStartTime) / 1000);
                setCurrentSessionTime(elapsed);

                // Check for limit
                if (agentRunLimit && elapsed >= agentRunLimit * 60) {
                    window.api.ai.stop();
                }
            }, 1000);
        } else {
            // Delay hiding to allow for fade out
            const timeout = setTimeout(() => setIsVisible(false), 300);
            setCurrentSessionTime(0);
            return () => clearTimeout(timeout);
        }
        return () => clearInterval(interval);
    }, [isStreaming, agentStartTime, agentRunLimit, setCurrentSessionTime]);

    if (!isVisible) return null;

    // If we're streaming but missing a start time (e.g. race condition or forgotten set), 
    // we use a fallback to avoid returning null while the agent is clearly active.
    const effectiveStartTime = agentStartTime || Date.now();

    const limitInSeconds = agentRunLimit ? agentRunLimit * 60 : 0;
    const remainingSeconds = Math.max(0, limitInSeconds - currentSessionTime);

    const formatTime = (seconds: number) => {
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        return `${hrs > 0 ? `${hrs}:` : ''}${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const isNearingLimit = agentRunLimit && remainingSeconds < 60; // Less than 1 minute left
    const progress = agentRunLimit ? (currentSessionTime / limitInSeconds) * 100 : 0;

    return (
        <div className={cn(
            "flex items-center gap-2.5 transition-all duration-700 animate-in fade-in slide-in-from-left-4",
            isNearingLimit ? "text-red-400" : "text-white/60"
        )}>
            {/* Minimalist Status Indicator - Simple Dot Only */}
            <div className="relative flex items-center justify-center">
                {isStreaming ? (
                    <div className={cn(
                        "h-1.5 w-1.5 rounded-full animate-pulse",
                        isNearingLimit ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]" : "bg-white/50 shadow-[0_0_6px_rgba(255,255,255,0.3)]"
                    )} />
                ) : (
                    <Clock className="h-3 w-3 opacity-40 text-muted-foreground" />
                )}
            </div>

            {/* Time Typography - Elegant Sans-Serif */}
            <div className="flex items-center gap-1.5 leading-none">
                <span className={cn(
                    "text-[15px] font-medium tabular-nums tracking-normal",
                    !isNearingLimit ? "text-white/70" : "text-red-400"
                )}>
                    {agentRunLimit ? formatTime(remainingSeconds) : formatTime(Math.floor((Date.now() - effectiveStartTime) / 1000))}
                </span>

                {agentRunLimit && (
                    <span className="text-[10px] text-muted-foreground opacity-40 font-medium">
                        / {agentRunLimit}m
                    </span>
                )}

                {isNearingLimit && (
                    <span className="flex h-1.5 w-1.5 rounded-full bg-red-500 animate-ping ml-1" />
                )}
            </div>
        </div>
    );
}
