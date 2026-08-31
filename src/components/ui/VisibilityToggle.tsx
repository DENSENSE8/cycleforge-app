'use client';

import { Globe, Lock } from '@/components/Icons';
import {
  SEGMENTED_CONTROL_CORNER,
  SEGMENTED_CONTROL_FACE_CORNER,
} from '@/design-system/tokens/radius';
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
 *
 * Two corner appearances, and which one is right is about WHERE it sits:
 *
 * - `default` — {@link SEGMENTED_CONTROL_CORNER} track + faces, for a soft
 *   shell. The composer dock is the named exemption from the flush-square ops
 *   law, so a channel toggle on its action bar is rounded, not square.
 * - `flush` — square, for industrial ops chrome (kiosk, workbench rows).
 *
 * The corners are imported, not written here. They used to be `rounded-lg` /
 * `rounded-md` literals in this file, which put them outside the one place the
 * house states its corners — `ds_tokens({ axis: 'radius' })` could not see them
 * and `ds_critique` had nothing to check a call site against.
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
          : cn(SEGMENTED_CONTROL_CORNER, 'bg-surface-sunken p-0.5'),
        className,
      )}
    >
      <button
        type="button"
        onClick={() => onChange(false)}
        className={cn(
          'ds-raw-button inline-flex items-center gap-1.5 text-role-caption font-semibold transition',
          flush ? 'rounded-none px-2 py-1' : cn(SEGMENTED_CONTROL_FACE_CORNER, 'px-2.5 py-1'),
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
          flush ? 'rounded-none px-2 py-1' : cn(SEGMENTED_CONTROL_FACE_CORNER, 'px-2.5 py-1'),
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
