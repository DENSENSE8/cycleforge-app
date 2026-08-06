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
  /**
   * `flush` = square claim/Displays instrument (no pad, no radius).
   * Default keeps Support chat pill chrome.
   */
  appearance?: 'default' | 'flush';
}

/**
 * Zendesk internal-note ↔ public-reply segmented toggle — the SoT for
 * "is this helpdesk comment private or emailed to the customer?"
 * Use only on external ticket surfaces (Support chat, claim modals).
 * Warehouse {@link ThreadNoteComposer} uses different chrome for entity threads.
 */
export function VisibilityToggle({
  value,
  onChange,
  internalLabel,
  publicLabel,
  className,
  appearance = 'default',
}: Props) {
  const flush = appearance === 'flush';
  return (
    <div
      className={cn(
        'inline-flex',
        flush
          ? 'gap-0 rounded-none border border-border-hairline bg-surface-canvas p-0'
          : 'rounded-lg bg-surface-sunken p-0.5',
        className,
      )}
    >
      <button
        type="button"
        onClick={() => onChange(false)}
        className={cn(
          'ds-raw-button inline-flex items-center gap-1.5 text-role-caption font-semibold transition',
          flush ? 'rounded-none px-2 py-1' : 'rounded-md px-2.5 py-1',
          !value
            ? flush
              ? 'bg-amber-50 text-amber-800'
              : 'bg-surface-card text-amber-700 shadow-sm'
            : 'text-text-soft hover:text-text-muted',
        )}
      >
        <Lock className="h-3.5 w-3.5" /> {internalLabel}
      </button>
      <button
        type="button"
        onClick={() => onChange(true)}
        className={cn(
          'ds-raw-button inline-flex items-center gap-1.5 text-role-caption font-semibold transition',
          flush ? 'rounded-none px-2 py-1' : 'rounded-md px-2.5 py-1',
          value
            ? flush
              ? 'bg-blue-50 text-blue-800'
              : 'bg-surface-card text-blue-700 shadow-sm'
            : 'text-text-soft hover:text-text-muted',
        )}
      >
        <Globe className="h-3.5 w-3.5" /> {publicLabel}
      </button>
    </div>
  );
}
