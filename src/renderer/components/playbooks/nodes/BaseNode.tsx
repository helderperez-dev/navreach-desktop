
import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { CircularLoader } from '@/components/ui/CircularLoader';
import { NODE_DEFINITIONS } from '../nodeDefs';
import { cn } from '@/lib/utils';
import { PlaybookNodeType } from '@/types/playbook';

const BaseNode = ({ data, type, selected }: NodeProps) => {
    const def = NODE_DEFINITIONS[type as PlaybookNodeType];

    if (!def) return <div className="p-2 bg-destructive text-destructive-foreground text-xs rounded-lg">Unknown Node: {type}</div>;

    const Icon = def.icon;
    const isStart = type === 'start';
    const isEnd = type === 'end';
    const isControl = def.category === 'Control' && !isStart && !isEnd;

    const status = data.executionStatus as 'running' | 'success' | 'error' | undefined;

    return (
        <div className={cn(
            "min-w-[180px] max-w-[240px] rounded-xl border bg-card transition-all shadow-md group relative",
            selected ? "border-primary ring-2 ring-primary/20 brightness-110" : "border-border hover:border-muted-foreground/30",
            status === 'running' && "border-primary ring-4 ring-primary/50 shadow-[0_0_25px_rgba(var(--primary),0.6)] z-50 scale-[1.02] animate-pulse-slow",
            status === 'success' && "border-emerald-500 ring-4 ring-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.3)]",
            status === 'error' && "border-destructive ring-4 ring-destructive/30 shadow-[0_0_20px_rgba(239,68,68,0.4)]",
            "flex flex-col py-3 px-4"
        )}>
            {/* Execution Status Badge */}
            {status && (
                <div className={cn(
                    "absolute -top-3 -right-3 w-7 h-7 rounded-full flex items-center justify-center text-xs font-black border-4 border-background shadow-lg z-[60]",
                    status === 'running' && "bg-primary text-primary-foreground animate-pulse",
                    status === 'success' && "bg-emerald-500 text-white",
                    status === 'error' && "bg-destructive text-white"
                )}>
                    {status === 'running' && <CircularLoader className="w-4 h-4 border-white border-t-white/60" />}
                    {status === 'success' && '✓'}
                    {status === 'error' && '!'}
                </div>
            )}

            {/* --- Smart Directional Ports --- */}
            {['top', 'bottom', 'left', 'right'].map((side) => {
                const layoutDir = data.layoutDirection || 'LR';
                const pos = side === 'top' ? Position.Top : side === 'bottom' ? Position.Bottom : side === 'left' ? Position.Left : Position.Right;
                const isVerticalHandle = side === 'top' || side === 'bottom';

                // Hide handles that don't match current layout direction to avoid "extra dots"
                // Standard nodes only need one input and one output in the flow direction
                if (layoutDir === 'LR' && isVerticalHandle) return null;
                if (layoutDir === 'TB' && !isVerticalHandle) return null;

                // Specialized nodes handle their own outputs on specific sides
                // Condition handles branches on the right
                if (type === 'condition' && side === 'right') return null;
                // Loop handles item/done manually on the right
                if (type === 'loop' && side === 'right') return null;

                // Hide handles for specific sides on Start/End
                if (isStart && (side === 'top' || side === 'left')) return null;
                if (isEnd && (side === 'bottom' || side === 'right')) return null;

                const isTarget = (layoutDir === 'LR' && side === 'left') || (layoutDir === 'TB' && side === 'top');

                return (
                    <div key={side} className="absolute inset-0 pointer-events-none group/handle-hitbox">
                        <Handle
                            id={isTarget ? `${side}-target` : `${side}-source`}
                            type={isTarget ? 'target' : 'source'}
                            position={pos}
                            className={cn(
                                "!w-4 !h-4 !bg-muted-foreground/40 !border-2 !border-card transition-all opacity-20 group-hover:opacity-100 hover:!bg-primary z-[30] !pointer-events-auto rounded-full shadow-sm",
                                "group-hover/handle-hitbox:ring-2 group-hover/handle-hitbox:ring-primary/40"
                            )}
                            style={{
                                [side]: '-8px',
                                [isVerticalHandle ? 'left' : 'top']: '50%',
                                transform: isVerticalHandle ? 'translateX(-50%)' : 'translateY(-50%)'
                            }}
                        />
                    </div>
                );
            })}

            {/* Node Content */}
            <div className="flex items-center gap-3">
                <div className={cn("p-2 rounded-lg shrink-0 shadow-inner", def.color)}>
                    <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold tracking-tight truncate leading-tight">
                        {data.label || def.label}
                    </h3>
                    <p className="text-[10px] text-muted-foreground/60 uppercase font-black tracking-widest mt-0.5">
                        {def.category}
                    </p>
                </div>
            </div>

            {/* Config Snippet (Subtle) */}
            {data.config && Object.keys(data.config).length > 0 && (
                <div className="mt-3 pt-2 border-t border-border/40 space-y-1">
                    {Object.entries(data.config).slice(0, 1).map(([k, v]) => (
                        <div key={k} className="flex flex-col">
                            <span className="text-[9px] uppercase font-bold text-muted-foreground/60 truncate">{k.replace('_', ' ')}</span>
                            <span className="text-[10px] font-mono text-foreground/80 truncate">{String(v)}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Specialized: Condition Node (n8n style branch) */}
            {type === 'condition' && (
                <div className="absolute right-[-14px] top-0 bottom-0 flex flex-col justify-around py-4">
                    <div className="relative group/handle">
                        <Handle
                            id="true"
                            type="source"
                            position={Position.Right}
                            className="!static !w-4 !h-4 !bg-emerald-500 border-2 border-card shadow-sm hover:brightness-125 transition-all rounded-full"
                        />
                        <div className="absolute right-6 top-[-2px] text-[9px] font-black text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity uppercase">True</div>
                    </div>
                    <div className="relative group/handle">
                        <Handle
                            id="false"
                            type="source"
                            position={Position.Right}
                            className="!static !w-4 !h-4 !bg-red-500 border-2 border-card shadow-sm hover:brightness-125 transition-all rounded-full"
                        />
                        <div className="absolute right-6 top-[-2px] text-[9px] font-black text-red-500 bg-red-500/10 px-1.5 py-0.5 rounded pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity uppercase">False</div>
                    </div>
                </div>
            )}

            {/* Specialized: Loop Node */}
            {type === 'loop' && (
                <>
                    {data.loopCount > 0 && (
                        <div className="absolute -bottom-2 -left-2 bg-primary text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-lg border-2 border-background z-50">
                            Iteration {data.loopCount}
                        </div>
                    )}
                    <div className="absolute right-[-14px] top-0 bottom-0 flex flex-col justify-around py-4">
                        <div className="relative group/handle">
                            <Handle
                                id="item"
                                type="source"
                                position={Position.Right}
                                className="!static !w-4 !h-4 !bg-blue-500 border-2 !border-card shadow-sm hover:brightness-110 transition-all rounded-full"
                            />
                            <div className="absolute right-6 top-[-2px] text-[9px] font-black text-blue-500 bg-blue-500/10 px-1.5 py-0.5 rounded pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity uppercase">Item</div>
                        </div>
                        <div className="relative group/handle">
                            <Handle
                                id="done"
                                type="source"
                                position={Position.Right}
                                className="!static !w-4 !h-4 !bg-slate-500 border-2 !border-card shadow-sm hover:brightness-110 transition-all rounded-full"
                            />
                            <div className="absolute right-6 top-[-2px] text-[9px] font-black text-slate-500 bg-slate-500/10 px-1.5 py-0.5 rounded pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity uppercase">Done</div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default memo(BaseNode);
