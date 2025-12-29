import { useState } from 'react';
import { ChevronDown, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ErrorMessageProps {
  error: string;
}

export function ErrorMessage({ error }: ErrorMessageProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Clean the error message to remove internal documentation/technical links
  // We want to hide things like LangChain troubleshooting, OpenRouter routing docs, etc.
  const cleanError = error
    .replace(/Troubleshooting URL:.*$/gi, '')
    .replace(/To learn more about.*visit:.*$/gi, '')
    .replace(/https?:\/\/(js\.langchain\.com|openrouter\.ai\/docs)[^\s]*/gi, '')
    .trim();

  return (
    <div className="w-full animate-in fade-in slide-in-from-top-2 duration-300">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="group/btn flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-destructive/70 hover:text-destructive hover:bg-destructive/5 transition-all duration-200"
      >
        <div className="flex items-center justify-center w-5 h-5 rounded-md bg-destructive/10 border border-destructive/20 group-hover/btn:border-destructive/40 transition-all">
          <ChevronDown className={cn('h-3 w-3 transition-transform duration-300', !isExpanded && '-rotate-90')} />
        </div>
        <ShieldAlert className="h-4 w-4 opacity-80" />
        <span className="tracking-tight">System Exception Details</span>
        {isExpanded ? (
          <span className="text-[10px] opacity-40 ml-auto uppercase tracking-widest font-bold">Hide</span>
        ) : (
          <span className="text-[10px] opacity-40 ml-auto uppercase tracking-widest font-bold">Details</span>
        )}
      </button>

      {isExpanded && (
        <div className="mt-2 mx-1">
          {/* Main Error Box */}
          <div className="px-4 py-3 rounded-xl bg-destructive/5 border border-destructive/10 text-[13px] text-destructive/80 font-mono leading-relaxed shadow-inner">
            <div className="flex items-start gap-3">
              <div className="w-1 h-full min-h-[1.5rem] bg-destructive/20 rounded-full shrink-0" />
              <span className="whitespace-pre-wrap break-words block flex-1 selection:bg-destructive/20">
                {cleanError || "An unexpected system error occurred during execution."}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
