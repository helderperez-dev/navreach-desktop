
import { useEffect, useState } from 'react';
import { useReactFlow } from 'reactflow';
import { Settings, Save, X, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Field } from '@/components/ui/field';
import { Playbook, PlaybookCapabilities, PlaybookExecutionDefaults } from '@/types/playbook';

interface PlaybookToolbarProps {
    playbookName: string;
    onNameChange: (name: string) => void;
    playbook: Partial<Playbook>;
    onMetadataChange: (meta: Partial<Playbook>) => void;
    onSave: () => void;
    onBack: () => void;
    onLayout?: () => void;
    saving?: boolean;
}

import { Layout as LayoutIcon } from 'lucide-react';

export function PlaybookToolbar({
    playbookName, onNameChange, playbook, onMetadataChange, onSave, onBack, onLayout, saving
}: PlaybookToolbarProps) {
    const [localCapabilities, setLocalCapabilities] = useState<PlaybookCapabilities>({ browser: true, mcp: [], external_api: [] });
    const [localDefaults, setLocalDefaults] = useState<PlaybookExecutionDefaults>({ mode: 'observe', require_approval: true });

    useEffect(() => {
        if (playbook.capabilities) setLocalCapabilities(playbook.capabilities);
        if (playbook.execution_defaults) setLocalDefaults(playbook.execution_defaults);
    }, [playbook]);

    const handleSettingsSave = () => {
        onMetadataChange({
            capabilities: localCapabilities,
            execution_defaults: localDefaults
        });
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
                        className="h-9 w-64 border-transparent hover:border-white/10 focus:border-white/20 bg-transparent font-semibold px-2 -ml-2 rounded-lg"
                        placeholder="Playbook Name"
                    />
                </div>
            </div>

            <div className="flex items-center gap-2">
                <Sheet>
                    <SheetTrigger asChild>
                        <Button variant="outline" size="sm">
                            <Settings className="h-4 w-4 mr-2" />
                            Settings
                        </Button>
                    </SheetTrigger>
                    <SheetContent className="w-[400px]">
                        <SheetHeader>
                            <SheetTitle>Playbook Settings</SheetTitle>
                        </SheetHeader>
                        <div className="py-6 space-y-6">
                            {/* Execution Defaults */}
                            <div className="space-y-4">
                                <h3 className="text-sm font-medium">Execution Defaults</h3>
                                <Field label="Mode">
                                    <Select
                                        value={localDefaults.mode}
                                        onValueChange={(v: any) => setLocalDefaults(p => ({ ...p, mode: v }))}
                                    >
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="observe">Observe (Safe)</SelectItem>
                                            <SelectItem value="assist">Assist</SelectItem>
                                            <SelectItem value="auto">Autonomous</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </Field>
                                <div className="flex items-center justify-between">
                                    <label className="text-[10px] font-semibold text-white/40 uppercase tracking-wider ml-1">Require Approval</label>
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
                                    <label className="text-[10px] font-semibold text-white/40 uppercase tracking-wider ml-1">Browser Access</label>
                                    <Switch
                                        checked={localCapabilities.browser}
                                        onCheckedChange={(c) => setLocalCapabilities(p => ({ ...p, browser: c }))}
                                    />
                                </div>
                                {/* MCP and API would be multiselects in future */}
                            </div>

                            <Button className="w-full" onClick={handleSettingsSave}>Apply Settings</Button>
                        </div>
                    </SheetContent>
                </Sheet>

                {onLayout && (
                    <Button variant="outline" size="sm" onClick={onLayout} title="Auto-organize graph">
                        <LayoutIcon className="h-4 w-4 mr-2" />
                        Auto Layout
                    </Button>
                )}

                <Button onClick={onSave} disabled={saving} size="sm">
                    <Save className="h-4 w-4 mr-2" />
                    {saving ? 'Saving...' : 'Save Playbook'}
                </Button>
            </div>
        </div>
    );
}
