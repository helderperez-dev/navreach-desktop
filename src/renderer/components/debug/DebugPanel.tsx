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
        <div className="p-3 space-y-3">
          {logs.length === 0 ? (
            <div className="text-center text-xs text-muted-foreground py-12 opacity-50 italic">
              No logs yet. Actions will appear here.
            </div>
          ) : (
            logs.map((log) => (
              <div
                key={log.id}
                className={cn(
                  "p-3.5 rounded-xl text-xs font-mono transition-all border shadow-sm",
                  log.type === 'error' && "bg-red-500/10 border-red-500/20 shadow-red-500/5",
                  log.type === 'tool' && "bg-blue-500/10 border-blue-500/20 shadow-blue-500/5",
                  log.type === 'result' && "bg-emerald-500/10 border-emerald-500/20 shadow-emerald-500/5",
                  log.type === 'info' && "bg-muted/30 border-border/50"
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 shrink-0">
                    {getIcon(log.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className={cn(
                        "font-bold uppercase tracking-tight text-[10px]",
                        log.type === 'error' && "text-red-400",
                        log.type === 'tool' && "text-blue-400",
                        log.type === 'result' && "text-emerald-400",
                        log.type === 'info' && "text-muted-foreground"
                      )}>
                        {log.tool || log.type}
                      </span>
                      <span className="text-muted-foreground/40 text-[9px] font-medium">
                        {formatTime(log.timestamp)}
                      </span>
                    </div>
                    <div className="text-foreground/90 leading-relaxed break-all select-text">
                      {log.message}
                    </div>
                    {log.data && (
                      <pre className="mt-2.5 p-2 bg-black/40 rounded-lg text-[10px] max-h-64 overflow-y-auto whitespace-pre-wrap break-all custom-scrollbar border border-white/5 text-muted-foreground/80">
                        {typeof log.data === 'string'
                          ? log.data.slice(0, 3000)
                          : JSON.stringify(log.data, null, 2).slice(0, 3000)}
                        {(typeof log.data === 'string' ? log.data.length : JSON.stringify(log.data).length) > 3000 && '\n... (truncated for performance)'}
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
