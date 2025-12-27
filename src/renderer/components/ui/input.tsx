import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> { }

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-12 w-full rounded-xl border border-border bg-muted/50 px-4 py-2 text-sm shadow-sm transition-[border-color,background-color] duration-300 ease-in-out placeholder:text-muted-foreground focus-visible:outline-none focus:border-primary/50 hover:border-border/80 focus:bg-muted/80 disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };
