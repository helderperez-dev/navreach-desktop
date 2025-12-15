import { useDebugStore } from '@/stores/debug.store';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { X, Trash2, Bug, CheckCircle, AlertCircle, Info, Wrench, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';

export function DebugPanel() {
  const { logs, isDebugPanelOpen, toggleDebugPanel, clearLogs } = useDebugStore();
  const [copied, setCopied] = useState(false);

  if (!isDebugPanelOpen) return null;

  const copyLogs = async () => {
    const logsText = logs.map(log => {
      const time = log.timestamp.toLocaleTimeString('en-US', { 
        hour12: false, 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit' 
      });
      let text = `[${time}] [${log.type.toUpperCase()}]`;
      if (log.tool) text += ` ${log.tool}`;
      text += `: ${log.message}`;
      if (log.data) {
        text += `\n  Data: ${typeof log.data === 'string' ? log.data : JSON.stringify(log.data, null, 2)}`;
      }
      return text;
    }).join('\n\n');
    
    await navigator.clipboard.writeText(logsText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'tool':
        return <Wrench className="h-3 w-3 text-blue-400" />;
      case 'result':
        return <CheckCircle className="h-3 w-3 text-emerald-400" />;
      case 'error':
        return <AlertCircle className="h-3 w-3 text-red-400" />;
      default:
        return <Info className="h-3 w-3 text-muted-foreground" />;
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    });
  };

  return (
    <div className="w-80 h-full bg-background border-l border-border flex flex-col">
      <div className="h-12 px-3 flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-2">
          <Bug className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Debug Logs</span>
          <span className="text-xs text-muted-foreground">({logs.length})</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={copyLogs}
            title="Copy all logs"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={clearLogs}
            title="Clear logs"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={toggleDebugPanel}
            title="Close debug panel"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {logs.length === 0 ? (
            <div className="text-center text-xs text-muted-foreground py-8">
              No logs yet. Actions will appear here.
            </div>
          ) : (
            logs.map((log) => (
              <div
                key={log.id}
                className={cn(
                  "p-2 rounded text-xs font-mono",
                  log.type === 'error' && "bg-red-500/10 border border-red-500/20",
                  log.type === 'tool' && "bg-blue-500/10 border border-blue-500/20",
                  log.type === 'result' && "bg-emerald-500/10 border border-emerald-500/20",
                  log.type === 'info' && "bg-muted/50"
                )}
              >
                <div className="flex items-start gap-2">
                  {getIcon(log.type)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-foreground">
                        {log.tool || log.type.toUpperCase()}
                      </span>
                      <span className="text-muted-foreground text-[10px]">
                        {formatTime(log.timestamp)}
                      </span>
                    </div>
                    <div className="text-muted-foreground mt-0.5 break-words">
                      {log.message}
                    </div>
                    {log.data && (
                      <pre className="mt-1 p-1.5 bg-black/20 rounded text-[10px] overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap">
                        {typeof log.data === 'string' 
                          ? log.data.slice(0, 2000) 
                          : JSON.stringify(log.data, null, 2).slice(0, 2000)}
                        {(typeof log.data === 'string' ? log.data.length : JSON.stringify(log.data).length) > 2000 && '\n... (truncated)'}
                      </pre>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
