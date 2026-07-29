'use client';

import { Globe, Lock } from '@/components/Icons';
import { cn } from '@/utils/_cn';

interface Props {
  /** false = internal note (private); true = public reply (emailed). */
  value: boolean;
  onChange: (v: boolean) => void;
  internalLabel: string;
  publicLabel: string;
  className?: string;
}

/**
 * Zendesk internal-note ↔ public-reply segmented toggle — the SoT for
 * "is this helpdesk comment private or emailed to the customer?"
 * Use only on external ticket surfaces (Support chat, claim modals).
 * Warehouse {@link ThreadNoteComposer} uses different chrome for entity threads.
 */
export function VisibilityToggle({ value, onChange, internalLabel, publicLabel, className }: Props) {
  return (
    <div className={cn('inline-flex rounded-lg bg-surface-sunken p-0.5', className)}>
      <button
        type="button"
        onClick={() => onChange(false)}
        className={cn(
          'ds-raw-button inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-role-caption font-semibold transition',
          !value ? 'bg-surface-card text-amber-700 shadow-sm' : 'text-text-soft hover:text-text-muted',
        )}
      >
        <Lock className="h-3.5 w-3.5" /> {internalLabel}
      </button>
      <button
        type="button"
        onClick={() => onChange(true)}
        className={cn(
          'ds-raw-button inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-role-caption font-semibold transition',
          value ? 'bg-surface-card text-blue-700 shadow-sm' : 'text-text-soft hover:text-text-muted',
        )}
      >
        <Globe className="h-3.5 w-3.5" /> {publicLabel}
      </button>
    </div>
  );
}
