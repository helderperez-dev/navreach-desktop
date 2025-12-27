import { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Copy, Check, Info, Code2, Eye, EyeOff, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { supabase } from '@/lib/supabase';

interface IntegrationDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    listId: string;
}

type Language = 'curl' | 'python' | 'javascript' | 'typescript' | 'go' | 'ruby' | 'php';

export function IntegrationDialog({ open, onOpenChange, listId }: IntegrationDialogProps) {
    const [copied, setCopied] = useState(false);
    const [selectedLang, setSelectedLang] = useState<Language>('curl');
    const [showApiKey, setShowApiKey] = useState(false);
    const [userApiKey, setUserApiKey] = useState<string>('');
    const [isCollectionEnabled, setIsCollectionEnabled] = useState(true);

    useEffect(() => {
        const fetchApiKey = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('api_key, external_target_collection_enabled')
                        .eq('id', user.id)
                        .single();

                    if (profile) {
                        setUserApiKey(profile.api_key || '');
                        setIsCollectionEnabled(profile.external_target_collection_enabled || false);

                        if (!profile.api_key) {
                            // Generate a new UUID-compliant API key if none exists
                            const newKey = crypto.randomUUID();
                            setUserApiKey(newKey);

                            await supabase
                                .from('profiles')
                                .update({ api_key: newKey })
                                .eq('id', user.id);
                        }
                    }
                }
            } catch (error) {
                console.error('Error fetching API settings in dialog:', error);
            }
        };

        if (open) {
            fetchApiKey();
        }
    }, [open]);

    const reavionApiUrl = import.meta.env.VITE_API_URL || 'https://reavion-web-app.vercel.app/api';
    const apiKey = showApiKey ? userApiKey : '••••••••••••••••';

    const snippets: Record<Language, { code: string; language: string }> = {
        curl: {
            language: 'bash',
            code: `curl -X POST "${reavionApiUrl}/targets/event" \\
  -H "x-api-key: ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "list_id": "${listId}",
    "name": "Target Name",
    "url": "https://example.com/profile",
    "type": "x_profile",
    "tags": ["lead", "automation"],
    "metadata": {
      "company": "Acme Inc"
    }
  }'`
        },
        python: {
            language: 'python',
            code: `import requests

url = "${reavionApiUrl}/targets/event"
headers = {
    "x-api-key": "${apiKey}",
    "Content-Type": "application/json"
}

payload = {
    "list_id": "${listId}",
    "name": "John Doe",
    "url": "https://x.com/johndoe",
    "type": "x_profile",
    "tags": ["lead"],
    "metadata": {"company": "Acme Inc"}
}

response = requests.post(url, headers=headers, json=payload)
print(response.json())`
        },
        javascript: {
            language: 'javascript',
            code: `fetch("${reavionApiUrl}/targets/event", {
  method: "POST",
  headers: {
    "x-api-key": "${apiKey}",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    list_id: "${listId}",
    name: "Jane Smith",
    url: "https://linkedin.com/in/janesmith",
    type: "x_profile",
    tags: ["lead"],
    metadata: { company: "Acme Inc" }
  })
})
.then(res => res.json())
.then(data => console.log(data));`
        },
        typescript: {
            language: 'typescript',
            code: `interface Target {
  list_id: string;
  name: string;
  url: string;
  type: string;
  tags: string[];
  metadata: Record<string, any>;
}

const createTarget = async (target: Target) => {
  const response = await fetch("${reavionApiUrl}/targets/event", {
    method: "POST",
    headers: {
      "x-api-key": "${apiKey}",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(target)
  });
  return response.json();
};

await createTarget({
  list_id: "${listId}",
  name: "Alex Johnson",
  url: "https://github.com/alexj",
  type: "x_profile",
  tags: ["developer"],
  metadata: { company: "Tech Corp" }
});`
        },
        go: {
            language: 'go',
            code: `package main

import (
    "bytes"
    "encoding/json"
    "fmt"
    "net/http"
)

func main() {
    url := "${reavionApiUrl}/targets/event"
    
    payload := map[string]interface{}{
        "list_id": "${listId}",
        "name": "Sarah Chen",
        "url": "https://x.com/sarahchen",
        "type": "x_profile",
        "tags": []string{"lead"},
        "metadata": map[string]string{"company": "Acme Inc"},
    }
    
    jsonData, _ := json.Marshal(payload)
    req, _ := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
    req.Header.Set("x-api-key", "${apiKey}")
    req.Header.Set("Content-Type", "application/json")
    
    client := &http.Client{}
    resp, _ := client.Do(req)
    defer resp.Body.Close()
    
    fmt.Println("Status:", resp.Status)
}`
        },
        ruby: {
            language: 'ruby',
            code: `require 'net/http'
require 'json'

uri = URI('${reavionApiUrl}/targets/event')
http = Net::HTTP.new(uri.host, uri.port)
http.use_ssl = true

request = Net::HTTP::Post.new(uri.path)
request['x-api-key'] = '${apiKey}'
request['Content-Type'] = 'application/json'

request.body = {
  list_id: '${listId}',
  name: 'Mike Ross',
  url: 'https://x.com/mikeross',
  type: 'x_profile',
  tags: ['lead'],
  metadata: { company: 'Acme Inc' }
}.to_json

response = http.request(request)
puts JSON.parse(response.body)`
        },
        php: {
            language: 'php',
            code: `<?php
$url = '${reavionApiUrl}/targets/event';
$data = [
    'list_id' => '${listId}',
    'name' => 'Emma Watson',
    'url' => 'https://x.com/emmawatson',
    'type' => 'x_profile',
    'tags' => ['lead'],
    'metadata' => ['company' => 'Acme Inc']
];

$options = [
    'http' => [
        'header' => [
            "x-api-key: ${apiKey}",
            "Content-Type: application/json"
        ],
        'method' => 'POST',
        'content' => json_encode($data)
    ]
];

$context = stream_context_create($options);
$result = file_get_contents($url, false, $context);
echo $result;
?>`
        }
    };

    const languages: { id: Language; label: string }[] = [
        { id: 'curl', label: 'cURL' },
        { id: 'python', label: 'Python' },
        { id: 'javascript', label: 'JavaScript' },
        { id: 'typescript', label: 'TypeScript' },
        { id: 'go', label: 'Go' },
        { id: 'ruby', label: 'Ruby' },
        { id: 'php', label: 'PHP' }
    ];

    const handleCopy = () => {
        navigator.clipboard.writeText(snippets[selectedLang].code);
        setCopied(true);
        toast.success('Copied to clipboard');
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 animate-in fade-in duration-200" />
                <Dialog.Content className="fixed left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] w-full max-w-3xl h-[600px] bg-popover border border-border p-8 rounded-3xl shadow-2xl z-50 animate-in zoom-in-95 duration-200 flex flex-col">
                    <div className="flex items-center justify-between mb-6 flex-shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                <Code2 className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                                <Dialog.Title className="text-xl font-semibold text-foreground">
                                    API Integration
                                </Dialog.Title>
                                <p className="text-xs text-muted-foreground mt-0.5">Send targets to this list programmatically</p>
                            </div>
                        </div>
                        <Dialog.Close asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-muted rounded-full">
                                <X className="h-4 w-4" />
                            </Button>
                        </Dialog.Close>
                    </div>

                    <div className="flex-1 flex flex-col overflow-hidden space-y-4">
                        <div className="bg-primary/5 border border-primary/10 rounded-xl p-4 flex gap-3 text-sm text-primary/80 flex-shrink-0">
                            <Info className="h-5 w-5 text-primary flex-shrink-0" />
                            <p>
                                You can use these snippets to automatically add targets from external scrapers, browser extensions, or custom tools.
                            </p>
                        </div>

                        {!isCollectionEnabled && (
                            <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4 flex gap-3 text-sm text-orange-600/80 dark:text-orange-200/80 flex-shrink-0">
                                <ShieldAlert className="h-5 w-5 text-orange-500 flex-shrink-0" />
                                <div className="flex-1">
                                    <p className="font-medium text-orange-600 dark:text-orange-400">External collection is disabled</p>
                                    <p className="mt-1 text-xs">Requests to the API will fail until you enable this in your Integrations Settings.</p>
                                </div>
                            </div>
                        )}

                        {/* Code Window with Tabs */}
                        <div className="flex-1 flex flex-col overflow-hidden space-y-3">
                            <div className="flex items-center justify-between flex-shrink-0">
                                <div className="flex gap-1 bg-muted p-1 rounded-xl border border-border overflow-x-auto">
                                    {languages.map((lang) => (
                                        <button
                                            key={lang.id}
                                            onClick={() => setSelectedLang(lang.id)}
                                            className={cn(
                                                "px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap",
                                                selectedLang === lang.id
                                                    ? "bg-primary/20 text-primary shadow-sm"
                                                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                                            )}
                                        >
                                            {lang.label}
                                        </button>
                                    ))}
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setShowApiKey(!showApiKey)}
                                        className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-muted"
                                        title={showApiKey ? "Hide API Key" : "Show API Key"}
                                    >
                                        {showApiKey ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                                        {showApiKey ? 'Hide Key' : 'Show Key'}
                                    </button>
                                    <button
                                        onClick={handleCopy}
                                        className="text-xs text-primary hover:text-primary/80 transition-colors flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-muted"
                                    >
                                        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                                        {copied ? 'Copied' : 'Copy'}
                                    </button>
                                </div>
                            </div>

                            <div className="flex-1 overflow-hidden rounded-2xl border border-border">
                                <SyntaxHighlighter
                                    language={snippets[selectedLang].language}
                                    style={vscDarkPlus}
                                    customStyle={{
                                        margin: 0,
                                        height: '100%',
                                        background: 'rgba(0, 0, 0, 0.4)',
                                        fontSize: '11px',
                                        padding: '16px',
                                    }}
                                    showLineNumbers={false}
                                    wrapLines={true}
                                >
                                    {snippets[selectedLang].code}
                                </SyntaxHighlighter>
                            </div>
                        </div>

                        <div className="text-center flex-shrink-0">
                            <p className="text-[10px] text-muted-foreground">
                                List ID: <code className="text-primary/80">{listId}</code>
                            </p>
                        </div>
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
