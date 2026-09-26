'use client';

import { motion } from '@/design-system/motion';
import {
  INTAKE_CLASSIFICATION_OPTS,
  type IntakeClassification,
  type IntakeTone,
} from '@/lib/receiving/intake-classification';

// Door-classification pill tones — desktop mirror of the mobile /m/receive
// "Receiving as" selector. Same semantic shades, paired active/inactive.
const INTAKE_PILL_BASE =
  'inline-flex h-7 shrink-0 items-center whitespace-nowrap rounded-full border px-2.5 text-role-eyebrow uppercase tracking-widest transition-colors';
const INTAKE_ACTIVE: Record<IntakeTone, string> = {
  // ds-allow-raw-neutral: identity/tone hue — slate IS the IntakeTone key among colored siblings, not chrome
  slate: 'border-slate-600 bg-slate-600 text-white',
  blue: 'border-blue-600 bg-blue-600 text-white',
  rose: 'border-rose-600 bg-rose-600 text-white',
  amber: 'border-amber-500 bg-amber-500 text-white',
  emerald: 'border-emerald-600 bg-emerald-600 text-white',
};
const INTAKE_INACTIVE: Record<IntakeTone, string> = {
  slate: 'border-border-soft bg-surface-card text-text-muted hover:border-border-default hover:bg-surface-hover',
  blue: 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100',
  rose: 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100',
  amber: 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100',
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
};

/** "Receiving as" door-classification pill row — desktop triage parity with the mobile selector. */
export function IntakeClassifyRow({
  value,
  onSelect,
}: {
  value: IntakeClassification;
  onSelect: (next: IntakeClassification) => void;
}) {
  return (
    <div className="space-y-1">
      <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">Receiving as</p>
      <div
        role="radiogroup"
        aria-label="Receiving as"
        className="flex flex-nowrap items-center gap-1.5 overflow-x-auto scrollbar-hide"
      >
        {INTAKE_CLASSIFICATION_OPTS.map((o) => {
          const active = o.value === value;
          return (
            <motion.button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              title={o.label}
              onClick={() => onSelect(o.value)}
              className={`${INTAKE_PILL_BASE} ${active ? INTAKE_ACTIVE[o.tone] : INTAKE_INACTIVE[o.tone]}`}
            >
              {o.label}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
