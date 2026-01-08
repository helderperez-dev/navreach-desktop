import { useSettingsStore } from '@/stores/settings.store';
import { useAppStore } from '@/stores/app.store';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Monitor, Clock, PlayCircle, Palette, Moon, Sun, Laptop } from 'lucide-react';

export function GeneralSettings() {
    const { settings, updateSetting } = useSettingsStore();
    const { theme, setTheme } = useAppStore();

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="space-y-4">
                <div>
                    <h3 className="text-lg font-medium">Appearance</h3>
                    <p className="text-sm text-muted-foreground">
                        Customize how the application looks.
                    </p>
                </div>

                <div className="space-y-4 p-4 rounded-xl bg-muted/40 border border-border transition-all hover:bg-muted/60">
                    <div className="flex items-center gap-4 mb-2">
                        <div className="p-2 rounded-lg bg-muted text-muted-foreground transition-colors group-hover:bg-muted/80">
                            <Palette className="h-5 w-5" />
                        </div>
                        <div>
                            <Label className="text-base font-semibold">Theme Preference</Label>
                            <p className="text-xs text-muted-foreground">Select your preferred color theme.</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3 pt-2">
                        {[
                            { value: 'light', label: 'Light', icon: Sun },
                            { value: 'dark', label: 'Dark', icon: Moon },
                            { value: 'system', label: 'System', icon: Laptop },
                        ].map((item) => (
                            <button
                                key={item.value}
                                onClick={() => setTheme(item.value as any)}
                                className={`
                                    flex flex-col items-center gap-2 p-3 rounded-lg border transition-all duration-200
                                    ${theme === item.value
                                        ? 'bg-muted border-primary/50 text-foreground shadow-sm ring-1 ring-primary/10'
                                        : 'bg-background/30 border-border text-muted-foreground hover:bg-muted/50 hover:border-border/80 hover:text-foreground'
                                    }
                                `}
                            >
                                <item.icon className="h-5 w-5" />
                                <span className="text-xs font-medium">{item.label}</span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="space-y-4">
                <div>
                    <h3 className="text-lg font-medium">System Settings</h3>
                    <p className="text-sm text-muted-foreground">
                        Configure how the application behaves on your system.
                    </p>
                </div>

                <div className="flex items-center justify-between p-4 rounded-xl bg-muted/40 border border-border group transition-all hover:bg-muted/60">
                    <div className="flex items-center gap-4">
                        <div className="p-2 rounded-lg bg-muted text-muted-foreground transition-all group-hover:bg-muted/80">
                            <Monitor className="h-5 w-5" />
                        </div>
                        <div>
                            <Label className="text-base font-semibold">Prevent Sleep Mode</Label>
                            <p className="text-xs text-muted-foreground">Keep the computer awake while the app is active.</p>
                        </div>
                    </div>
                    <Switch
                        checked={settings.preventSleep}
                        onCheckedChange={(v) => updateSetting('preventSleep', v)}
                    />
                </div>
            </div>

            <div className="space-y-4">
                <div>
                    <h3 className="text-lg font-medium">Agent Execution</h3>
                    <p className="text-sm text-muted-foreground">
                        Define default behavior for long-running agent tasks.
                    </p>
                </div>

                <div className="space-y-4 p-4 rounded-xl bg-muted/40 border border-border">
                    <div className="flex items-center gap-4 mb-2">
                        <div className="p-2 rounded-lg bg-muted text-muted-foreground transition-colors group-hover:bg-muted/80">
                            <PlayCircle className="h-5 w-5" />
                        </div>
                        <div>
                            <Label className="text-base font-semibold">Agent Run Mode</Label>
                            <p className="text-xs text-muted-foreground">How the agent should handle execution cycles.</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                        <div className="space-y-2">
                            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Default Mode</Label>
                            <Select
                                value={settings.agentRunMode}
                                onValueChange={(v: any) => updateSetting('agentRunMode', v)}
                            >
                                <SelectTrigger className="bg-background/50 border-border">
                                    <SelectValue placeholder="Select mode" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="manual">Manual (Step-by-step)</SelectItem>
                                    <SelectItem value="indefinite">Indefinite (Forever)</SelectItem>
                                    <SelectItem value="timer">Timer (Fixed duration)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {settings.agentRunMode === 'timer' && (
                            <div className="space-y-2 animate-in zoom-in-95 duration-200">
                                <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                                    <Clock className="h-3 w-3" /> Duration (minutes)
                                </Label>
                                <Input
                                    type="number"
                                    min={1}
                                    value={settings.agentRunDuration}
                                    onChange={(e) => updateSetting('agentRunDuration', parseInt(e.target.value) || 1)}
                                    className="bg-background/50 border-border"
                                />
                            </div>
                        )}
                    </div>

                    <div className="mt-4 p-3 rounded-lg bg-muted/30 border border-border/50">
                        <p className="text-[11px] text-muted-foreground/80 leading-relaxed italic">
                            Note: Indefinite mode will continue execution cycles until manually stopped or a system error occurs.
                            Always ensure you have sufficient API credits.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
