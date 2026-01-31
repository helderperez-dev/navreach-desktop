import { Copy, Check, ChevronDown, ChevronRight, Square, RotateCcw, Activity, AlertCircle } from 'lucide-react';
import { CircularLoader } from '@/components/ui/CircularLoader';
import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';
import type { Message } from '@shared/types';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { ProcessedText } from '@/lib/mention-utils';

interface ChatMessageProps {
  message: Message;
  variables?: any[];
  onRetry?: (content: string) => void;
  onApprove?: () => void;
  isLast?: boolean;
}

// Tool name aliases for user-friendly display
const toolAliases: Record<string, string> = {
  'browser_navigate': 'Navigating to URL',
  'browser_click': 'Clicking Element',
  'browser_click_at': 'Clicking at Position',
  'browser_click_coordinates': 'Clicking Coordinates',
  'browser_type': 'Typing Text',
  'browser_scroll': 'Scrolling Page',
  'browser_snapshot': 'Capturing Viewport',
  'browser_get_page_content': 'Reading Page Data',
  'browser_extract': 'Extracting Details',
  'browser_go_back': 'Navigating Back',
  'browser_go_forward': 'Navigating Forward',
  'browser_reload': 'Refreshing Page',
  'browser_wait': 'Waiting For UI',
  'browser_find_elements': 'Locating Elements',
  'browser_get_accessibility_tree': 'Analyzing DOM Tree',
  'browser_hover': 'Hovering Over Element',
  'browser_get_visible_text': 'Reading Visible Text',
  'browser_inspect_element': 'Inspecting Node',
  'browser_highlight_elements': 'Highlighting Targets',
  'x_search': 'Searching X',
  'x_advanced_search': 'Advanced X Search',
  'x_like': 'Engaging: Like',
  'x_reply': 'Engaging: Reply',
  'x_post': 'Creating New Post',
  'x_follow': 'Following User',
  'x_engage': 'Multi-step Engagement',
  'x_scout_topics': 'Scouting X Topics',
  'x_scout_community': 'Analyzing Community',
  'humanize_text': 'Humanizing Text',
  'db_get_targets': 'Loading Targets',
  'db_get_target_lists': 'Fetching Lists',
  'db_create_target_list': 'Saving New List',
  'db_create_target': 'Recording Target',
  'db_update_target': 'Syncing Data',
  'db_get_mcp_servers': 'Checking Integrations',
  'mcp_list_tools': 'Listing API Methods',
  'mcp_call_tool': 'Invoking Integration',
  'db_get_api_tools': 'Fetching Custom Tools',
  'api_call_tool': 'Invoking API Step',
  'db_get_playbooks': 'Loading Playbooks',
  'db_get_playbook_details': 'Reading Playbook',
  'db_save_playbook': 'Saving Playbook',
  'db_delete_playbook': 'Removing Playbook',
  'human_approval': 'Awaiting Approval',
  'agent_pause': 'Agent Paused',
  'x_scan_posts': 'Scanning X (Twitter) Posts',
  'browser_move_to_element': 'Focusing on Element',
  'report_playbook_node_status': 'Updating Playbook Step',
  'unknown_tool': 'Running Action'
};

function getToolDisplayName(name: string) {
  if (toolAliases[name]) return toolAliases[name];
  // Fallback: convert snake_case to Title Case (e.g. browser_navigate -> Browser Navigate)
  return name
    .replace(/^browser_/, '') // Optional: remove common prefixes for brevity
    .replace(/^db_/, '')
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}


