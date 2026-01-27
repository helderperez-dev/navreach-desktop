
import * as React from "react"

import { cn } from "@/lib/utils"

export interface TextareaProps
    extends React.TextareaHTMLAttributes<HTMLTextAreaElement> { }

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
    ({ className, ...props }, ref) => {
        return (
            <textarea
                className={cn(
                    "flex min-h-[80px] w-full rounded-xl border border-border bg-muted/50 px-4 py-3 text-sm transition-[border-color,background-color] duration-300 ease-in-out placeholder:text-muted-foreground focus-visible:outline-none focus:border-foreground/30 hover:border-border/80 focus:bg-muted/80 disabled:cursor-not-allowed disabled:opacity-50",
                    className
                )}
                ref={ref}
                {...props}
            />
        )
    }
)
Textarea.displayName = "Textarea"

export { Textarea }
