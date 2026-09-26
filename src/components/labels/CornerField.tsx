'use client';

import { HorizontalButtonSlider, type HorizontalSliderItem } from '@/components/ui/HorizontalButtonSlider';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';



/** One-row corner control for a label editor: */
export function CornerField({
  items,
  mode,
  onModeChange,
  value,
  onValueChange,
  placeholder,
  inputMode = 'text',
  ariaLabel,
}: {
  items: HorizontalSliderItem[];
  mode: string;
  onModeChange: (id: string) => void;
  value: string;
  onValueChange: (next: string) => void;
  placeholder?: string;
  inputMode?: 'text' | 'numeric';
  ariaLabel?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        className={cn("min-w-0 flex-1 rounded-lg border border-border-soft bg-surface-card px-2.5 py-1.5 text-role-caption text-text-default transition-colors", focusRing('field', 'accent'))}
      />
      <div className="shrink-0">
        <HorizontalButtonSlider
          items={items}
          value={mode}
          onChange={onModeChange}
          variant="nav"
          size="md"
          aria-label={ariaLabel}
        />
      </div>
    </div>
  );
}
