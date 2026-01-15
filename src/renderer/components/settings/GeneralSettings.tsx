import { useState, useEffect } from 'react';
import { useSettingsStore } from '@/stores/settings.store';
import { useAppStore } from '@/stores/app.store';
import { useAuthStore } from '@/stores/auth.store';
import { userService } from '@/services/userService';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Monitor, Clock, PlayCircle, Palette, Moon, Sun, Laptop, User, Camera } from 'lucide-react';
import { CircularLoader } from '@/components/ui/CircularLoader';
import { toast } from 'sonner';

export function GeneralSettings() {
    const { settings, updateSetting } = useSettingsStore();
    const { theme, setTheme } = useAppStore();
    const { user } = useAuthStore();

    const [isLoading, setIsLoading] = useState(false);
    const [fullName, setFullName] = useState('');
    const [avatarUrl, setAvatarUrl] = useState('');
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [hasChanges, setHasChanges] = useState(false);

    useEffect(() => {
        if (user) {
            setFullName(user.user_metadata?.full_name || '');
            setAvatarUrl(user.user_metadata?.avatar_url || '');
        }
    }, [user]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            if (file.size > 5 * 1024 * 1024) {
                toast.error('File size must be less than 5MB');
                return;
            }
            setSelectedFile(file);
            setAvatarUrl(URL.createObjectURL(file));
            setHasChanges(true);
        }
    };

    const handleSaveProfile = async () => {
        if (!user) return;
        setIsLoading(true);
        try {
            let publicUrl = user.user_metadata?.avatar_url;

            if (selectedFile) {
                publicUrl = await userService.uploadAvatar(selectedFile, user.id);
            }

            await userService.updateProfile(user.id, {
                full_name: fullName,
                avatar_url: publicUrl
            });

            toast.success('Profile updated successfully');
            setHasChanges(false);
            setSelectedFile(null);
        } catch (error: any) {
            console.error('Failed to update profile:', error);
            toast.error(error.message || 'Failed to update profile');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="space-y-4">
                <div>
                    <h3 className="text-lg font-medium">User Profile</h3>
                    <p className="text-sm text-muted-foreground">
                        Manage your personal information and basic settings.
                    </p>
                </div>

                <div className="p-4 rounded-xl bg-muted/40 border border-border space-y-6">
                    <div className="flex items-center gap-4 mb-2">
                        <div className="p-2 rounded-lg bg-muted text-muted-foreground transition-colors group-hover:bg-muted/80">
                            <User className="h-5 w-5" />
                        </div>
                        <div>
                            <Label className="text-base font-semibold">Account Details</Label>
                            <p className="text-xs text-muted-foreground">Update your avatar and display name.</p>
                        </div>
                    </div>

                    <div className="flex flex-col md:flex-row gap-8 items-center md:items-start pt-2 px-2">
                        {/* Avatar Column */}
                        <div className="flex flex-col items-center gap-3">
                            <div className="relative group h-28 w-28">
                                <div className="h-full w-full rounded-full overflow-hidden border-2 border-primary/20 bg-background shadow-md flex items-center justify-center bg-muted">
                                    {avatarUrl ? (
                                        <img
                                            src={avatarUrl}
                                            alt="Avatar"
                                            className="h-full w-full object-cover"
                                            style={{ objectFit: 'cover' }}
                                            onError={() => setAvatarUrl('')}
                                        />
                                    ) : (
                                        <User className="h-12 w-12 text-muted-foreground/50" />
                                    )}
                                </div>

                                <label
                                    htmlFor="avatar-upload"
                                    className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-all duration-200 cursor-pointer rounded-full z-10 backdrop-blur-[2px]"
                                >
                                    <Camera className="h-6 w-6 mb-1" />
                                    <span className="text-[10px] font-bold uppercase tracking-wider">Change</span>
                                </label>
                            </div>

                            <input
                                id="avatar-upload"
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handleFileChange}
                                disabled={isLoading}
                            />

                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 px-3 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                                onClick={() => document.getElementById('avatar-upload')?.click()}
                            >
                                Edit Image
                            </Button>
                        </div>

                        {/* Form Column */}
                        <div className="flex-1 space-y-6 w-full">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-4">
                                <div className="space-y-2">
                                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Full Name</Label>
                                    <Input
                                        value={fullName}
                                        onChange={(e) => {
                                            setFullName(e.target.value);
                                            setHasChanges(true);
                                        }}
                                        placeholder="Enter your name"
                                        className="bg-background/50 border-border focus:ring-1 focus:ring-primary/20 h-10"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Email Address</Label>
                                    <Input
                                        value={user?.email || ''}
                                        disabled
                                        className="bg-muted/30 text-muted-foreground/70 border-border h-10 cursor-not-allowed"
                                    />
                                </div>
                            </div>

                            <div className="pt-4 flex justify-end border-t border-border/20">
                                <Button
                                    onClick={handleSaveProfile}
                                    disabled={!hasChanges || isLoading}
                                    className="min-w-[120px] shadow-sm shadow-primary/10"
                                >
                                    {isLoading ? (
                                        <CircularLoader className="mr-2 h-4 w-4" />
                                    ) : (
                                        'Save Changes'
                                    )}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

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
