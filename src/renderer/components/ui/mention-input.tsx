import * as React from 'react';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverAnchor } from '@/components/ui/popover';
import { cn } from '@/lib/utils';


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

export interface MentionInputRef {
    openMenu: () => void;
}

export const MentionInput = React.forwardRef<MentionInputRef, MentionInputProps>(({ variableGroups, value, onChange, className, rows = 1, placeholder, onKeyDown, ...props }, ref) => {
    const [open, setOpen] = React.useState(false);
    const [query, setQuery] = React.useState('');
    const [activeIndex, setActiveIndex] = React.useState(0);
    const inputRef = React.useRef<HTMLDivElement>(null);
    const isEditingRef = React.useRef(false);

    // Flatten groups
    const allVariables = React.useMemo<FlattenedVariable[]>(() => {
        if (!variableGroups) return [];
        return variableGroups.flatMap(g => g.variables?.map(v => ({ ...v, groupName: g.nodeName })) || []);
    }, [variableGroups]);

    React.useImperativeHandle(ref, () => ({
        openMenu: () => {
            if (open) {
                setOpen(false);
                inputRef.current?.focus();
            } else {
                setQuery('');
                setActiveIndex(0);
                setOpen(true);
                // focus and ensure cursor is valid
                inputRef.current?.focus();
                // If no selection, move to end?
                const sel = window.getSelection();
                if (!sel || sel.rangeCount === 0) {
                    // Move to end
                    if (inputRef.current) {
                        const range = document.createRange();
                        range.selectNodeContents(inputRef.current);
                        range.collapse(false);
                        sel?.removeAllRanges();
                        sel?.addRange(range);
                    }
                }
            }
        }
    }));

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
                return `<span data-variable="${full}" contenteditable="false" class="inline-flex items-center px-1.5 py-0.5 rounded bg-primary/10 border border-primary/20 text-primary font-medium text-[0.9em] align-middle select-none"><span class="opacity-50 text-[9px] uppercase font-bold mr-1 pointer-events-none">${groupName}</span><span class="pointer-events-none">${label}</span></span>`;
            }
            return match;
        });
    }, [allVariables]);

    // Recursive helper to get plain text from contentEditable DOM
    const getValueFromNodes = React.useCallback((nodes: NodeList | ChildNode[]): string => {
        let text = '';
        nodes.forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) {
                text += node.textContent || '';
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                const el = node as HTMLElement;
                if (el.hasAttribute('data-variable')) {
                    text += el.getAttribute('data-variable');
                } else if (el.tagName === 'BR') {
                    text += '\n';
                } else {
                    // For nested containers, recurse
                    const content = getValueFromNodes(Array.from(el.childNodes));
                    const isBlock = window.getComputedStyle(el).display === 'block' || el.tagName === 'DIV' || el.tagName === 'P';

                    if (isBlock && text.length > 0 && !text.endsWith('\n')) {
                        text += '\n';
                    }
                    text += content;
                    if (isBlock && !text.endsWith('\n')) {
                        text += '\n';
                    }
                }
            }
        });
        return text;
    }, []);

    // Sync external value changes to DOM
    React.useEffect(() => {
        if (!inputRef.current) return;

        const root = inputRef.current;
        const normalizedExternal = value || '';

        // Always force clear if value is empty
        if (!normalizedExternal) {
            if (root.innerHTML !== '') {
                root.innerHTML = '';
            }
            isEditingRef.current = false;
            return;
        }

        // Only update if external value differs from what's currently in the DOM
        const currentDOMValue = getValueFromNodes(Array.from(root.childNodes));
        if (normalizedExternal !== currentDOMValue) {
            // We only force update if not currently typing, OR if the focus is elsewhere
            if (!isEditingRef.current || document.activeElement !== root) {
                root.innerHTML = valueToHtml(normalizedExternal);
            }
        }
    }, [value, valueToHtml, getValueFromNodes]);

    const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
        isEditingRef.current = true;
        const root = inputRef.current;
        if (!root) return;

        // Reconstruct value from DOM robustly
        const newValue = getValueFromNodes(Array.from(root.childNodes));

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
            // Do not force close if we opened it manually and are just navigating?
            // Actually for typing logic, if we move out of context we should close.
            // But if opened manually (query='') we might want to stay open until explicit close?
            // For now, simple logic:
            if (!open) return;
            // setOpen(false); // Let's not aggressively close for now
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

        // If manually opened (empty query) and user keeps typing?
        // If we are currently open and query is empty, we might want to check if they typed something that SHOULD match
        // But usually manual open implies "browsing mode".

        // Only close if we were auto-triggered by @ and now it doesn't match
        if (open && query !== '') {
            // We only auto-close if we were in "search" mode (query not empty) and lost the match
            setOpen(false);
        }
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

        root.focus();

        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;

        const range = sel.getRangeAt(0);
        const node = range.startContainer;

        // Delete the typed @query IF it exists (trigger pattern)
        if (node.nodeType === Node.TEXT_NODE && node.textContent) {
            const text = node.textContent;
            const pos = range.startOffset;
            const lastAt = text.slice(0, pos).lastIndexOf('@');

            if (lastAt !== -1) {
                const potentialQuery = text.slice(lastAt + 1, pos);
                // Only replace if it looks like a valid trigger (no spaces)
                if (!potentialQuery.includes(' ')) {
                    range.setStart(node, lastAt);
                    range.setEnd(node, pos);
                    range.deleteContents();
                }
            }
        }

        // Insert Element
        const span = document.createElement('span');
        span.contentEditable = 'false';
        span.setAttribute('data-variable', v.value);
        span.className = "inline-flex items-center px-1.5 py-0.5 rounded bg-primary/10 border border-primary/20 text-primary font-medium text-[0.9em] align-middle select-none";
        span.innerHTML = `<span class="opacity-50 text-[9px] uppercase font-bold mr-1 pointer-events-none">${v.groupName}</span><span class="pointer-events-none">${v.label}</span>`;

        range.insertNode(span);

        // Move cursor after the inserted element
        const space = document.createTextNode('\u00A0'); // nbsp
        range.insertNode(space);

        range.setStartAfter(space);
        range.setEndAfter(space);
        sel.removeAllRanges();
        sel.addRange(range);

        // Normalize and Trigger Input
        handleInput({} as React.FormEvent<HTMLDivElement>);
        setOpen(false);
        setQuery(''); // Reset query
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        // Internal Menu Navigation
        if (open) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveIndex(i => (i + 1) % filtered.length);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveIndex(i => (i - 1 + filtered.length) % filtered.length);
            } else if (e.key === 'Enter' || e.key === 'Tab') {
                if (filtered.length > 0) {
                    e.preventDefault();
                    insertVariable(filtered[activeIndex]);
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                setOpen(false);
            }
        }

        // Call external handler if not prevented
        if (!e.defaultPrevented && onKeyDown) {
            onKeyDown(e);
        }
    };

    const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
        e.preventDefault();
        const text = e.clipboardData.getData('text/plain');
        document.execCommand('insertText', false, text);
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverAnchor asChild>
                <div className="relative w-full group">
                    <div
                        ref={inputRef}
                        contentEditable
                        onInput={handleInput}
                        onPaste={handlePaste}
                        onKeyDown={handleKeyDown}
                        className={cn(
                            "w-full bg-transparent border-0 resize-none focus:outline-none shadow-none focus-visible:ring-0 px-4 py-3 text-sm pr-10 min-h-[44px] overflow-y-auto whitespace-pre-wrap break-words",
                            className
                        )}
                        spellCheck={false}
                        {...props}
                    />
                    {!value && (
                        <div className="absolute top-3 left-4 text-muted-foreground/40 pointer-events-none text-sm select-none">
                            {placeholder || 'Type @ to mention...'}
                        </div>
                    )}
                </div>
            </PopoverAnchor>
            <PopoverContent
                className="w-[300px] p-0"
                align="start"
                onOpenAutoFocus={(e) => e.preventDefault()} // Keep focus on input
            >
                <div className="max-h-[300px] overflow-y-auto p-1">
                    <div className="px-2 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border/40 mb-1 bg-background/80 sticky top-0 backdrop-blur-sm z-10">
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
                                    i === activeIndex
                                        ? "bg-primary/10 text-primary"
                                        : "hover:bg-muted text-muted-foreground hover:text-foreground"
                                )}
                                onClick={() => insertVariable(v)}
                                onMouseEnter={() => setActiveIndex(i)}
                            >
                                <div className="flex items-center justify-between w-full">
                                    <span className={cn(
                                        "font-medium",
                                        i === activeIndex ? "text-primary" : "text-foreground"
                                    )}>{v.label}</span>
                                    <span className={cn(
                                        "text-[9px] opacity-70 px-1.5 py-0.5 rounded",
                                        i === activeIndex ? "bg-primary/20" : "bg-muted"
                                    )}>{v.groupName}</span>
                                </div>
                                <div className="flex items-center gap-2 font-mono text-[10px] opacity-80">
                                    {/* Value hidden as per user request */}
                                    {v.example && <span className="truncate max-w-[200px] border-l border-border pl-2 opacity-70">{v.example}</span>}
                                </div>
                            </button>
                        ))
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
});
MentionInput.displayName = "MentionInput";
