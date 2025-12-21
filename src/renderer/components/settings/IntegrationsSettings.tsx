import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Key, Shield, ExternalLink, RefreshCw, Check, Copy, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

export function IntegrationsSettings() {
    const [apiKey, setApiKey] = useState('');
    const [isCollectionEnabled, setIsCollectionEnabled] = useState(true);
    const [copied, setCopied] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [showKey, setShowKey] = useState(false);
    const apiUrl = import.meta.env.VITE_API_URL || 'https://navreach-web-app.vercel.app/api';

    useEffect(() => {
        const fetchApiKey = async () => {
            setIsLoading(true);
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('api_key, external_target_collection_enabled')
                        .eq('id', user.id)
                        .single();

                    if (profile) {
                        setApiKey(profile.api_key || '');
                        setIsCollectionEnabled(profile.external_target_collection_enabled || false);
                    }
                }
            } catch (error) {
                console.error('Error fetching API settings:', error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchApiKey();
    }, []);

    const handleGenerateKey = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const newKey = crypto.randomUUID();
        setApiKey(newKey);

        const { error } = await supabase
            .from('profiles')
            .update({ api_key: newKey })
            .eq('id', user.id);

        if (error) {
            toast.error('Failed to regenerate API Key');
            console.error(error);
        } else {
            toast.success('New API Key generated');
        }
    };

    const handleToggleCollection = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const newValue = !isCollectionEnabled;
        setIsCollectionEnabled(newValue);

        const { error } = await supabase
            .from('profiles')
            .update({ external_target_collection_enabled: newValue })
            .eq('id', user.id);

        if (error) {
            setIsCollectionEnabled(!newValue); // Rollback
            toast.error('Failed to update settings');
            console.error(error);
        } else {
            toast.success(`External collection ${newValue ? 'enabled' : 'disabled'}`);
        }
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(apiKey);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        toast.success('API Key copied to clipboard');
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div>
                <h3 className="text-lg font-medium text-white mb-1">API Integrations</h3>
                <p className="text-sm text-muted-foreground">Manage your credentials for external tools and agents.</p>
            </div>

            <div className="grid gap-6">
                {/* External Collection Toggle */}
                <div className="flex items-center justify-between p-6 rounded-2xl bg-white/5 border border-white/5">
                    <div className="flex gap-4">
                        <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                            <Shield className="h-6 w-6 text-blue-400" />
                        </div>
                        <div>
                            <h4 className="text-sm font-medium text-white mb-1">External Target Collection</h4>
                            <p className="text-xs text-muted-foreground max-w-sm">
                                Allow external scripts and the Navreach AI Agent to drop targets into your lists via the API.
                            </p>
                        </div>
                    </div>
                    <Button
                        variant={isCollectionEnabled ? "default" : "outline"}
                        className={isCollectionEnabled ? "bg-blue-600 hover:bg-blue-500" : ""}
                        onClick={handleToggleCollection}
                    >
                        {isCollectionEnabled ? "Enabled" : "Disabled"}
                    </Button>
                </div>

                {/* API Endpoint */}
                <div className="p-6 rounded-2xl bg-white/5 border border-white/5 space-y-4">
                    <div className="flex gap-4">
                        <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                            <ExternalLink className="h-6 w-6 text-blue-400" />
                        </div>
                        <div>
                            <h4 className="text-sm font-medium text-white mb-1">API Endpoint</h4>
                            <p className="text-xs text-muted-foreground">The base URL for all API requests.</p>
                        </div>
                    </div>
                    <div className="flex-1 bg-black/40 border border-white/5 rounded-xl px-4 py-3 font-mono text-sm text-blue-400">
                        {apiUrl}
                    </div>
                </div>

                {/* API Key Management */}
                <div className="p-6 rounded-2xl bg-white/5 border border-white/5 space-y-4">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex gap-4">
                            <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                                <Key className="h-6 w-6 text-purple-400" />
                            </div>
                            <div>
                                <h4 className="text-sm font-medium text-white mb-1">Secret API Key</h4>
                                <p className="text-xs text-muted-foreground">Used to authenticate requests to the external event endpoint.</p>
                            </div>
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs gap-2 hover:bg-white/5"
                            onClick={handleGenerateKey}
                        >
                            <RefreshCw className="h-3 w-3" />
                            Regenerate
                        </Button>
                    </div>

                    <div className="flex gap-2">
                        <div className="flex-1 bg-black/40 border border-white/5 rounded-xl px-4 py-3 font-mono text-sm text-gray-400 flex items-center justify-between">
                            {isLoading ? (
                                <div className="h-4 w-48 bg-white/5 rounded animate-pulse" />
                            ) : (
                                <>
                                    <span className="truncate">
                                        {showKey ? apiKey : '••••••••••••••••••••••••••••••••'}
                                    </span>
                                    <div className="flex items-center gap-3 ml-4 shrink-0">
                                        <button
                                            onClick={() => setShowKey(!showKey)}
                                            className="text-gray-500 hover:text-white transition-colors"
                                            title={showKey ? "Hide API Key" : "Show API Key"}
                                        >
                                            {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                        </button>
                                        <button
                                            onClick={handleCopy}
                                            className="text-gray-500 hover:text-blue-400 transition-colors"
                                            title="Copy API Key"
                                        >
                                            {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-2">
                        <InfoIcon className="h-3 w-3" />
                        Keep this key secret. Never share it or use it in client-side code.
                    </div>
                </div>

                {/* Documentation Link */}
                <div className="p-6 rounded-2xl border border-dashed border-white/10 flex items-center justify-between">
                    <div>
                        <h4 className="text-sm font-medium text-white mb-1">Developer Documentation</h4>
                        <p className="text-xs text-muted-foreground">View full API reference and integration guides.</p>
                    </div>
                    <Button variant="outline" size="sm" className="gap-2 border-white/5">
                        <ExternalLink className="h-3 w-3" />
                        API Docs
                    </Button>
                </div>
            </div>
        </div>
    );
}

function InfoIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
    )
}
