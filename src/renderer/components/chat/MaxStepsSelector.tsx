import { useChatStore } from '@/stores/chat.store';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';

const STEP_OPTIONS = [5, 10, 15, 20, 25, 30, 40, 50];

export function MaxStepsSelector() {
  const { maxIterations, setMaxIterations, infiniteMode, setInfiniteMode } = useChatStore();

  const handleChange = (value: string) => {
    if (value === 'infinite') {
      setInfiniteMode(true);
    } else {
      setInfiniteMode(false);
      setMaxIterations(Number(value));
    }
  };

  const currentValue = infiniteMode ? 'infinite' : String(maxIterations);
  const displayValue = infiniteMode ? '∞' : `${maxIterations} steps`;

  return (
    <Select value={currentValue} onValueChange={handleChange}>
      <SelectTrigger className="h-auto px-0 py-0 text-xs border-0 bg-transparent hover:text-foreground text-muted-foreground gap-1 w-auto focus:ring-0 [&>svg]:hidden">
        <span className="truncate">Max steps · {infiniteMode ? '∞' : maxIterations}</span>
      </SelectTrigger>
      <SelectContent align="start">
        {STEP_OPTIONS.map((steps) => (
          <SelectItem key={steps} value={String(steps)} className="text-xs">
            {steps} steps
          </SelectItem>
        ))}
        <SelectItem value="infinite" className="text-xs">
          ∞ Infinite
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
