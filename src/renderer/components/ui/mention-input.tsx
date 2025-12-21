import * as React from 'react';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverAnchor } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Sparkles } from 'lucide-react';

export interface Variable {
    label: string;
    value: string;
    example?: string;
}

export interface Group {
    nodeName: string;
    variables: Variable[];
}

// Define a type for variables after flattening, which includes groupName
type FlattenedVariable = Variable & { groupName: string };

// Update Props Interface
export interface MentionInputProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
    variableGroups: Group[];
    value: string;
    onChange: (e: { target: { value: string } }) => void;
    rows?: number; // kept for compatibility but unused in div
    placeholder?: string;
}

export function MentionInput({ variableGroups, value, onChange, className, rows = 1, placeholder, ...props }: MentionInputProps) {
    const [open, setOpen] = React.useState(false);
    const [query, setQuery] = React.useState('');
    const [activeIndex, setActiveIndex] = React.useState(0);
    const inputRef = React.useRef<HTMLDivElement>(null);
    // Track if we are currently editing to prevent loop issues with value prop
    const isEditingRef = React.useRef(false);

    // Flatten groups
    const allVariables = React.useMemo<FlattenedVariable[]>(() => {
        if (!variableGroups) return [];
        return variableGroups.flatMap(g => g.variables?.map(v => ({ ...v, groupName: g.nodeName })) || []);
    }, [variableGroups]);

    // Convert raw text to HTML with tags
    const valueToHtml = React.useCallback((text: string) => {
        if (!text) return '';
        // Escape HTML to prevent XSS from user typing
        let html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        // Replace variables with tags
        const regex = /({{[a-zA-Z0-9_.-]+}})/g;
        return html.replace(regex, (match) => {
            const innerMatch = match.match(/{{([a-z]+)\.([a-zA-Z0-9-]+)}}/);
            if (innerMatch) {
                const [full, service, id] = innerMatch;
                const variable = allVariables.find(v => v.value === full);
                const label = variable ? variable.label : id;
                const groupName = variable ? variable.groupName : service;

                // We utilize data attributes to reconstruct the value later
                return `<span data-variable="${full}" contenteditable="false" class="inline-flex items-center px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400 font-medium text-[0.9em] align-baseline leading-none mx-0.5 select-none"><span class="opacity-50 text-[9px] uppercase font-bold mr-1 pointer-events-none">${groupName}</span><span class="pointer-events-none">${label}</span></span>`;
            }
            return match;
        });
    }, [allVariables]);

    // Sync external value changes to DOM
    React.useEffect(() => {
        if (inputRef.current && !isEditingRef.current) {
            const newHtml = valueToHtml(value);
            // Only update if semantically different to avoid losing cursor position on strict equality check
            if (inputRef.current.innerHTML !== newHtml) {
                // Check if text content matches - if so, don't clobber DOM unless structure changed
                // Actually, safer to trust the value prop as source of truth
                // But handle empty case explicitly
                if (!value) {
                    inputRef.current.innerHTML = '';
                } else {
                    // Check if focused - if focused, be careful
                    if (document.activeElement !== inputRef.current) {
                        inputRef.current.innerHTML = newHtml;
                    }
                }
            }
        }
    }, [value, valueToHtml]);

    const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
        isEditingRef.current = true;
        const root = inputRef.current;
        if (!root) return;

        // Reconstruct value from DOM
        let newValue = '';
        root.childNodes.forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) {
                newValue += node.textContent || '';
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                const el = node as HTMLElement;
                if (el.hasAttribute('data-variable')) {
                    newValue += el.getAttribute('data-variable');
                } else if (el.tagName === 'BR') {
                    newValue += '\n';
                } else {
                    newValue += el.textContent || ''; // fallback
                }
            }
        });

        // Detect Trigger
        checkTrigger();

        // Emit change
        onChange({ target: { value: newValue } });

        // Reset editing lock after a tick to allow external updates again if needed
        setTimeout(() => {
            isEditingRef.current = false;
        }, 0);
    };

    const checkTrigger = () => {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;

        const range = sel.getRangeAt(0);

        // Get text before cursor
        // We need to look at the text node we are in
        const node = range.startContainer;

        if (node.nodeType === Node.TEXT_NODE && node.textContent) {
            const text = node.textContent;
            const cursorPos = range.startOffset;
            const textBefore = text.slice(0, cursorPos);

            checkTextForTrigger(textBefore);
        } else {
            setOpen(false); // If not in a text node, close popover
        }
    };

    const checkTextForTrigger = (textBefore: string) => {
        const lastAt = textBefore.lastIndexOf('@');
        if (lastAt !== -1) {
            const queryText = textBefore.slice(lastAt + 1);
            // Simple check: no spaces allowed in query for now
            if (!queryText.includes(' ')) {
                setQuery(queryText);
                setOpen(true);
                setActiveIndex(0);
                return;
            }
        }
        setOpen(false);
    };

    const filtered = React.useMemo<FlattenedVariable[]>(() => {
        if (!query) return allVariables;
        return allVariables.filter(v =>
            v.label.toLowerCase().includes(query.toLowerCase()) ||
            v.groupName.toLowerCase().includes(query.toLowerCase())
        );
    }, [allVariables, query]);

    const insertVariable = (v: FlattenedVariable) => {
        const root = inputRef.current;
        if (!root) return;

        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;

        const range = sel.getRangeAt(0);
        const node = range.startContainer;

        // Delete the typed @query
        if (node.nodeType === Node.TEXT_NODE && node.textContent) {
            const text = node.textContent;
            const pos = range.startOffset;
            const lastAt = text.slice(0, pos).lastIndexOf('@');

            if (lastAt !== -1) {
                range.setStart(node, lastAt);
                range.setEnd(node, pos);
                range.deleteContents();
            }
        }

        // Insert Element
        const span = document.createElement('span');
        span.contentEditable = 'false';
        span.setAttribute('data-variable', v.value);
        span.className = "inline-flex items-center px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400 font-medium text-[0.9em] align-baseline leading-none mx-0.5 select-none";
        span.innerHTML = `<span class="opacity-50 text-[9px] uppercase font-bold mr-1 pointer-events-none">${v.groupName}</span><span class="pointer-events-none">${v.label}</span>`;

        range.insertNode(span);

        // Move cursor after the inserted element
        // We need to insert a zero-width space or similar to ensure cursor can be placed AFTER the non-editable element in some browsers?
        // Actually best practice is usually to insert a text node with space or just rely on browser behavior. 
        // Let's add a text node with a zero-width space to reliably allow typing.
        const space = document.createTextNode('\u00A0'); // nbsp
        range.insertNode(space);

        range.setStartAfter(space);
        range.setEndAfter(space);
        sel.removeAllRanges();
        sel.addRange(range);

        // Normalize and Trigger Input
        // We manually trigger input logic to update state
        handleInput({} as React.FormEvent<HTMLDivElement>); // Cast to correct type
        setOpen(false);
        root.focus();
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (open) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveIndex(i => (i + 1) % filtered.length);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveIndex(i => (i - 1 + filtered.length) % filtered.length);
            } else if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                if (filtered.length > 0) {
                    insertVariable(filtered[activeIndex]);
                }
            } else if (e.key === 'Escape') {
                setOpen(false);
            }
        }
    };

    const handleIconClick = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (open) {
            setOpen(false);
        } else {
            inputRef.current?.focus();
            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0) {
                const range = sel.getRangeAt(0);
                const textNode = document.createTextNode('@');
                range.insertNode(textNode);
                range.setStartAfter(textNode);
                range.setEndAfter(textNode);
                checkTextForTrigger('@');
            }
        }
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverAnchor asChild>
                <div className="relative w-full group">
                    <div
                        ref={inputRef}
                        contentEditable
                        onInput={handleInput}
                        onKeyDown={handleKeyDown}
                        className={cn(
                            "w-full bg-transparent border-0 resize-none focus:outline-none placeholder:text-muted-foreground/60 shadow-none focus-visible:ring-0 px-4 py-3 text-sm pr-10 min-h-[44px] whitespace-pre-wrap break-words empty:before:content-[attr(placeholder)] empty:before:text-muted-foreground/40",
                            className
                        )}
                        spellCheck={false}
                        {...props}
                    />

                    {/* Placeholder handled via CSS empty selector or managed above logic */}
                    {/* The original placeholder div is now hidden as per instruction, but the placeholder attribute is used */}
                    {!value && (
                        <div className="absolute top-3 left-4 text-muted-foreground/40 pointer-events-none text-sm select-none">
                            {placeholder || 'Type @ to mention...'}
                        </div>
                    )}

                    {/* Interactive Trigger Icon */}
                    <button
                        onClick={handleIconClick}
                        className="absolute right-1 top-2.5 p-1.5 rounded-md text-muted-foreground/40 hover:text-blue-400 hover:bg-blue-500/10 transition-colors z-20"
                        type="button"
                    >
                        <Sparkles className="h-3.5 w-3.5" />
                    </button>
                </div>
            </PopoverAnchor>
            <PopoverContent
                className="w-[300px] p-0"
                align="start"
                onOpenAutoFocus={(e) => e.preventDefault()} // Keep focus on input
            >
                <div className="max-h-[300px] overflow-y-auto p-1">
                    <div className="px-2 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-widest border-b border-white/5 mb-1 bg-background/50 sticky top-0 backdrop-blur-sm z-10">
                        {query ? `Searching "${query}"...` : 'Select Variable'}
                    </div>
                    {filtered.length === 0 ? (
                        <div className="p-2 text-xs text-muted-foreground text-center">No matches found</div>
                    ) : (
                        filtered.map((v, i) => (
                            <button
                                key={i + v.value}
                                className={cn(
                                    "w-full text-left px-2 py-2 rounded-md text-xs flex flex-col gap-0.5 transition-colors",
                                    i === activeIndex ? "bg-blue-600/20 text-blue-100" : "hover:bg-white/5 text-muted-foreground hover:text-white"
                                )}
                                onClick={() => insertVariable(v)}
                                onMouseEnter={() => setActiveIndex(i)}
                            >
                                <div className="flex items-center justify-between w-full">
                                    <span className="font-medium text-white/90">{v.label}</span>
                                    <span className="text-[9px] opacity-50 px-1.5 py-0.5 rounded bg-black/20">{v.groupName}</span>
                                </div>
                                <div className="flex items-center gap-2 font-mono text-[10px] opacity-60">
                                    {/* Value hidden as per user request */}
                                    {v.example && <span className="truncate max-w-[200px] border-l border-white/10 pl-2 opacity-70">{v.example}</span>}
                                </div>
                            </button>
                        ))
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}
