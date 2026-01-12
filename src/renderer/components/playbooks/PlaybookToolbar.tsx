
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
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Playbook, PlaybookCapabilities, PlaybookExecutionDefaults } from '@/types/playbook';
import { useAppStore } from '@/stores/app.store';
import { useSettingsStore } from '@/stores/settings.store';

interface PlaybookToolbarProps {
    playbookName: string;
    onNameChange: (name: string) => void;
    playbook: Partial<Playbook>;
    onMetadataChange: (meta: Partial<Playbook>) => void;
    onSave: (meta?: Partial<Playbook>) => void;
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
    const [localDescription, setLocalDescription] = useState('');
    const [localVersion, setLocalVersion] = useState('1.0.0');
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const { showPlaybookBrowser, togglePlaybookBrowser } = useAppStore();
    const { modelProviders } = useSettingsStore();

    const enabledProviders = modelProviders.filter((p) => p.enabled);

    useEffect(() => {
        // Skip syncing from props if the user is currently editing settings
        if (isSettingsOpen) return;

        if (playbook.capabilities) setLocalCapabilities(playbook.capabilities);
        if (playbook.description !== undefined) setLocalDescription(playbook.description);
        if (playbook.version !== undefined) setLocalVersion(playbook.version);
        if (playbook.execution_defaults) {
            setLocalDefaults({
                ...playbook.execution_defaults,
                speed: playbook.execution_defaults.speed || 'normal',
                model: playbook.execution_defaults.model || ''
            });
        }
    }, [playbook, isSettingsOpen]);

    const handleSettingsSave = () => {
        const meta = {
            description: localDescription,
            version: localVersion,
            capabilities: localCapabilities,
            execution_defaults: localDefaults
        };
        onMetadataChange(meta);
        onSave(meta);
        setIsSettingsOpen(false);
    };

    return (
        <div className="h-14 border-b border-border bg-card flex items-center justify-between px-4 gap-2 z-10 shrink-0">
            <div className={`flex items-center gap-2 ${showPlaybookBrowser ? 'flex-[0_1_auto]' : 'flex-1'}`}>
                <Button variant="ghost" size="icon" onClick={onBack}>
                    <X className="h-4 w-4" />
                </Button>
                <div className="flex-1 min-w-0 overflow-hidden">
                    <Input
                        value={playbookName}
                        onChange={(e) => onNameChange(e.target.value)}
                        className="h-9 border-transparent shadow-none bg-transparent hover:bg-accent/10 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-transparent focus-visible:bg-transparent font-semibold px-2 -ml-2 rounded-lg text-foreground placeholder:text-muted-foreground/20 transition-all w-full truncate"
                        placeholder="Playbook Name"
                    />
                </div>
            </div>

            <div className="flex items-center gap-1.5 ml-auto">
                <Sheet open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
                    <Tooltip>
                        <SheetTrigger asChild>
                            <TooltipTrigger asChild>
                                <Button variant="outline" size="sm" className={cn(showPlaybookBrowser && "px-2")}>
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
                            {/* General */}
                            <div className="space-y-4">
                                <h3 className="text-sm font-medium">General</h3>
                                <Field label="Version">
                                    <Input
                                        value={localVersion}
                                        onChange={(e) => setLocalVersion(e.target.value)}
                                        placeholder="1.0.0"
                                        className="h-9"
                                    />
                                </Field>
                                <Field label="Description">
                                    <Textarea
                                        value={localDescription}
                                        onChange={(e) => setLocalDescription(e.target.value)}
                                        placeholder="What does this playbook do?"
                                        className="min-h-[100px] text-xs"
                                    />
                                </Field>
                            </div>

                            <div className="h-px bg-border" />

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
                                                        {provider.id === 'system-default' ? 'Reavion' : provider.name}
                                                    </SelectLabel>
                                                    {provider.models.map(model => (
                                                        <SelectItem key={model.id} value={model.id} className="text-xs">
                                                            {provider.id === 'system-default' ? 'Reavion Flash' : model.name}
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

                            <Button
                                variant="outline"
                                className="w-full border-primary/20 bg-primary/5 hover:bg-primary/10 text-primary font-bold shadow-none"
                                onClick={handleSettingsSave}
                            >
                                Apply & Save Settings
                            </Button>
                        </div>
                    </SheetContent>
                </Sheet>



                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant={showPlaybookBrowser ? "secondary" : "outline"}
                            size="sm"
                            onClick={togglePlaybookBrowser}
                            className={cn(showPlaybookBrowser && "px-2")}
                        >
                            <Columns className={showPlaybookBrowser ? "h-4 w-4" : "h-4 w-4 mr-2"} />
                            {!showPlaybookBrowser && "Split View"}
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                        {showPlaybookBrowser ? "Hide Browser" : "Show Side-by-Side Browser View"}
                    </TooltipContent>
                </Tooltip>

                {onLayout && !showPlaybookBrowser && (
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
                                variant="outline"
                                className={cn(
                                    "h-9 px-4 border-destructive/20 bg-destructive/5 hover:bg-destructive/10 text-destructive font-medium shadow-none animate-pulse transition-all",
                                    showPlaybookBrowser && "px-2 w-9 h-9"
                                )}
                            >
                                <div className="h-3 w-3 bg-current rounded-[2px]" />
                                {!showPlaybookBrowser && <span className="ml-2">Stop</span>}
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
                                variant="outline"
                                className={cn(
                                    "h-9 px-4 border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium shadow-none transition-all",
                                    showPlaybookBrowser && "px-2 w-9 h-9"
                                )}
                            >
                                <Play className={showPlaybookBrowser ? "h-4 w-4" : "h-4 w-4 mr-2"} fill="currentColor" />
                                {!showPlaybookBrowser && "Run Playbook"}
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Run this Playbook</TooltipContent>
                    </Tooltip>
                )}

                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            onClick={() => onSave()}
                            disabled={saving}
                            size="sm"
                            variant="outline"
                            className={cn(
                                "h-9 px-4 border-primary/20 bg-primary/5 hover:bg-primary/10 text-primary font-medium shadow-none transition-all",
                                showPlaybookBrowser && "px-2 w-9 h-9"
                            )}
                        >
                            <Save className={showPlaybookBrowser ? "h-4 w-4" : "h-4 w-4 mr-2"} />
                            {!showPlaybookBrowser && (saving ? 'Saving...' : 'Save Playbook')}
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>Save changes to Playbook</TooltipContent>
                </Tooltip>
            </div>
        </div>
    );
}
