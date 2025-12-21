
import { DragEvent } from 'react';
import { NODE_DEFINITIONS, NODE_CATEGORIES } from './nodeDefs';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

export function NodePalette() {
    const onDragStart = (event: DragEvent, nodeType: string) => {
        event.dataTransfer.setData('application/reactflow', nodeType);
        event.dataTransfer.effectAllowed = 'move';
    };

    const categories = Object.values(NODE_CATEGORIES);
    const groupedNodes = categories.reduce((acc, category) => {
        acc[category] = Object.values(NODE_DEFINITIONS).filter(n => n.category === category);
        return acc;
    }, {} as Record<string, typeof NODE_DEFINITIONS[keyof typeof NODE_DEFINITIONS][]>);

    return (
        <div className="w-56 border-r border-border bg-muted/10 h-full flex flex-col">
            <div className="p-4 font-semibold text-sm border-b border-border">
                Node Library
            </div>
            <ScrollArea className="flex-1">
                <div className="p-4 space-y-6">
                    {categories.map((category) => (
                        <div key={category}>
                            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                                {category}
                            </h4>
                            <div className="grid grid-cols-1 gap-2">
                                {groupedNodes[category]?.map((def) => {
                                    const Icon = def.icon;
                                    return (
                                        <div
                                            key={def.type}
                                            className={cn(
                                                "flex items-center gap-3 p-3 rounded-lg border border-border bg-card cursor-grab hover:border-primary/50 transition-colors shadow-sm",
                                                "active:cursor-grabbing"
                                            )}
                                            draggable
                                            onDragStart={(e) => onDragStart(e, def.type)}
                                        >
                                            <div className={cn("p-1.5 rounded-md", def.color)}>
                                                <Icon className="w-3.5 h-3.5" />
                                            </div>
                                            <span className="text-sm font-medium">{def.label}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </ScrollArea>
        </div>
    );
}
