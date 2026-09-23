'use client';

/**
 * The answer to a door scan, painted where the operator is already looking —
 * directly under the scan bar on `/m/scan`.
 *
 * Station law (`display/station.md` §6): a scan that changes state must land as
 * a CARD, not a toast. A toast is the wrong shape for a warehouse phone — it
 * expires on its own schedule while the operator's eyes are on the carton, and
 * it cannot be tapped into the record it is describing. This card persists until
 * the next scan replaces it, states the outcome in one word, and carries the
 * one action that follows (open the carton).
 *
 * Tone chrome is derived from {@link MobileScanVerdict.tone} only — the banner
 * has no opinion of its own, so what it shows can never disagree with the
 * audio/haptic cue fired from the same verdict.
 */

import { motion } from '@/design-system/motion';
import { AlertTriangle, Check, ChevronRight, X, Zap } from '@/components/Icons';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import type { MobileScanTone, MobileScanVerdict } from './scan-verdict';

/**
 * One row per tone: the surface, the rule, the ink, and the glyph. Kept as a
 * table rather than branches so adding an outcome is a line, not a refactor.
 */
const TONE: Record<
  MobileScanTone,
  { box: string; ink: string; chip: string; icon: (p: { className?: string }) => JSX.Element }
> = {
  matched: {
    box: 'border-border-success bg-surface-success',
    ink: 'text-text-success',
    chip: 'bg-fill-success text-text-inverse',
    icon: Check,
  },
  expedited: {
    box: 'border-border-warning bg-surface-warning',
    ink: 'text-text-warning',
    chip: 'bg-fill-warning text-text-inverse',
    icon: Zap,
  },
  unfound: {
    box: 'border-border-warning bg-surface-warning',
    ink: 'text-text-warning',
    chip: 'bg-fill-warning text-text-inverse',
    icon: AlertTriangle,
  },
  miss: {
    box: 'border-border-danger bg-surface-danger',
    ink: 'text-text-danger',
    chip: 'bg-fill-danger text-text-inverse',
    icon: X,
  },
  error: {
    box: 'border-border-danger bg-surface-danger',
    ink: 'text-text-danger',
    chip: 'bg-fill-danger text-text-inverse',
    icon: AlertTriangle,
  },
};

export function MobileScanVerdictBanner({
  verdict,
  onOpenCarton,
}: {
  verdict: MobileScanVerdict;
  /** Provided only when the verdict points at a real carton. */
  onOpenCarton?: (receivingId: number) => void;
}) {
  const tone = TONE[verdict.tone];
  const Icon = tone.icon;
  const receivingId = verdict.receivingId;
  const openable = receivingId != null && !!onOpenCarton;

  const body = (
    <>
      <span
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center',
          cornerClass('flush'),
          tone.chip,
        )}
        aria-hidden
      >
        <Icon className="h-5 w-5" />
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
        <span className={cn('text-base font-bold uppercase tracking-[0.14em]', tone.ink)}>
          {verdict.headline}
        </span>
        {/* The scanned value is mono + truncated from the FRONT: a carrier
            number's identity lives in its last digits, so an ellipsis belongs
            at the head, never the tail. */}
        <span className="truncate font-mono text-role-caption text-text-muted" dir="rtl">
          {verdict.scanned}
        </span>
        {verdict.detail && (
          // Clamped, not truncated: a PO number cut mid-string is worse than a
          // second line, but an unbounded detail would let the card grow and
          // shove the triage rail below the fold.
          <span
            className={cn('line-clamp-2 text-role-caption font-medium', tone.ink, 'opacity-80')}
          >
            {verdict.detail}
          </span>
        )}
      </span>

      {openable && <ChevronRight className={cn('h-5 w-5 shrink-0', tone.ink)} />}
    </>
  );

  const shell = cn(
    'flex w-full items-center gap-3 border px-3 py-3',
    cornerClass('flush'),
    tone.box,
  );

  return (
    <motion.div
      // Keyed by the scan in the parent, so a re-scan of the SAME label still
      // re-runs this entrance — the operator's proof the gun fired again.
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
      role="status"
      aria-live="assertive"
    >
      {openable ? (
        <button
          type="button"
          onClick={() => onOpenCarton?.(receivingId)}
          className={cn(shell, 'ds-raw-button active:opacity-80')}
          aria-label={`${verdict.headline} — open carton ${receivingId}`}
        >
          {body}
        </button>
      ) : (
        <div className={shell}>{body}</div>
      )}
    </motion.div>
  );
}
