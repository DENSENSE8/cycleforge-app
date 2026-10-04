import { Check } from '@/components/Icons';
import { cn } from '@/utils/_cn';

/**
 * A read-only checklist box — a crisp glyph, not a greyed-out disabled
 * `<input>`. Hangs in its row's gutter (the row is `relative pl-5/pl-6`) so the
 * text keeps normal inline flow and wraps under itself, not under the box.
 */
export function ChecklistGlyph({ checked, className }: { checked: boolean; className?: string }) {
  return (
    <span
      role="img"
      aria-label={checked ? 'Done' : 'Not done'}
      className={cn(
        'absolute left-0.5 top-[5px] flex size-3.5 items-center justify-center rounded-sm border',
        checked ? 'border-text-default bg-text-default text-surface-card' : 'border-text-muted',
        className,
      )}
    >
      {checked ? <Check aria-hidden className="size-3" /> : null}
    </span>
  );
}
