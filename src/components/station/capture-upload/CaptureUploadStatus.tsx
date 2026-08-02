'use client';

import { AnimatePresence, motion } from '@/design-system/motion';
import { framerPresence, framerTransition } from '@/design-system/foundations/motion-framer';
import {
  useMotionPresence,
  useMotionTransition,
} from '@/design-system/foundations/motion-framer-hooks';
import { AlertTriangle, Check, Loader2, RefreshCw, X } from '@/components/Icons';
import { Button, IconButton } from '@/design-system/primitives';
import {
  captureUploadKey,
  distinctFailureReasons,
  type CaptureUploadEntry,
  type CaptureUploadSummary,
} from './capture-upload-model';

/**
 * **The capture-upload status card — one compound for every Station bench.**
 *
 * Replaces the toast as the completion/failure signal for background photo
 * uploads. Station law: pass/fail is a big card state the operator can read at
 * ~3 ft with their hands full, never a four-second corner toast
 * (`.claude/rules/display/station.md` §6). A failed upload stays on screen with
 * a **Retry** the operator can actually press — before this, `retry()` existed
 * on all three queues and was reachable from no UI at all.
 *
 * Presentational by construction: it takes entries + summary + callbacks and
 * imports no queue. That is what lets Receiving, Pack and Unit share one face
 * today (via {@link useCaptureUploadStatus}) and lets a desk-side surface mount
 * the same component against a different source in P1 — rather than each bench
 * growing the page-local upload strip this program exists to prevent.
 *
 * Motion: `framerPresence.composerDock` (a bottom-anchored dock rising into
 * place — the same job, so the same preset) routed through the reduced-motion
 * bridge, per D10. Pinned by `station-motion-bridge.guard.test.ts`.
 */

const TONE_GLYPH = {
  active: <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-600" />,
  failed: <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />,
  committed: <Check className="h-4 w-4 shrink-0 text-emerald-600" />,
} as const;

const TONE_TEXT = {
  active: 'text-text-default',
  failed: 'text-rose-700',
  committed: 'text-text-default',
} as const;

const TONE_SHELL = {
  active: 'border-border-soft',
  failed: 'border-rose-200',
  committed: 'border-border-soft',
} as const;

export interface CaptureUploadStatusProps {
  entries: CaptureUploadEntry[];
  summary: CaptureUploadSummary;
  onRetryAll: () => void;
  /** Dismiss the resting "N photos saved" confirmation. */
  onDismissCommitted: () => void;
  className?: string;
}

export function CaptureUploadStatus({
  entries,
  summary,
  onRetryAll,
  onDismissCommitted,
  className,
}: CaptureUploadStatusProps) {
  const presence = useMotionPresence(framerPresence.composerDock);
  const transition = useMotionTransition(framerTransition.composerDockMount);

  const { tone } = summary;
  const visible = tone !== 'idle';
  const reasons = distinctFailureReasons(entries);

  // Thumbnails of the work still in flight — the operator's own frames are the
  // fastest confirmation that the right shots are moving. Capped so a 12-photo
  // burst cannot push the headline off a phone screen.
  const thumbs = entries
    .filter((e) => e.state === 'queued' || e.state === 'uploading')
    .filter((e) => !!e.previewUrl)
    .slice(0, 4);

  return (
    // AnimatePresence stays OUTSIDE the conditional — behind the `&&` it would
    // unmount before it could play the exit (motion-crossfade.md).
    <AnimatePresence initial={false}>
      {visible ? (
        <motion.div
          key="capture-upload-status"
          initial={presence.initial}
          animate={presence.animate}
          exit={presence.exit}
          transition={transition}
          role="status"
          aria-live={tone === 'failed' ? 'assertive' : 'polite'}
          className={[
            'pointer-events-auto w-full overflow-hidden rounded-2xl border bg-surface-card shadow-sm',
            TONE_SHELL[tone],
            className ?? '',
          ]
            .filter(Boolean)
            .join(' ')}
          data-capture-upload-tone={tone}
        >
          <div className="flex items-center gap-2.5 inset-field">
            {TONE_GLYPH[tone]}

            <p className={`min-w-0 flex-1 truncate text-role-caption font-semibold ${TONE_TEXT[tone]}`}>
              {summary.headline}
              {/* A failure must not erase the work still moving beside it. */}
              {tone === 'failed' && summary.inFlight > 0 ? (
                <span className="font-normal text-text-soft"> · {summary.inFlight} still uploading</span>
              ) : null}
            </p>

            {thumbs.length > 0 ? (
              <span className="flex shrink-0 -space-x-1.5">
                {thumbs.map((e) => (
                  // eslint-disable-next-line @next/next/no-img-element -- blob: object URL, never an optimizable remote asset
                  <img
                    key={captureUploadKey(e)}
                    src={e.previewUrl}
                    alt=""
                    className="h-6 w-6 rounded-md border border-border-hairline object-cover"
                  />
                ))}
              </span>
            ) : null}

            {tone === 'failed' ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={onRetryAll}
                icon={<RefreshCw className="h-3.5 w-3.5" />}
                className="shrink-0"
              >
                Retry
              </Button>
            ) : null}

            {tone === 'committed' ? (
              <IconButton
                type="button"
                size="xs"
                onClick={onDismissCommitted}
                ariaLabel="Dismiss upload confirmation"
                className="shrink-0"
                icon={<X className="h-3.5 w-3.5" />}
              />
            ) : null}
          </div>

          {reasons.length > 0 ? (
            <ul className="border-t border-rose-200 bg-rose-50 px-3 py-2">
              {reasons.map((reason) => (
                <li key={reason} className="text-role-micro text-rose-700">
                  {reason}
                </li>
              ))}
            </ul>
          ) : null}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
