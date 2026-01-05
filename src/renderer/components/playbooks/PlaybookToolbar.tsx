
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { useReactFlow } from 'reactflow';
import { Settings, Save, X, Play, Layout as LayoutIcon, Columns, Radio, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Field } from '@/components/ui/field';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Playbook, PlaybookCapabilities, PlaybookExecutionDefaults } from '@/types/playbook';
import { useAppStore } from '@/stores/app.store';
import { useSettingsStore } from '@/stores/settings.store';

interface PlaybookToolbarProps {
    playbookName: string;
    onNameChange: (name: string) => void;
    playbook: Partial<Playbook>;
    onMetadataChange: (meta: Partial<Playbook>) => void;
    onSave: () => void;
    onBack: () => void;
    onLayout?: (direction: 'TB' | 'LR') => void;
    layoutDirection?: 'TB' | 'LR';
    onRun?: () => void;
    onStop?: () => void;
    saving?: boolean;
    isRunning?: boolean;
    isRecording?: boolean;
    onToggleRecording?: () => void;
}

export function PlaybookToolbar({
    playbookName, onNameChange, playbook, onMetadataChange, onSave, onRun, onStop, onBack, onLayout, layoutDirection, saving, isRunning, isRecording, onToggleRecording
}: PlaybookToolbarProps) {
    const [localCapabilities, setLocalCapabilities] = useState<PlaybookCapabilities>({ browser: true, mcp: [], external_api: [] });
    const [localDefaults, setLocalDefaults] = useState<PlaybookExecutionDefaults>({ mode: 'observe', require_approval: true, speed: 'normal', model: '' });
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const { showPlaybookBrowser, togglePlaybookBrowser } = useAppStore();
    const { modelProviders } = useSettingsStore();

    const enabledProviders = modelProviders.filter((p) => p.enabled);

    useEffect(() => {
        // Skip syncing from props if the user is currently editing settings
        if (isSettingsOpen) return;

        if (playbook.capabilities) setLocalCapabilities(playbook.capabilities);
        if (playbook.execution_defaults) {
            setLocalDefaults({
                ...playbook.execution_defaults,
                speed: playbook.execution_defaults.speed || 'normal',
                model: playbook.execution_defaults.model || ''
            });
        }
    }, [playbook, isSettingsOpen]);

    const handleSettingsSave = () => {
        onMetadataChange({
            capabilities: localCapabilities,
            execution_defaults: localDefaults
        });
        setIsSettingsOpen(false);
    };

    return (
        <div className="h-14 border-b border-border bg-card flex items-center justify-between px-4 gap-4 z-10">
            <div className="flex items-center gap-4 flex-1">
                <Button variant="ghost" size="icon" onClick={onBack}>
                    <X className="h-4 w-4" />
                </Button>
                <div className="flex flex-col">
                    <Input
                        value={playbookName}
                        onChange={(e) => onNameChange(e.target.value)}
                        className="h-9 w-64 border-transparent hover:border-primary/20 focus:border-primary/30 bg-transparent font-semibold px-2 -ml-2 rounded-lg text-foreground placeholder:text-muted-foreground/30"
                        placeholder="Playbook Name"
                    />
                </div>
            </div>

            <div className="flex items-center gap-2 border-l border-border pl-4 ml-2">
                <Sheet open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
                    <Tooltip>
                        <SheetTrigger asChild>
                            <TooltipTrigger asChild>
                                <Button variant="outline" size="sm">
                                    <Settings className={showPlaybookBrowser ? "h-4 w-4" : "h-4 w-4 mr-2"} />
                                    {!showPlaybookBrowser && `Settings (${localDefaults.speed || 'normal'})`}
                                </Button>
                            </TooltipTrigger>
                        </SheetTrigger>
                        <TooltipContent>Playbook Settings</TooltipContent>
                    </Tooltip>
                    <SheetContent className="w-[400px]">
                        <SheetHeader>
                            <SheetTitle>Playbook Settings</SheetTitle>
                        </SheetHeader>
                        <div className="py-6 space-y-6">
                            {/* Execution Defaults */}
                            <div className="space-y-4">
                                <h3 className="text-sm font-medium">Execution Defaults</h3>
                                <Field label="Model">
                                    <Select
                                        value={localDefaults.model || ''}
                                        onValueChange={(v) => setLocalDefaults(p => ({ ...p, model: v }))}
                                    >
                                        <SelectTrigger className="text-xs text-left h-9 overflow-hidden">
                                            <SelectValue placeholder="Select model..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {enabledProviders.map(provider => (
                                                <SelectGroup key={provider.id}>
                                                    <SelectLabel className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-muted/30 px-2 py-1 mb-1">
                                                        {provider.name}
                                                    </SelectLabel>
                                                    {provider.models.map(model => (
                                                        <SelectItem key={model.id} value={model.id} className="text-xs">
                                                            {model.name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectGroup>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </Field>
                                <Field label="Mode">
                                    <Select
                                        value={localDefaults.mode}
                                        onValueChange={(v: any) => setLocalDefaults(p => ({ ...p, mode: v }))}
                                    >
                                        <SelectTrigger className="h-9 text-left">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="observe">Observe (Safe)</SelectItem>
                                            <SelectItem value="assist">Assist</SelectItem>
                                            <SelectItem value="auto">Autonomous</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </Field>
                                <Field label="Execution Speed">
                                    <Select
                                        value={localDefaults.speed || 'normal'}
                                        onValueChange={(v: any) => setLocalDefaults(p => ({ ...p, speed: v }))}
                                    >
                                        <SelectTrigger className="h-9 text-left">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="slow">Slow (Steady)</SelectItem>
                                            <SelectItem value="normal">Normal</SelectItem>
                                            <SelectItem value="fast">Fast (Turbo)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </Field>
                                <div className="flex items-center justify-between">
                                    <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider ml-1">Require Approval</label>
                                    <Switch
                                        checked={localDefaults.require_approval}
                                        onCheckedChange={(c) => setLocalDefaults(p => ({ ...p, require_approval: c }))}
                                    />
                                </div>
                            </div>

                            <div className="h-px bg-border" />

                            {/* Capabilities */}
                            <div className="space-y-4">
                                <h3 className="text-sm font-medium text-destructive">Required Capabilities</h3>
                                <div className="flex items-center justify-between">
                                    <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider ml-1">Browser Access</label>
                                    <Switch
                                        checked={localCapabilities.browser}
                                        onCheckedChange={(c) => setLocalCapabilities(p => ({ ...p, browser: c }))}
                                    />
                                </div>
                            </div>

                            <Button className="w-full" onClick={handleSettingsSave}>Apply Settings</Button>
                        </div>
                    </SheetContent>
                </Sheet>

                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant={isRecording ? "secondary" : "outline"}
                            size="sm"
                            onClick={onToggleRecording}
                            className={cn(isRecording && "bg-red-500/10 text-red-500 hover:bg-red-500/20 border-red-500/20")}
                        >
                            {isRecording ? (
                                <Square className="h-4 w-4 mr-2" fill="currentColor" />
                            ) : (
                                <Radio className="h-4 w-4 mr-2" />
                            )}
                            {isRecording ? "Stop Recording" : "Record Actions"}
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                        {isRecording ? "Stop Recording Browser Actions" : "Record Browser Actions to Nodes"}
                    </TooltipContent>
                </Tooltip>

                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant={showPlaybookBrowser ? "secondary" : "outline"}
                            size="sm"
                            onClick={togglePlaybookBrowser}
                        >
                            <Columns className={showPlaybookBrowser ? "h-4 w-4" : "h-4 w-4 mr-2"} />
                            {!showPlaybookBrowser && "Split View"}
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                        {showPlaybookBrowser ? "Hide Browser" : "Show Side-by-Side Browser View"}
                    </TooltipContent>
                </Tooltip>

                {onLayout && (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="outline" size="sm" onClick={() => onLayout('TB')}>
                                <LayoutIcon className={showPlaybookBrowser ? "h-4 w-4" : "h-4 w-4 mr-2"} />
                                {!showPlaybookBrowser && "Auto Layout"}
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Auto-organize graph (Vertical)</TooltipContent>
                    </Tooltip>
                )}

                {isRunning ? (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                onClick={onStop}
                                size="sm"
                                className="bg-destructive hover:bg-destructive/90 text-white animate-pulse"
                            >
                                <div className="h-3 w-3 bg-white rounded-[2px]" />
                                <span className="ml-2">Stop</span>
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Stop Execution</TooltipContent>
                    </Tooltip>
                ) : (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                onClick={onRun}
                                size="sm"
                                className="bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600/20"
                            >
                                <Play className="h-4 w-4 mr-2" fill="currentColor" />
                                {showPlaybookBrowser ? "Run" : "Run Playbook"}
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Run this Playbook</TooltipContent>
                    </Tooltip>
                )}

                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button onClick={onSave} disabled={saving} size="sm">
                            <Save className="h-4 w-4 mr-2" />
                            {saving ? 'Saving...' : 'Save Playbook'}
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>Save changes to Playbook</TooltipContent>
                </Tooltip>
            </div>
        </div>
    );
}
