import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Download, FileJson, FileSpreadsheet, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTargetsStore } from '@/stores/targets.store';
import { cn } from '@/lib/utils';

export function ExportDialog() {
    const {
        exportTargets, lists, segments,
        isExportModalOpen, setIsExportModalOpen,
        exportListId,
        selectedTargetIds
    } = useTargetsStore();

    const [format, setFormat] = useState<'csv' | 'json'>('csv');
    const [scope, setScope] = useState<'all' | 'selected'>(selectedTargetIds.size > 0 ? 'selected' : 'all');

    const handleExport = async () => {
        await exportTargets(format, {
            listId: exportListId || undefined,
            targetIds: scope === 'selected' ? Array.from(selectedTargetIds) : undefined
        });
        setIsExportModalOpen(false);
    };

    const targetName = exportListId
        ? (lists.find(l => l.id === exportListId)?.name || segments.find(s => s.id === exportListId)?.name || 'target list')
        : 'current view';

    return (
        <Dialog.Root open={isExportModalOpen} onOpenChange={setIsExportModalOpen}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-50 animate-in fade-in duration-200" />
                <Dialog.Content className="fixed left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] w-full max-w-md bg-popover border border-border p-0 rounded-3xl shadow-2xl z-50 animate-in zoom-in-95 duration-200 overflow-hidden">
                    <div className="p-6 border-b border-border/50 flex items-center justify-between bg-card/50">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center border border-border/50">
                                <Download className="h-5 w-5 text-muted-foreground/70" />
                            </div>
                            <div>
                                <Dialog.Title className="text-lg font-semibold text-foreground">
                                    Export Leads
                                </Dialog.Title>
                                <p className="text-xs text-muted-foreground mt-0.5">Configure your export settings</p>
                            </div>
                        </div>
                        <Dialog.Close asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-muted rounded-full">
                                <X className="h-4 w-4 text-muted-foreground" />
                            </Button>
                        </Dialog.Close>
                    </div>

                    <div className="p-6 space-y-6">
                        {selectedTargetIds.size > 0 && (
                            <div className="space-y-3">
                                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">Export Scope</label>
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        onClick={() => setScope('selected')}
                                        className={cn(
                                            "flex flex-col items-center gap-2 p-3 rounded-2xl border transition-all duration-300 group",
                                            scope === 'selected'
                                                ? "bg-muted border-border/80 shadow-sm"
                                                : "bg-transparent border-border/20 hover:border-border/40"
                                        )}
                                    >
                                        <div className="text-sm font-semibold flex items-center gap-2">
                                            <div className={cn("w-2 h-2 rounded-full", scope === 'selected' ? "bg-primary" : "bg-muted-foreground/30")} />
                                            Selected ({selectedTargetIds.size})
                                        </div>
                                    </button>
                                    <button
                                        onClick={() => setScope('all')}
                                        className={cn(
                                            "flex flex-col items-center gap-2 p-3 rounded-2xl border transition-all duration-300 group",
                                            scope === 'all'
                                                ? "bg-muted border-border/80 shadow-sm"
                                                : "bg-transparent border-border/20 hover:border-border/40"
                                        )}
                                    >
                                        <div className="text-sm font-semibold flex items-center gap-2">
                                            <div className={cn("w-2 h-2 rounded-full", scope === 'all' ? "bg-primary" : "bg-muted-foreground/30")} />
                                            All Leads
                                        </div>
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className="space-y-3">
                            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">Format</label>

                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={() => setFormat('csv')}
                                    className={cn(
                                        "flex flex-col items-center gap-3 p-5 rounded-2xl border transition-all duration-300 group",
                                        format === 'csv'
                                            ? "bg-muted border-border/80 shadow-sm"
                                            : "bg-transparent border-border/20 hover:border-border/40 hover:bg-muted/30"
                                    )}
                                >
                                    <div className={cn(
                                        "w-12 h-12 rounded-xl flex items-center justify-center transition-colors shadow-sm",
                                        format === 'csv' ? "bg-card border border-border/50 text-foreground" : "bg-muted/50 text-muted-foreground/40 group-hover:text-muted-foreground/60"
                                    )}>
                                        <FileSpreadsheet className="h-6 w-6" />
                                    </div>
                                    <div className="text-center">
                                        <p className="text-sm font-semibold">CSV</p>
                                        <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider font-medium opacity-60">Spreadsheet</p>
                                    </div>
                                </button>

                                <button
                                    onClick={() => setFormat('json')}
                                    className={cn(
                                        "flex flex-col items-center gap-3 p-5 rounded-2xl border transition-all duration-300 group",
                                        format === 'json'
                                            ? "bg-muted border-border/80 shadow-sm"
                                            : "bg-transparent border-border/20 hover:border-border/40 hover:bg-muted/30"
                                    )}
                                >
                                    <div className={cn(
                                        "w-12 h-12 rounded-xl flex items-center justify-center transition-colors shadow-sm",
                                        format === 'json' ? "bg-card border border-border/50 text-foreground" : "bg-muted/50 text-muted-foreground/40 group-hover:text-muted-foreground/60"
                                    )}>
                                        <FileJson className="h-6 w-6" />
                                    </div>
                                    <div className="text-center">
                                        <p className="text-sm font-semibold">JSON</p>
                                        <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider font-medium opacity-60">Data Object</p>
                                    </div>
                                </button>
                            </div>
                        </div>

                        <div className="bg-muted/30 rounded-2xl p-4 border border-border/30">
                            <div className="flex items-center justify-between text-[11px]">
                                <span className="text-muted-foreground">Source:</span>
                                <span className="font-semibold text-foreground truncate max-w-[200px]">{targetName}</span>
                            </div>
                        </div>
                    </div>

                    <div className="p-6 pt-0">
                        <Button
                            className="w-full h-12 rounded-2xl bg-foreground text-background hover:bg-foreground/90 font-semibold transition-all group shadow-xl shadow-black/5"
                            onClick={handleExport}
                        >
                            <span>Download {format.toUpperCase()}</span>
                            <ChevronRight className="h-4 w-4 ml-2 group-hover:translate-x-1 transition-transform" />
                        </Button>
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
