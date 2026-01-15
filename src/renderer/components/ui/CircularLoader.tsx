import { cn } from '@/lib/utils';

interface CircularLoaderProps {
  className?: string;
}

export function CircularLoader({ className }: CircularLoaderProps) {
  return (
    <div className={cn(
      "border-2 border-muted-foreground/20 border-t-muted-foreground/60 rounded-full animate-spin",
      className || "h-4 w-4"
    )} />
  );
}