// Helper to structure the message content into logical blocks
// We want to group: Thinking Process -> Tool Executions -> Final Answer
function parseMessageContent(content: string) {
  const lines = content.split('\n');
  const blocks: { type: 'text' | 'tool-group' | 'error' | 'thought'; content: string; title?: string; status?: 'running' | 'success' | 'failed'; duration?: string; result?: string; params?: string }[] = [];

  let currentBlock: any = null;
  let inThinkingBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // 1. Check for XML Thinking Start
    // Handles: "<thinking>", "<thinking> content", "<thinking> content </thinking>"
    const thinkingStartMatch = trimmed.match(/^<thinking>(.*)/i);
    if (thinkingStartMatch) {
      inThinkingBlock = true;
      const initialContent = thinkingStartMatch[1];

      // Check if it closes on the same line
      const sameLineEnd = initialContent.match(/(.*)<\/thinking>$/i);

      currentBlock = {
        type: 'thought',
        content: sameLineEnd ? sameLineEnd[1].trim() + '\n' : initialContent + '\n'
      };
      blocks.push(currentBlock);

      if (sameLineEnd) {
        currentBlock = null;
        inThinkingBlock = false;
      }
      continue;
    }

    // 2. Check for XML Thinking End (multiline)
    if (inThinkingBlock) {
      const thinkingEndMatch = trimmed.match(/(.*)<\/thinking>$/i);
      if (thinkingEndMatch) {
        if (currentBlock && currentBlock.type === 'thought') {
          currentBlock.content += thinkingEndMatch[1] + '\n';
        }
        currentBlock = null;
        inThinkingBlock = false;
      } else {
        if (currentBlock && currentBlock.type === 'thought') {
          currentBlock.content += line + '\n';
        }
      }
      continue;
    }

    // 3. Tool Execution Start - catch 🔧 or "Executing:"
    const execMatch = line.match(/^(?:🔧\s*)?(?:Using tool:|Executing:)\s*(\w+)/);
    if (execMatch) {
      const toolName = execMatch[1];
      // Start a new tool group
      currentBlock = {
        type: 'tool-group',
        content: toolName,
        title: getToolDisplayName(toolName),
        status: 'running',
        params: '',
        result: ''
      };
      blocks.push(currentBlock);
      continue;
    }

    // 4. Tool Completion/Status - catch ✅/❌/⚠️ or "Success"/"Error"
    const statusMatch = line.match(/^(?:✅|❌|⚠️|Success|Completed|Error)\s*(?::\s*)?(?:\(([\d.]+)s\))?/i);
    if (statusMatch) {
      const isError = line.startsWith('❌') || line.startsWith('⚠️') || line.toLowerCase().startsWith('error');
      const duration = statusMatch[1];

      // Find the last tool block to update
      const lastTool = [...blocks].reverse().find(b => b.type === 'tool-group');

      if (lastTool) {
        lastTool.status = isError ? 'failed' : 'success';
        if (duration) lastTool.duration = duration;
      } else if (isError) {
        // If it's an error not associated with a tool, create an error block
        blocks.push({ type: 'error', content: line.replace(/^(?:❌|Error)\s*/, '').trim() });
        currentBlock = null;
      }
      // Do not treat this line as text content
      continue;
    }

    // 5. Legacy "Thinking:" Prefix
    if (trimmed.startsWith('Thinking:')) {
      if (!currentBlock || currentBlock.type !== 'thought') {
        currentBlock = { type: 'thought', content: line.replace('Thinking:', '').trim() + '\n' };
        blocks.push(currentBlock);
      } else {
        currentBlock.content += line.replace('Thinking:', '').trim() + '\n';
      }
      continue;
    }

    // 6. Explicitly ignore troubleshooting and technical doc lines
    const isInternalDoc =
      trimmed.startsWith('Troubleshooting') ||
      (trimmed.startsWith('http') && (line.includes('langchain') || line.includes('openrouter.ai/docs'))) ||
      line.toLowerCase().includes('to learn more about provider routing');

    if (isInternalDoc) {
      continue;
    }

    // 7. Skip pure artifact/json lines often leaked by raw LLM output
    // e.g., {"id": "..."} or {"message": "..."} sitting alone
    // We only skip if it *looks* like a standalone JSON object and we aren't inside a code block (simple check)
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      // Heuristic: Don't show raw JSON lines if they look like tool artifacts
      if (trimmed.includes('"id":') || trimmed.includes('"message":') || trimmed.includes('"tool_call_id":')) {
        continue;
      }
    }

    // 8. Skip purely structural/emoji lines if they haven't been caught yet
    if (trimmed.match(/^[🔧✅❌⚠️]/)) {
      continue;
    }

    // 9. Aggressively skip snapshot/technical dump lines
    const isSnapshotDump =
      line.includes('selector: [') ||
      line.includes('Buttons: 0:') ||
      line.includes('Interactive Elements:') ||
      line.match(/^\d+:\s.*selector:/);

    if (isSnapshotDump) {
      continue;
    }

    // 10. Normal Line Processing
    if (currentBlock) {
      if (currentBlock.type === 'tool-group') {
        // If the tool already has a status (Success/Completed/Error), line goes to result
        if (currentBlock.status !== 'running') {
          if (!isSnapshotDump) {
            currentBlock.result = (currentBlock.result || '') + line + '\n';
          }
        } else {
          // Otherwise it's params
          currentBlock.params = (currentBlock.params || '') + line + '\n';
        }
      } else if (currentBlock.type === 'thought') {
        // Continue thought block if active (from legacy Thinking: prefix)
        currentBlock.content += line + '\n';
      } else {
        currentBlock.content += line + '\n';
      }
    } else {
      // Start new text block - ensure we don't start with empty lines
      if (trimmed) {
        currentBlock = { type: 'text', content: line + '\n' };
        blocks.push(currentBlock);
      }
    }
  }

  return blocks;
}

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
      if (res && typeof res === 'object' && res !== null) {
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
    <div className="my-2 rounded-2xl liquid-glass bg-white/5 overflow-hidden group/tool">
      {/* Header - Always Visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-all text-left hover:bg-white/[0.03]"
      >
        <div className={cn(
          "flex items-center justify-center w-5 h-5 rounded-lg border text-xs transition-colors",
          isSuccess ? "bg-white/5 border-white/10 text-white/50" :
            isFailed ? "bg-red-500/5 border-red-500/20 text-red-400/70" :
              "bg-white/5 border-white/10 text-white/40"
        )}>
          {isSuccess ? <Check className="h-3 w-3" /> :
            isFailed ? <AlertCircle className="h-3 w-3" /> :
              <CircularLoader className="h-3 w-3" />
          }
        </div>

        <div className="flex items-center gap-3 min-w-0 flex-1">
          <span className={cn(
            "font-medium text-[13px] tracking-tight truncate flex-shrink min-w-0 transition-colors",
            isSuccess ? "text-white/60 group-hover/tool:text-white/80" :
              isFailed ? "text-red-400/80" :
                "text-white/40 group-hover/tool:text-white/60"
          )}>
            {getToolDisplayName(toolCall.name)}
          </span>

          {duration && (
            <span className="text-[10px] text-white/20 ml-auto font-mono flex-shrink-0">
              {duration}
            </span>
          )}
        </div>

        <div className="p-1 rounded-md transition-colors group-hover/tool:bg-white/5">
          {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-white/20" /> : <ChevronRight className="h-3.5 w-3.5 text-white/20" />}
        </div>
      </button>

      {/* Expanded Details */}
      {isExpanded && resultDisplay && (
        <div className="px-4 py-3 border-t border-white/5 bg-white/[0.01] text-xs font-mono space-y-3 animate-in fade-in slide-in-from-top-1 duration-300">
          <div>
            <div className={cn(
              "flex items-center gap-1.5 text-[9px] uppercase tracking-[0.1em] mb-2 font-bold",
              isFailed ? "text-red-400/40" : "text-white/20"
            )}>
              {isFailed ? <AlertCircle className="h-2.5 w-2.5" /> : <Activity className="h-2.5 w-2.5" />}
              {isFailed ? 'System Error' : 'Execution Result'}
            </div>
            <div className={cn(
              "rounded-xl border p-3 overflow-x-auto whitespace-pre-wrap break-all max-h-[400px] overflow-y-auto custom-scrollbar leading-relaxed text-[11px]",
              isFailed ? "bg-red-500/5 border-red-500/10 text-red-400/80" : "bg-black/20 border-white/5 text-white/40"
            )}>
              {resultDisplay}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AgentControlUI({ onApprove, variant = 'approval' }: { onApprove: () => void, variant?: 'approval' | 'pause' }) {
  const [isApproved, setIsApproved] = useState(false);

  const handleApprove = () => {
    setIsApproved(true);
    onApprove();
  };

  const isPause = variant === 'pause';

  return (
    <div className={cn(
      "mt-4 mb-2 flex flex-col gap-4 p-5 rounded-2xl animate-in fade-in slide-in-from-top-3 border backdrop-blur-xl shadow-2xl relative overflow-hidden",
      isPause ? "bg-white/[0.02] border-white/10" : "bg-white/[0.03] border-white/20"
    )}>
      {/* Absolute background hint */}
      <div className={cn(
        "absolute top-0 left-0 w-1 h-full",
        isPause ? "bg-amber-500/40" : "bg-white/40"
      )} />

      <div className="flex items-start gap-4">
        <div className={cn(
          "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border",
          isPause ? "bg-amber-500/10 border-amber-500/20" : "bg-white/5 border-white/10"
        )}>
          {isPause ? <Square className="h-5 w-5 text-amber-500/70" /> : <Activity className="h-5 w-5 text-white/60" />}
        </div>
        <div className="space-y-1 py-0.5">
          <p className={cn("text-[15px] font-medium tracking-tight", isPause ? "text-amber-200/90" : "text-white/90")}>
            {isPause ? 'Workflow Paused' : 'Action Required'}
          </p>
          <p className={cn("text-[13px] leading-relaxed", isPause ? "text-amber-100/40" : "text-white/40")}>
            {isPause ? 'The playbook is waiting for a manual signal to continue.' : 'Confirm this step to allow the agent to proceed.'}
          </p>
        </div>
      </div>

      {!isApproved ? (
        <button
          onClick={handleApprove}
          className={cn(
            "self-end mt-1 px-6 py-2.5 text-white text-[13px] font-medium rounded-xl transition-all active:scale-[0.97] flex items-center gap-2 shadow-xl border border-white/10 backdrop-blur-md",
            isPause ? "bg-amber-600/80 hover:bg-amber-600" : "bg-white/10 hover:bg-white/20"
          )}
        >
          {isPause ? <ChevronRight className="h-4 w-4" /> : <Check className="h-4 w-4" />}
          <span className="tracking-tight">{isPause ? 'Continue Workflow' : 'Approve & Proceed'}</span>
        </button>
      ) : (
        <div className="self-end mt-1 px-5 py-2.5 text-white/50 text-[13px] font-medium flex items-center gap-2 bg-white/5 rounded-xl border border-white/10 backdrop-blur-sm">
          <Check className="h-4 w-4 opacity-50" />
          <span className="tracking-tight">{isPause ? 'Resuming...' : 'Step Confirmed'}</span>
        </div>
      )}
    </div>
  );
}

export function ChatMessage({ message, variables, onRetry, onApprove, isLast }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const [copied, setCopied] = useState(false);
  // Default expanded for critical info, collapsed for dense logs
  const [expandedThoughts, setExpandedThoughts] = useState(false);

  // Robust check for approval requests or pauses
  const approvalKeywords = [
    /approval required/i,
    /need your confirmation/i,
    /waiting for your approval/i,
    /ready for your approval/i,
    /please approve/i,
    /pause(?:d)? for approval/i,
    /do you approve/i,
    /approval/i,
    /approve/i,
    /paused/i
  ];

  const needsApproval = !isUser && isLast && !!onApprove && (
    approvalKeywords.some(regex => regex.test(message.content))
  );

  // Determine if this is an "Approval" or a simple "Continue"
  const isPauseOnly = message.content.toLowerCase().includes('paused') &&
    !message.content.toLowerCase().includes('approval') &&
    !message.content.toLowerCase().includes('approve');

  // Robust check for isolated playbook run triggers - hide them from the UI
  // Covers: "Run playbook {{playbooks.ID}}", "run {{playbooks...}}", etc.
  if (isUser && message.content.trim().match(/^(?:Run playbook|run)\s*{{playbooks\.[^}]+}}$/i)) {
    return null;
  }

  if (isSystem) {
    return (
      <div className="flex justify-center my-2">
        <div className="bg-secondary/20 border border-border/10 rounded-full px-4 py-1 flex items-center gap-2 text-[10px] font-medium text-muted-foreground/60">
          <Square className="h-2 w-2" />
          <span>{message.content}</span>
        </div>
      </div>
    );
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toolCallsRef = message.toolCalls || (message as any).tool_calls;
  const hasStructuredTools = toolCallsRef && toolCallsRef.length > 0;
  // Always parse content to support Thinking blocks and clean text, even if tools are present.
  const blocks = (!isUser) ? parseMessageContent(message.content) : [];

  // Helper to wrap markdown component children with tag processor
  const withTags = (children: any) => {
    return React.Children.map(children, (child) => {
      if (typeof child === 'string') {
        return <ProcessedText text={child} variables={variables} />;
      }
      return child;
    });
  };

  return (
    <div className={cn(
      'group relative px-4 py-1 transition-colors duration-200',
      isUser ? 'bg-transparent' : 'bg-transparent'
    )}>
      <div className={cn('w-full flex min-w-0', isUser ? 'flex-row-reverse' : 'flex-row')}>

        {/* Content Body */}
        <div className={cn('flex-1 min-w-0 space-y-1 overflow-hidden', isUser && 'flex flex-col items-end')}>

          {isUser ? (
            <div className="max-w-[85%] bg-white/[0.03] backdrop-blur-lg hover:bg-white/[0.06] text-white/90 px-5 py-3 rounded-2xl rounded-tr-[4px] text-[13px] leading-relaxed border border-white/10 mx-0 text-left break-words transition-all shadow-[0_4px_12px_rgba(0,0,0,0.1)]">
              <div className="whitespace-pre-wrap break-words">
                <ProcessedText text={message.content} variables={variables} />
              </div>
            </div>
          ) : (
            <>
              {/* 1. Structured Tool Executions (Consolidated) */}
              {/* Content Logic Refactored:
                    We now ALWAYS use parseMessageContent to separate Thoughts from Text.
                    This prevents duplication (previously we rendered content + blocks) 
                    and ensures 'Thinking' blocks are always collapsible. 
                    Structured tools are rendered separately below.
                */}


              {/* 2. Structured Tool Executions (Consolidated) */}
              {hasStructuredTools && (
                <div className="space-y-1.5 my-1 min-h-[40px]">
                  {(message.toolCalls || (message as any).tool_calls || []).map((toolCall: any) => {
                    const result = message.toolResults?.find((r) => r.toolCallId === toolCall.id);
                    return <StructuredToolCard key={toolCall.id} toolCall={toolCall} toolResult={result} />;
                  })}
                </div>
              )}

              {/* 3. Logical Blocks (Legacy Support) */}
              {blocks.map((block, idx) => {
                if (block.type === 'thought') {
                  return (
                    <div key={idx} className="bg-secondary/5 rounded-xl border border-border/5 overflow-hidden my-2.5 transition-all hover:border-border/10">
                      <button
                        onClick={() => setExpandedThoughts(!expandedThoughts)}
                        className="w-full flex items-center gap-2 px-4 py-2 text-[11px] font-semibold text-muted-foreground/50 hover:bg-muted/20 transition-colors text-left"
                      >
                        <Activity className="h-3 w-3" />
                        <span className="uppercase tracking-wider">Reasoning</span>
                        {expandedThoughts ? <ChevronDown className="h-3 w-3 ml-auto" /> : <ChevronRight className="h-3 w-3 ml-auto" />}
                      </button>
                      {expandedThoughts && (
                        <div className="px-3 py-2 bg-muted/20 text-xs text-muted-foreground border-t border-border font-mono leading-relaxed whitespace-pre-wrap">
                          {block.content}
                        </div>
                      )}
                    </div>
                  );
                }

                if (block.type === 'tool-group') {
                  // We can't use useState inside map!
                  // Refactored to LegacyToolGroup component
                  return <LegacyToolGroup key={idx} block={block} variables={variables} />;
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
                    <div key={idx} className="prose prose-sm max-w-full w-full text-white/70 leading-relaxed text-left dark:prose-invert break-words min-w-0 overflow-hidden font-light tracking-wide">
                      <ReactMarkdown
                        components={{
                          p: ({ children }) => <p className="mb-4 last:mb-0 transform-gpu">{withTags(children)}</p>,
                          ul: ({ children }) => <ul className="list-disc pl-5 mb-4 space-y-2 text-white/40">{withTags(children)}</ul>,
                          ol: ({ children }) => <ol className="list-decimal pl-5 mb-4 space-y-2 text-white/40">{withTags(children)}</ol>,
                          li: ({ children }) => <li className="pl-1">{withTags(children)}</li>,
                          strong: ({ children }) => <strong className="font-semibold text-white/90">{withTags(children)}</strong>,
                          code: ({ children }) => <code className="bg-white/5 px-1.5 py-0.5 rounded text-[12px] font-mono text-white/80 border border-white/5 break-all">{withTags(children)}</code>,
                          pre: ({ children }) => <pre className="bg-black/40 p-4 rounded-2xl border border-white/5 overflow-x-auto my-4 text-[11px] font-mono shadow-2xl max-w-full backdrop-blur-md">{children}</pre>,
                          a: ({ href, children }) => <a href={href} className="text-white/80 hover:text-white underline decoration-white/20 underline-offset-4 transition-colors" target="_blank" rel="noopener noreferrer">{withTags(children)}</a>,
                          blockquote: ({ children }) => <blockquote className="border-l-2 border-white/10 pl-4 py-1 my-4 italic text-white/40">{withTags(children)}</blockquote>,
                        }}
                      >
                        {cleanContent}
                      </ReactMarkdown>
                    </div>
                  );
                }
                return null;
              })}

              {/* Approval Request / Agent Control - Only if needs approval and is last */}
              {needsApproval && (
                <div className="max-w-full overflow-hidden">
                  <AgentControlUI
                    onApprove={onApprove}
                    variant={isPauseOnly ? 'pause' : 'approval'}
                  />
                </div>
              )}

              {/* Copy / Retry Actions - Minimalist, show on hover. Only if there is content. */}
              {message.content && message.content.trim().length > 0 && (
                <div className="flex items-center gap-3 pt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                  {onRetry && (
                    <button
                      onClick={() => onRetry(message.content)}
                      className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Retry
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Helper component to avoid Hook loop issue in legacy rendering
function LegacyToolGroup({ block, variables }: { block: any; variables?: any[] }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isSuccess = block.status === 'success';
  const isFailed = block.status === 'failed';

  return (
    <div className="my-2 rounded-2xl liquid-glass overflow-hidden group/tool">
      {/* Tool Header - Click to toggle details */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-all text-left hover:bg-white/[0.03]"
      >
        <div className={cn(
          "flex items-center justify-center w-5 h-5 rounded-lg border text-[10px] transition-colors",
          isSuccess ? "bg-white/5 border-white/10 text-white/50" :
            isFailed ? "bg-red-500/5 border-red-500/20 text-red-500/70" :
              "bg-white/5 border-white/10 text-white/40"
        )}>
          {isSuccess ? <Check className="h-3 w-3" /> :
            isFailed ? <AlertCircle className="h-3 w-3" /> :
              <CircularLoader className="h-3 w-3" />
          }
        </div>

        <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
          <span className={cn(
            "font-medium text-[13px] tracking-tight truncate transition-colors",
            isSuccess ? "text-white/60 group-hover/tool:text-white/80" :
              isFailed ? "text-red-400/80" :
                "text-white/40 group-hover/tool:text-white/60"
          )}>
            {block.title || block.content}
          </span>
          {block.duration && (
            <span className="text-[10px] text-white/20 ml-auto font-mono">
              {block.duration}s
            </span>
          )}
        </div>

        <div className="p-1 rounded-md transition-colors group-hover/tool:bg-white/5">
          {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-white/20" /> : <ChevronRight className="h-3.5 w-3.5 text-white/20" />}
        </div>
      </button>

      {/* Tool Details (Result only, no params) */}
      {isExpanded && block.result && block.result.trim() && (
        <div className="px-4 py-3 border-t border-white/5 bg-white/[0.01] text-xs font-mono space-y-2 animate-in fade-in slide-in-from-top-1 duration-300">
          <div>
            <div className={cn(
              "text-[9px] uppercase tracking-[0.1em] mb-2 font-bold",
              isFailed ? "text-red-400/40" : "text-white/20"
            )}>
              {isFailed ? 'Error Block' : 'Result Output'}
            </div>
            <div className={cn(
              "whitespace-pre-wrap break-all pl-3 border-l text-[11px]",
              isFailed ? "text-red-400/80 border-red-500/20" : "text-white/40 border-white/10"
            )}>
              <ProcessedText text={block.result.trim()} variables={variables} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
