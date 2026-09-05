'use client';

import { useId } from 'react';
import { Globe, Lock } from '@/components/Icons';
import { cursorClickTarget, motion, motionRole } from '@/design-system/motion';
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
 * The active face is a TRAVELLING PILL, not a class that blinks on and off:
 * one `motion.span` with a `layoutId` shared by both faces, so Motion animates
 * the selection from one segment to the other instead of cross-fading two
 * backgrounds. Physics is `motionRole.cursor.morph` — the same travelling-marker
 * spring the desk cursor uses to take a target's geometry, because a pill
 * sliding between segments and a cursor wearing an outline are the same job.
 * The `layoutId` is `useId`-scoped: two toggles on one screen must not hand
 * their pill back and forth across the page.
 *
 * Each face is a `cursorClickTarget` — Chrome-style pointer glyph, not box-wear.
 * The travelling pill is the selection. Floor stations never mount the cursor.
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
  const pillId = `visibility-pill-${useId()}`;
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
        {...cursorClickTarget(internalLabel)}
        className={cn(
          'ds-raw-button relative inline-flex items-center gap-1.5 text-role-caption font-semibold transition',
          flush ? 'rounded-none px-2 py-1' : cn(SEGMENTED_CONTROL_FACE_CORNER, 'px-2.5 py-1'),
          !value ? (flush ? 'text-amber-800' : 'text-amber-700') : 'text-text-soft hover:text-text-muted',
        )}
      >
        {!value ? (
          <motion.span
            aria-hidden
            layoutId={pillId}
            transition={motionRole.cursor.morph.transition}
            className={cn(
              'absolute inset-0',
              flush
                ? 'rounded-none bg-amber-50'
                : cn(SEGMENTED_CONTROL_FACE_CORNER, 'bg-surface-card shadow-sm'),
            )}
          />
        ) : null}
        <Lock className="relative h-3.5 w-3.5" /> <span className="relative">{internalLabel}</span>
      </button>
      <button
        type="button"
        onClick={() => onChange(true)}
        {...cursorClickTarget(publicLabel)}
        className={cn(
          'ds-raw-button relative inline-flex items-center gap-1.5 text-role-caption font-semibold transition',
          flush ? 'rounded-none px-2 py-1' : cn(SEGMENTED_CONTROL_FACE_CORNER, 'px-2.5 py-1'),
          value ? (flush ? 'text-blue-800' : 'text-blue-700') : 'text-text-soft hover:text-text-muted',
        )}
      >
        {value ? (
          <motion.span
            aria-hidden
            layoutId={pillId}
            transition={motionRole.cursor.morph.transition}
            className={cn(
              'absolute inset-0',
              flush
                ? 'rounded-none bg-blue-50'
                : cn(SEGMENTED_CONTROL_FACE_CORNER, 'bg-surface-card shadow-sm'),
            )}
          />
        ) : null}
        <Globe className="relative h-3.5 w-3.5" /> <span className="relative">{publicLabel}</span>
      </button>
    </div>
  );
}
