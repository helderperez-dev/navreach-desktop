import { useState } from 'react';
import { ChevronDown, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ErrorMessageProps {
  error: string;
}

export function ErrorMessage({ error }: ErrorMessageProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="w-full">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-xs text-red-400/50 hover:text-red-400/70 transition-colors"
      >
        <ChevronDown className={cn('h-3 w-3 transition-transform', !isExpanded && '-rotate-90')} />
        <AlertCircle className="h-3 w-3" />
        <span>Error occurred</span>
      </button>
      {isExpanded && (
        <div className="mt-2 ml-5 px-3 py-2 rounded-lg bg-red-950/20 border border-red-900/30 text-xs text-red-400/70 font-mono">
          <span className="whitespace-pre-wrap break-words">{error}</span>
        </div>
      )}
    </div>
  );
}
