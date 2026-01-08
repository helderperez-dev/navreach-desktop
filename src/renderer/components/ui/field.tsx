
import * as React from "react"
import { cn } from "@/lib/utils"
import { Label } from "./label"

interface FieldProps {
    label?: string
    error?: string
    containerClassName?: string
    children: React.ReactNode
}

export function Field({ label, error, containerClassName, children }: FieldProps) {
    return (
        <div className={cn("space-y-2 w-full", containerClassName)}>
            {label && (
                <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider ml-1 block">
                    {label}
                </Label>
            )}
            {children}
            {error && <p className="text-[10px] text-red-500 ml-1 mt-1">{error}</p>}
        </div>
    )
}
