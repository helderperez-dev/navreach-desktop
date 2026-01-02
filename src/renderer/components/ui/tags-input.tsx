
import * as React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TagsInputProps {
    value: string[];
    onChange: (value: string[]) => void;
    placeholder?: string;
    className?: string;
}

export function TagsInput({ value = [], onChange, placeholder, className }: TagsInputProps) {
    const [inputValue, setInputValue] = React.useState('');
    const inputRef = React.useRef<HTMLInputElement>(null);

    const addTag = (tag: string) => {
        const trimmed = tag.trim();
        if (trimmed && !value.includes(trimmed)) {
            onChange([...value, trimmed]);
        }
        setInputValue('');
    };

    const removeTag = (indexToRemove: number) => {
        onChange(value.filter((_, index) => index !== indexToRemove));
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addTag(inputValue);
        } else if (e.key === 'Backspace' && !inputValue && value.length > 0) {
            removeTag(value.length - 1);
        } else if (e.key === ',') {
            e.preventDefault();
            addTag(inputValue);
        }
    };

    const handleBlur = () => {
        if (inputValue) {
            addTag(inputValue);
        }
    };

    return (
        <div
            className={cn(
                "flex flex-wrap gap-1.5 p-2 px-4 min-h-12 rounded-xl border border-border bg-muted/50 transition-[border-color,background-color] duration-300 ease-in-out hover:border-border/80 focus-within:border-primary/50 focus-within:bg-muted/80 focus-within:outline-none focus-within:ring-0",
                className
            )}
            onClick={() => inputRef.current?.focus()}
        >
            {value.map((tag, index) => (
                <div key={index} className="inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-primary/20 bg-primary/10 text-primary hover:bg-primary/20 gap-1">
                    {tag}
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            removeTag(index);
                        }}
                        className="text-primary/60 hover:text-primary focus:outline-none ml-1 p-0.5 hover:bg-primary/10 rounded-full transition-colors"
                    >
                        <X className="h-3 w-3" />
                    </button>
                </div>
            ))}
            <input
                ref={inputRef}
                type="text"
                className="flex-1 bg-transparent border-none outline-none text-sm min-w-[120px] placeholder:text-muted-foreground placeholder:text-xs"
                placeholder={value.length === 0 ? placeholder : ''}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={handleBlur}
            />
        </div>
    );
}
