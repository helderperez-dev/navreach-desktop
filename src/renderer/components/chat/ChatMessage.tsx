import { Copy, Check, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { Message } from '@shared/types';

interface ChatMessageProps {
  message: Message;
}

function parseToolMessages(content: string) {
  const lines = content.split('\n');
  const parts: { type: 'text' | 'tool' | 'success' | 'error'; content: string }[] = [];
  let currentText = '';

  for (const line of lines) {
    if (line.startsWith('🔧 Using tool:')) {
      if (currentText.trim()) {
        parts.push({ type: 'text', content: currentText.trim() });
        currentText = '';
      }
      parts.push({ type: 'tool', content: line.replace('🔧 Using tool:', '').trim() });
    } else if (line.startsWith('✅')) {
      // Don't save the success message as text, just mark it
      if (currentText.trim()) {
        parts.push({ type: 'text', content: currentText.trim() });
        currentText = '';
      }
      parts.push({ type: 'success', content: line.replace('✅', '').trim() });
    } else if (line.startsWith('❌')) {
      if (currentText.trim()) {
        parts.push({ type: 'text', content: currentText.trim() });
        currentText = '';
      }
      parts.push({ type: 'error', content: line.replace('❌', '').trim() });
    } else if (line.trim()) {
      // Only add non-empty lines to text
      currentText += line + '\n';
    }
  }

  // Important: Always check for remaining text at the end (this is the AI's final response)
  if (currentText.trim()) {
    parts.push({ type: 'text', content: currentText.trim() });
  }

  return parts;
}

// Tool name aliases for user-friendly display
const toolAliases: Record<string, string> = {
  'browser_navigate': 'Navigated',
  'browser_click': 'Clicked',
  'browser_click_at': 'Clicked',
  'browser_type': 'Typed',
  'browser_scroll': 'Scrolled',
  'browser_snapshot': 'Snapshot',
  'browser_get_page_content': 'Read page',
  'browser_extract': 'Extracted content',
  'browser_go_back': 'Went back',
  'browser_go_forward': 'Went forward',
  'browser_reload': 'Reloaded',
  'browser_wait': 'Waited',
  'browser_find_elements': 'Found elements',
  'browser_get_accessibility_tree': 'Analyzed page',
  'browser_hover': 'Hovered',
  'x_search': 'X search',
  'x_like': 'X like',
  'x_reply': 'X reply',
  'x_post': 'X post',
  'x_follow': 'X follow',
};

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);
  const [toolsExpanded, setToolsExpanded] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const messageParts = !isUser ? parseToolMessages(message.content) : [];
  const hasOnlyToolMessages = messageParts.length > 0 && messageParts.every(p => p.type !== 'text');
  const textParts = messageParts.filter(p => p.type === 'text');
  const toolParts = messageParts.filter(p => p.type !== 'text');
  
  const toolActions = toolParts.filter(p => p.type === 'tool').map(p => toolAliases[p.content] || p.content);

  return (
    <div className={cn('group px-3 py-2')}>
      <div className={cn('flex', isUser && 'justify-end')}>
        <div className={cn('space-y-2', isUser && 'flex flex-col items-end')}>
          {isUser ? (
            <div className="inline-block px-4 py-2.5 rounded-2xl bg-secondary text-muted-foreground text-sm leading-relaxed">
              <span className="whitespace-pre-wrap break-words">{message.content}</span>
            </div>
          ) : (
            <>
              {toolActions.length > 0 && (
                <div className="w-full">
                  <button
                    onClick={() => setToolsExpanded(!toolsExpanded)}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors"
                  >
                    <ChevronDown className={cn('h-3 w-3 transition-transform', !toolsExpanded && '-rotate-90')} />
                    <Check className="h-3 w-3 text-emerald-500/70" />
                    <span>{toolActions.length} action{toolActions.length > 1 ? 's' : ''}</span>
                  </button>
                  {toolsExpanded && (
                    <div className="mt-1 pl-5 space-y-0.5">
                      {toolActions.map((action, i) => (
                        <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground/60">
                          <Check className="h-3 w-3 text-emerald-500/60" />
                          <span className="font-mono text-[11px]">{action}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {textParts.length > 0 && (
                <div className="inline-block px-4 py-2.5 rounded-2xl bg-[#2a2a2d] text-gray-100 text-sm leading-relaxed max-w-[90%] border border-white/5">
                  <span className="whitespace-pre-wrap break-words">
                    {textParts.map(p => p.content).join('\n')}
                  </span>
                </div>
              )}
              {!hasOnlyToolMessages && textParts.length === 0 && toolParts.length === 0 && (
                <div className="inline-block px-4 py-2.5 rounded-2xl bg-[#2a2a2d] text-gray-100 text-sm leading-relaxed max-w-[90%] border border-white/5">
                  <span className="whitespace-pre-wrap break-words">{message.content}</span>
                </div>
              )}
            </>
          )}
          {!isUser && textParts.length > 0 && (
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={handleCopy}
                className="p-1.5 rounded-md hover:bg-white/5 text-gray-500 hover:text-gray-300 transition-colors"
                title="Copy message"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-green-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
