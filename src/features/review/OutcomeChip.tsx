import { cn } from '@/utils/_cn';
import { packOutcomeMeta, type PackOutcomeTone } from '@/lib/packing/pack-verification-outcomes';

/** House 3-layer chip (bg-50 / text-700 / ring-200) keyed to the outcome tone —
 *  the one place outcome hue is resolved for the Review station + Operations. */
const TONE_CHIP: Record<PackOutcomeTone, string> = {
  info: 'bg-blue-50 text-blue-700 ring-blue-200',
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  warning: 'bg-amber-50 text-amber-700 ring-amber-200',
  danger: 'bg-rose-50 text-rose-700 ring-rose-200',
  muted: 'bg-surface-sunken text-text-muted ring-border-soft',
};

export function OutcomeChip({ outcome, className }: { outcome: string; className?: string }) {
  const meta = packOutcomeMeta(outcome);
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-role-micro uppercase tracking-widest ring-1 ring-inset',
        TONE_CHIP[meta.tone],
        className,
      )}
    >
      {meta.label}
    </span>
  );
}
