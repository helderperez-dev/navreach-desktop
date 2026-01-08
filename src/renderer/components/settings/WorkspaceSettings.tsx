import { useState, useEffect } from 'react';
import { useWorkspaceStore } from '@/stores/workspace.store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { useSettingsStore } from '@/stores/settings.store';
import { Wrench, Server } from 'lucide-react';

export function WorkspaceSettings() {
    const { currentWorkspace, updateWorkspace } = useWorkspaceStore();
    const { apiTools, mcpServers, loadSettings } = useSettingsStore();
    const [name, setName] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        loadSettings();
    }, []);

    useEffect(() => {
        if (currentWorkspace) {
            setName(currentWorkspace.name);
        }
    }, [currentWorkspace]);

    if (!currentWorkspace) {
        return (
            <div className="flex items-center justify-center h-full text-muted-foreground">
                No workspace selected.
            </div>
        );
    }

    const handleSave = async () => {
        if (!name.trim() || !currentWorkspace) return;
        setIsSaving(true);
        try {
            await updateWorkspace(currentWorkspace.id, { name });
        } finally {
            setIsSaving(false);
        }
    };

    const toggleTool = async (toolId: string, enabled: boolean) => {
        if (!currentWorkspace) return;
        const disabledTools = currentWorkspace.settings?.disabledTools || [];
        const newDisabledTools = enabled
            ? disabledTools.filter(id => id !== toolId)
            : [...disabledTools, toolId];

        await updateWorkspace(currentWorkspace.id, {
            settings: {
                ...currentWorkspace.settings,
                disabledTools: newDisabledTools
            }
        });
    };

    const toggleMCPServer = async (serverId: string, enabled: boolean) => {
        if (!currentWorkspace) return;
        const disabledServers = currentWorkspace.settings?.disabledMCPServers || [];
        const newDisabledServers = enabled
            ? disabledServers.filter(id => id !== serverId)
            : [...disabledServers, serverId];

        await updateWorkspace(currentWorkspace.id, {
            settings: {
                ...currentWorkspace.settings,
                disabledMCPServers: newDisabledServers
            }
        });
    };

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-medium">Workspace Settings</h3>
                <p className="text-sm text-muted-foreground">
                    Manage your workspace preferences and details.
                </p>
            </div>
            <Separator />

            <Card>
                <CardHeader>
                    <CardTitle>Display Name</CardTitle>
                    <CardDescription>
                        This is the name of your workspace visible to you and other members.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-2">
                        <Label htmlFor="workspace-name">Workspace Name</Label>
                        <Input
                            id="workspace-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="My Workspace"
                        />
                    </div>
                </CardContent>
                <CardFooter className="border-t px-6 py-4">
                    <Button onClick={handleSave} disabled={isSaving || name === currentWorkspace.name}>
                        {isSaving ? 'Saving...' : 'Save Changes'}
                    </Button>
                </CardFooter>
            </Card>

            <Card>
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <Wrench className="h-5 w-5 text-muted-foreground/70" />
                        <CardTitle>API Tools</CardTitle>
                    </div>
                    <CardDescription>
                        Select which API tools are available to the agent in this workspace.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {apiTools.length === 0 ? (
                        <p className="text-sm text-muted-foreground italic">No tools configured in global settings.</p>
                    ) : (
                        apiTools.map((tool) => {
                            const isEnabled = !currentWorkspace.settings?.disabledTools?.includes(tool.id);
                            return (
                                <div key={tool.id} className="flex items-center justify-between py-2">
                                    <div className="space-y-0.5">
                                        <div className="text-sm font-medium">{tool.name}</div>
                                        <div className="text-xs text-muted-foreground truncate max-w-[400px]">
                                            {tool.description || 'No description'}
                                        </div>
                                    </div>
                                    <Switch
                                        checked={isEnabled}
                                        onCheckedChange={(checked) => toggleTool(tool.id, checked)}
                                    />
                                </div>
                            );
                        })
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <Server className="h-5 w-5 text-muted-foreground/70" />
                        <CardTitle>MCP Servers</CardTitle>
                    </div>
                    <CardDescription>
                        Enable or disable Model Context Protocol servers for this workspace.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {mcpServers.length === 0 ? (
                        <p className="text-sm text-muted-foreground italic">No MCP servers configured globally.</p>
                    ) : (
                        mcpServers.map((server) => {
                            const isEnabled = !currentWorkspace.settings?.disabledMCPServers?.includes(server.id);
                            return (
                                <div key={server.id} className="flex items-center justify-between py-2">
                                    <div className="space-y-0.5">
                                        <div className="text-sm font-medium">{server.name}</div>
                                        <div className="text-xs text-muted-foreground">
                                            {server.type} · {server.type === 'stdio' ? (server.config as any).command : (server.config as any).url}
                                        </div>
                                    </div>
                                    <Switch
                                        checked={isEnabled}
                                        onCheckedChange={(checked) => toggleMCPServer(server.id, checked)}
                                    />
                                </div>
                            );
                        })
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Workspace ID</CardTitle>
                    <CardDescription>
                        Unique identifier for this workspace. Used for API integrations or debugging.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center space-x-2">
                        <code className="relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold text-muted-foreground">
                            {currentWorkspace.id}
                        </code>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
