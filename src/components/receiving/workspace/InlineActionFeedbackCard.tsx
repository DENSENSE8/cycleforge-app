'use client';

/** Shared inline success/error checklist card — the same visual language as Receive complete (tone left bar, staggered checks, optional… */

import type { ReactNode } from 'react';
import { motion, useReducedMotion, type Variants } from '@/design-system/motion';
import { AlertTriangle, Check, X } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IconButton } from '@/design-system/primitives';
import { useMotionPresence } from '@/design-system/foundations/motion-presets-hooks';
import {
  INLINE_ACTION_FEEDBACK_TONE,
  type InlineActionFeedbackTone,
} from './inline-action-feedback-tone';

// Re-exported so the ~5 existing `from './InlineActionFeedbackCard'` imports
// keep resolving; the map itself lives in the React-free sibling above.
export {
  INLINE_ACTION_FEEDBACK_TONE,
  toneFromVerdictHue,
  type InlineActionFeedbackTone,
  type InlineActionFeedbackPalette,
} from './inline-action-feedback-tone';

export type InlineActionFeedbackPayload = {
  tone: InlineActionFeedbackTone;
  headline: string;
  items: string[];
  note?: string;
  at: number;
};

const CHECK_ICON_VARIANTS: Variants = {
  initial: { scale: 0.5, opacity: 0 },
  animate: {
    scale: 1,
    opacity: 1,
    transition: { type: 'spring', stiffness: 500, damping: 26 },
  },
};

/**
 * The staggered check list — extracted so the welded receive panel can mount
 * the same rows inside its disclosure without re-implementing the stagger.
 */
export function InlineActionFeedbackChecklist({
  tone,
  items,
  className = '',
}: {
  tone: InlineActionFeedbackTone;
  items: string[];
  className?: string;
}) {
  const reduce = useReducedMotion();
  const item = useMotionPresence({ initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 } });
  const palette = INLINE_ACTION_FEEDBACK_TONE[tone];
  if (items.length === 0) return null;
  return (
    <motion.ul
      className={`space-y-1 ${className}`.trim()}
      initial="initial"
      animate="animate"
      variants={{
        animate: {
          transition: {
            staggerChildren: reduce ? 0 : 0.08,
            delayChildren: reduce ? 0 : 0.04,
          },
        },
      }}
    >
      {items.map((label, i) => (
        <motion.li
          key={`${i}-${label}`}
          variants={item as Variants}
          className={`flex items-start gap-1.5 text-role-caption font-semibold leading-snug ${palette.body}`}
        >
          <motion.span variants={reduce ? undefined : CHECK_ICON_VARIANTS} className="mt-px shrink-0">
            <Check className={`h-4 w-4 ${palette.icon}`} />
          </motion.span>
          <span className="min-w-0 break-words whitespace-pre-wrap">{label}</span>
        </motion.li>
      ))}
    </motion.ul>
  );
}

export function InlineActionFeedbackCard({
  tone,
  headline,
  items,
  note,
  at,
  onDismiss,
  footer,
  className = '',
}: {
  tone: InlineActionFeedbackTone;
  headline: string;
  items: string[];
  note?: string;
  /** When set, shows a compact time in the header row. */
  at?: number;
  onDismiss?: () => void;
  /** Extra rows below the checklist (e.g. receive sync footer, details). */
  footer?: ReactNode;
  className?: string;
}) {
  const palette = INLINE_ACTION_FEEDBACK_TONE[tone];
  const timestamp =
    at != null
      ? new Date(at).toLocaleTimeString([], {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        })
      : null;

  return (
    <div className={`relative overflow-hidden rounded-lg border ${palette.border} ${palette.bg} ${className}`.trim()}>
      <span className={`absolute inset-y-0 left-0 w-[3px] ${palette.bar}`} aria-hidden />
      <div className="flex items-start gap-2 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className={`text-role-eyebrow uppercase tracking-widest ${palette.title}`}>
              {headline}
            </p>
            {timestamp ? (
              <span className="shrink-0 text-role-eyebrow font-semibold tabular-nums text-text-faint">
                {timestamp}
              </span>
            ) : null}
          </div>

          <InlineActionFeedbackChecklist tone={tone} items={items} className="mt-1.5" />

          {note ? (
            <p className="mt-1.5 flex items-start gap-1.5 text-role-micro font-medium leading-snug text-text-muted">
              {tone === 'warning' || tone === 'error' ? (
                <AlertTriangle className={`mt-px h-3.5 w-3.5 shrink-0 ${palette.icon}`} />
              ) : null}
              <span className="min-w-0 break-words whitespace-pre-wrap">{note}</span>
            </p>
          ) : null}

          {footer}
        </div>

        {onDismiss ? (
          <HoverTooltip label="Dismiss" asChild>
            <IconButton
              ariaLabel="Dismiss"
              onClick={onDismiss}
              className="shrink-0 rounded p-0.5 text-text-faint hover:bg-surface-card/60 hover:text-text-muted"
              icon={<X className="h-3 w-3" />}
            />
          </HoverTooltip>
        ) : null}
      </div>
    </div>
  );
}
