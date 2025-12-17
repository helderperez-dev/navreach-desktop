import { Copy, Check, ChevronDown, ChevronRight, Square, RotateCcw, Terminal, Activity, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';
import type { Message } from '@shared/types';
import { ErrorMessage } from '@/components/ui/ErrorMessage';

interface ChatMessageProps {
  message: Message;
  onRetry?: (content: string) => void;
}

// Helper to structure the message content into logical blocks
// We want to group: Thinking Process -> Tool Executions -> Final Answer
function parseMessageContent(content: string) {
  const lines = content.split('\n');
  const blocks: { type: 'text' | 'tool-group' | 'error' | 'thought'; content: string; title?: string; status?: 'running' | 'success' | 'failed'; duration?: string; result?: string; params?: string }[] = [];

  let currentBlock: any = null;

  for (const line of lines) {
    // Check for Tool Execution Start - catch 🔧 or "Executing:"
    const execMatch = line.match(/^(?:🔧\s*)?(?:Using tool:|Executing:)\s*(\w+)/);
    if (execMatch) {
      // If we were building a text block, push it
      if (currentBlock && currentBlock.type === 'text') {
        blocks.push(currentBlock);
        currentBlock = null;
      }

      const toolName = execMatch[1];
      // Start a new tool group
      currentBlock = {
        type: 'tool-group',
        content: toolName,
        title: toolAliases[toolName] || toolName,
        status: 'running',
        params: '',
        result: ''
      };
      blocks.push(currentBlock);
      continue;
    }

    // Check for Tool Completion/Status - catch ✅/❌ or "Success"/"Error"
    const statusMatch = line.match(/^(?:✅|❌|Success|Completed|Error)\s*(?:\(([\d.]+)s\))?/);
    if (statusMatch) {
      const isError = line.startsWith('❌') || line.startsWith('Error');
      const duration = statusMatch[1];

      // Find the last tool block to update
      const lastTool = [...blocks].reverse().find(b => b.type === 'tool-group');

      if (lastTool) {
        lastTool.status = isError ? 'failed' : 'success';
        if (duration) lastTool.duration = duration;
      }
      // Do not treat this line as text content
      continue;
    }

    // Explicit thought block
    if (line.trim().startsWith('Thinking:')) {
      if (currentBlock && currentBlock.type !== 'thought') {
        // Close current text block if open
        if (currentBlock.type === 'text') {
          blocks.push(currentBlock);
          currentBlock = null; // Will start new thought block
        }
      }

      if (!currentBlock || currentBlock.type !== 'thought') {
        currentBlock = { type: 'thought', content: line.replace('Thinking:', '').trim() + '\n' };
        blocks.push(currentBlock);
      } else {
        currentBlock.content += line.replace('Thinking:', '').trim() + '\n';
      }
      continue;
    }

    // Skip purely structural/emoji lines if they haven't been caught yet to avoid noise
    if (line.trim().match(/^[🔧✅❌⚠️]/)) {
      continue;
    }

    // Aggressively skip snapshot/technical dump lines
    // These are lines that contain selector info or long lists of UI elements
    const isSnapshotDump =
      line.includes('selector: [') ||
      line.includes('Buttons: 0:') ||
      line.includes('Interactive Elements:') ||
      line.match(/^\d+:\s.*selector:/);

    if (isSnapshotDump) {
      continue;
    }

    // Normal Line Processing
    if (currentBlock) {
      if (currentBlock.type === 'tool-group') {
        // If the tool already has a status (Success/Completed/Error), line goes to result
        if (currentBlock.status !== 'running') {
          // Only add to result if it's NOT a snapshot dump (extra safety)
          if (!isSnapshotDump) {
            currentBlock.result = (currentBlock.result || '') + line + '\n';
          }
        } else {
          // Otherwise it's params
          currentBlock.params = (currentBlock.params || '') + line + '\n';
        }
      } else {
        currentBlock.content += line + '\n';
      }
    } else {
      // Start new text block - ensure we don't start with empty lines
      if (line.trim()) {
        currentBlock = { type: 'text', content: line + '\n' };
        blocks.push(currentBlock);
      }
    }
  }
  return blocks;
}

// Tool name aliases for user-friendly display
const toolAliases: Record<string, string> = {
  'browser_navigate': 'Navigating',
  'browser_click': 'Clicking Element',
  'browser_click_at': 'Clicking Position',
  'browser_type': 'Typing Text',
  'browser_scroll': 'Scrolling',
  'browser_snapshot': 'Taking Snapshot',
  'browser_get_page_content': 'Reading Page',
  'browser_extract': 'Extracting Data',
  'browser_go_back': 'Going Back',
  'browser_go_forward': 'Going Forward',
  'browser_reload': 'Reloading',
  'browser_wait': 'Waiting',
  'browser_find_elements': 'Locating Elements',
  'browser_get_accessibility_tree': 'Analyzing Page Structure',
  'browser_hover': 'Hovering',
  'x_search': 'Searching X',
  'x_like': 'Liking Post',
  'x_reply': 'Replying',
  'x_post': 'Posting',
  'x_follow': 'Following User',
  'unknown_tool': 'Running Action'
};

function StructuredToolCard({ toolCall, toolResult }: { toolCall: any; toolResult?: any }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const status = toolResult ? (toolResult.error ? 'failed' : 'success') : 'running';
  const isSuccess = status === 'success';
  const isFailed = status === 'failed';

  // Extract duration if available in result metadata (custom field we added)
  const duration = toolResult?.result?._duration ? (toolResult.result._duration / 1000).toFixed(1) + 's' : undefined;

  // Format result message
  let resultDisplay = '';
  if (toolResult) {
    if (toolResult.error) {
      resultDisplay = typeof toolResult.error === 'string' ? toolResult.error : JSON.stringify(toolResult.error, null, 2);
    } else {
      // Check for message or direct result
      const res = toolResult.result;
      if (res && typeof res === 'object') {
        if (res.message) resultDisplay = res.message;
        else resultDisplay = JSON.stringify(res, null, 2);
      } else {
        resultDisplay = String(res);
      }
    }
  }

  // Detect snapshot images or complex data to hide/format
  const isSnapshot = toolCall.name === 'browser_snapshot';

  return (
    <div className="my-0.5 rounded-lg border border-white/5 bg-[#1e1e20] overflow-hidden transition-all duration-200">
      {/* Header - Always Visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors text-left"
      >
        <div className={cn(
          "flex items-center justify-center w-6 h-6 rounded-md border text-xs shadow-sm",
          isSuccess ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500" :
            isFailed ? "bg-red-500/10 border-red-500/20 text-red-500" :
              "bg-blue-500/10 border-blue-500/20 text-blue-400"
        )}>
          {isSuccess ? <Check className="h-3.5 w-3.5" /> :
            isFailed ? <AlertCircle className="h-3.5 w-3.5" /> :
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
          }
        </div>

        <div className="flex items-center gap-3 min-w-0 flex-1">
          <span className={cn(
            "font-medium text-[13px] truncate",
            isSuccess ? "text-gray-300" :
              isFailed ? "text-red-300" :
                "text-blue-300"
          )}>
            {toolAliases[toolCall.name] || toolCall.name}
          </span>

          {/* Quick info preview if collapsed */}
          {!isExpanded && !isSnapshot && resultDisplay && !resultDisplay.trim().startsWith('{') && !resultDisplay.trim().startsWith('[') && (
            <span className="text-xs text-muted-foreground/60 truncate max-w-[200px] hidden sm:block">
              {resultDisplay.replace(/\n.*/s, '')}
            </span>
          )}

          {duration && (
            <span className="text-[10px] text-muted-foreground ml-auto font-mono opacity-70">
              {duration}
            </span>
          )}
        </div>

        {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/50" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />}
      </button>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="px-3 py-3 border-t border-white/5 bg-black/20 text-xs font-mono space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
          {/* Input Arguments */}
          {toolCall.arguments && Object.keys(toolCall.arguments).length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-gray-500 mb-1.5 font-semibold">
                <Terminal className="h-3 w-3" /> Input
              </div>
              <div className="bg-[#151517] rounded border border-white/5 p-2 text-gray-400 overflow-x-auto">
                <pre>{JSON.stringify(toolCall.arguments, null, 2)}</pre>
              </div>
            </div>
          )}

          {/* Output Result */}
          {resultDisplay && (
            <div>
              <div className={cn(
                "flex items-center gap-1.5 text-[10px] uppercase tracking-wider mb-1.5 font-semibold",
                isFailed ? "text-red-500/50" : "text-emerald-500/50"
              )}>
                {isFailed ? <AlertCircle className="h-3 w-3" /> : <Activity className="h-3 w-3" />}
                {isFailed ? 'Error' : 'Output'}
              </div>
              <div className={cn(
                "rounded border p-2 overflow-x-auto whitespace-pre-wrap max-h-[300px] overflow-y-auto custom-scrollbar",
                isFailed ? "bg-red-950/20 border-red-500/20 text-red-300/90" : "bg-[#151517] border-white/5 text-gray-400"
              )}>
                {resultDisplay}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ChatMessage({ message, onRetry }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const [copied, setCopied] = useState(false);
  // Default expanded for critical info, collapsed for dense logs
  const [expandedThoughts, setExpandedThoughts] = useState(false);

  // System messages
  if (isSystem) {
    return (
      <div className="flex justify-center my-4">
        <div className="bg-muted/30 border border-muted/50 rounded-full px-4 py-1.5 flex items-center gap-2 text-xs text-muted-foreground">
          <Square className="h-3 w-3" />
          <span>System: {message.content}</span>
        </div>
      </div>
    );
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const hasStructuredTools = message.toolCalls && message.toolCalls.length > 0;
  // If use legacy parsing:
  const blocks = (!isUser && !hasStructuredTools) ? parseMessageContent(message.content) : [];

  return (
    <div className={cn(
      'group relative px-4 py-2 transition-colors duration-200',
      isUser ? 'bg-transparent' : 'bg-transparent'
    )}>
      <div className={cn('max-w-2xl mx-auto flex', isUser ? 'flex-row-reverse' : 'flex-row')}>

        {/* Content Body */}
        <div className={cn('flex-1 min-w-0 space-y-2', isUser && 'text-right')}>

          {isUser ? (
            <div className="inline-block bg-secondary/80 hover:bg-secondary text-secondary-foreground px-4 py-2.5 rounded-2xl rounded-tr-sm text-sm leading-relaxed shadow-sm border border-white/5 mx-0 text-left">
              <div className="whitespace-pre-wrap">{message.content}</div>
            </div>
          ) : (
            <>
              {/* 1. Structured Tool Executions (New Way) */}
              {hasStructuredTools && (
                <div className="space-y-1 my-1">
                  {message.toolCalls!.map((toolCall) => {
                    const result = message.toolResults?.find((r) => r.toolCallId === toolCall.id);
                    return <StructuredToolCard key={toolCall.id} toolCall={toolCall} toolResult={result} />;
                  })}
                </div>
              )}

              {/* 2. Text Content (Narration or Answer) with Markdown */}
              {hasStructuredTools && message.content && message.content.trim() && (
                <div className="prose prose-invert prose-sm max-w-none text-gray-300 leading-relaxed text-left">
                  <ReactMarkdown
                    components={{
                      p: ({ children }) => <p className="mb-3 last:mb-0 transform-gpu">{children}</p>,
                      ul: ({ children }) => <ul className="list-disc pl-5 mb-3 space-y-1 text-gray-400">{children}</ul>,
                      ol: ({ children }) => <ol className="list-decimal pl-5 mb-3 space-y-1 text-gray-400">{children}</ol>,
                      li: ({ children }) => <li className="pl-1">{children}</li>,
                      strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
                      code: ({ children }) => <code className="bg-white/10 px-1.5 py-0.5 rounded text-[13px] font-mono text-indigo-300 border border-white/5">{children}</code>,
                      pre: ({ children }) => <pre className="bg-[#1e1e20] p-3 rounded-lg border border-white/5 overflow-x-auto my-3 text-xs font-mono shadow-inner">{children}</pre>,
                      a: ({ href, children }) => <a href={href} className="text-indigo-400 hover:text-indigo-300 hover:underline decoration-indigo-400/30 underline-offset-4 transition-colors" target="_blank" rel="noopener noreferrer">{children}</a>,
                      blockquote: ({ children }) => <blockquote className="border-l-2 border-indigo-500/50 pl-4 py-1 my-3 italic text-gray-500">{children}</blockquote>,
                    }}
                  >
                    {message.content.trim()}
                  </ReactMarkdown>
                </div>
              )}

              {/* 3. Logical Blocks (Legacy Support) */}
              {blocks.map((block, idx) => {
                if (block.type === 'thought') {
                  return (
                    <div key={idx} className="bg-muted/5 rounded-lg border border-white/5 overflow-hidden my-2">
                      <button
                        onClick={() => setExpandedThoughts(!expandedThoughts)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-white/5 transition-colors text-left"
                      >
                        <Activity className="h-3.5 w-3.5" />
                        <span>Thinking Process</span>
                        {expandedThoughts ? <ChevronDown className="h-3.5 w-3.5 ml-auto" /> : <ChevronRight className="h-3.5 w-3.5 ml-auto" />}
                      </button>
                      {expandedThoughts && (
                        <div className="px-3 py-2 bg-black/20 text-xs text-muted-foreground border-t border-white/5 font-mono leading-relaxed whitespace-pre-wrap">
                          {block.content}
                        </div>
                      )}
                    </div>
                  );
                }

                if (block.type === 'tool-group') {
                  // We can't use useState inside map!
                  // The previous code had useState inside map! 
                  // "const [isExpanded, setIsExpanded] = useState(false);" was inside map callback!
                  // That is a violation of Rules of Hooks. It probably "worked" if order didn't change, but it's bad.
                  // I should refactor this to a component.
                  return <LegacyToolGroup key={idx} block={block} />;
                }

                if (block.type === 'error') {
                  return (
                    <div key={idx} className="mt-1 text-left">
                      <ErrorMessage error={block.content} />
                    </div>
                  );
                }

                if (block.type === 'text') {
                  // Clean up raw log garbage if mixed in - extra safety
                  const cleanContent = block.content
                    .replace(/^(?:🔧|✅|❌|Executing:|Success|Completed|Error).*$/gm, '')
                    .trim();

                  if (!cleanContent) return null;

                  return (
                    <div key={idx} className="prose prose-invert prose-sm max-w-none text-gray-300 leading-relaxed text-left">
                      <ReactMarkdown
                        components={{
                          p: ({ children }) => <p className="mb-3 last:mb-0 transform-gpu">{children}</p>,
                          ul: ({ children }) => <ul className="list-disc pl-5 mb-3 space-y-1 text-gray-400">{children}</ul>,
                          ol: ({ children }) => <ol className="list-decimal pl-5 mb-3 space-y-1 text-gray-400">{children}</ol>,
                          li: ({ children }) => <li className="pl-1">{children}</li>,
                          strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
                          code: ({ children }) => <code className="bg-white/10 px-1.5 py-0.5 rounded text-[13px] font-mono text-indigo-300 border border-white/5">{children}</code>,
                          pre: ({ children }) => <pre className="bg-[#1e1e20] p-3 rounded-lg border border-white/5 overflow-x-auto my-3 text-xs font-mono shadow-inner">{children}</pre>,
                          a: ({ href, children }) => <a href={href} className="text-indigo-400 hover:text-indigo-300 hover:underline decoration-indigo-400/30 underline-offset-4 transition-colors" target="_blank" rel="noopener noreferrer">{children}</a>,
                          blockquote: ({ children }) => <blockquote className="border-l-2 border-indigo-500/50 pl-4 py-1 my-3 italic text-gray-500">{children}</blockquote>,
                        }}
                      >
                        {cleanContent}
                      </ReactMarkdown>
                    </div>
                  );
                }
                return null;
              })}

              {/* Copy / Retry Actions - Minimalist, show on hover */}
              <div className="flex items-center gap-3 pt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-white transition-colors"
                >
                  {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
                {onRetry && (
                  <button
                    onClick={() => onRetry(message.content)}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-white transition-colors"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Retry
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Helper component to avoid Hook loop issue in legacy rendering
function LegacyToolGroup({ block }: { block: any }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isSuccess = block.status === 'success';
  const isFailed = block.status === 'failed';

  return (
    <div className="my-1 rounded border border-white/5 bg-[#1e1e20] overflow-hidden">
      {/* Tool Header - Click to toggle details */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors text-left"
      >
        <div className={cn(
          "flex items-center justify-center w-5 h-5 rounded border text-[10px]",
          isSuccess ? "bg-emerald-500/5 border-emerald-500/10 text-emerald-500" :
            isFailed ? "bg-red-500/5 border-red-500/10 text-red-500" :
              "bg-blue-500/5 border-blue-500/10 text-blue-500"
        )}>
          {isSuccess ? <Check className="h-3 w-3" /> :
            isFailed ? <AlertCircle className="h-3 w-3" /> :
              <Loader2 className="h-3 w-3 animate-spin" />
          }
        </div>

        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className={cn(
            "font-medium text-[13px] truncate",
            isSuccess ? "text-gray-300" :
              isFailed ? "text-red-400" :
                "text-gray-300"
          )}>
            {block.title || block.content}
          </span>
          {block.duration && (
            <span className="text-[10px] text-muted-foreground ml-auto font-mono">
              {block.duration}s
            </span>
          )}
        </div>
      </button>

      {/* Tool Details (Params & Result) */}
      {isExpanded && (
        <div className="px-3 py-2 border-t border-white/5 bg-black/20 text-xs font-mono space-y-2">
          {block.params && block.params.trim() && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-gray-600 mb-1">Input</div>
              <div className="text-gray-400 whitespace-pre-wrap pl-2 border-l border-white/10">{block.params.trim()}</div>
            </div>
          )}

          {block.result && block.result.trim() && (
            <div>
              <div className={cn(
                "text-[10px] uppercase tracking-wider mb-1",
                isFailed ? "text-red-500/50" : "text-emerald-500/50"
              )}>
                {isFailed ? 'Error' : 'Output'}
              </div>
              <div className={cn(
                "whitespace-pre-wrap pl-2 border-l",
                isFailed ? "text-red-300/80 border-red-500/20" : "text-gray-400 border-white/10"
              )}>
                {block.result.trim()}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
