'use client';

/**
 * Conversation message row — hard DS primitive for every chat / thread entry.
 *
 * A row on a connected activity timeline, not a bubble: the caller's `mark`
 * becomes the NODE, this component threads the spine behind it, and the body
 * sits beside it on the stream's own plane. Compose this; never a page-local
 * twin.
 *
 * Callers hand in an already-boxed mark ({@link CONVERSATION_MARK_BOX}) and do
 * not know the spine exists — which is the point. A host that had to draw its
 * own connector would draw it at its own x, and two hosts would disagree about
 * where the thread runs.
 *
 * Clock time sits IN the message card (Telegram): floated onto the last line
 * of copy. Civil date is a centred divider in the stream, not this row.
 */

import type { ReactNode } from 'react';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { useTimeFormat } from '@/lib/time-format/useTimeFormat';
import { formatDateTimePST, formatStageClockTimePST } from '@/utils/date';
import { cn } from '@/utils/_cn';
import {
  CONVERSATION_AUTHOR,
  CONVERSATION_CLOCK,
  CONVERSATION_CLOCK_PAD,
  CONVERSATION_COPY,
  CONVERSATION_INTERNAL_CHIP,
  CONVERSATION_META,
  CONVERSATION_ROW,
  CONVERSATION_SPINE,
  CONVERSATION_SPINE_TRACK,
  conversationShell,
} from './conversation-chrome';

export function ConversationMessageCard({
  internal = false,
  mark,
  author,
  at,
  atAbsolute,
  internalLabel = 'Internal note',
  metaTrailing,
  children,
  footer,
  className,
  'data-testid': testId,
}: {
  /** Private / internal note — amber wash + chip. */
  internal?: boolean;
  /**
   * The timeline NODE (avatar / glyph). Compose {@link CONVERSATION_MARK_BOX};
   * the spine is threaded behind it here, so it must stay opaque.
   */
  mark?: ReactNode;
  author?: string;
  /** Instant for the in-card clock. Absolute stays on hover when `atAbsolute` set. */
  at?: string | Date | null;
  atAbsolute?: string | null;
  internalLabel?: string;
  /** Extra meta (edited · menu). */
  metaTrailing?: ReactNode;
  children: ReactNode;
  /**
   * Chips / thumbs BELOW copy. Keep them out of {@link children} so the
   * last-line clock is not pushed onto its own row after a block of media.
   */
  footer?: ReactNode;
  className?: string;
  'data-testid'?: string;
}) {
  useTimeFormat();
  const clock = at != null ? formatStageClockTimePST(at) : null;
  const clockLabel =
    atAbsolute ?? (at != null ? formatDateTimePST(at) : null);
  const showClock = Boolean(clock && clock !== '--:--');
  const clockFace = showClock ? (
    clockLabel ? (
      <HoverTooltip label={clockLabel} focusable={false} asChild>
        <span className={CONVERSATION_CLOCK} data-conversation-clock="">
          {clock}
        </span>
      </HoverTooltip>
    ) : (
      <span className={CONVERSATION_CLOCK} data-conversation-clock="">
        {clock}
      </span>
    )
  ) : null;

  return (
    <div
      data-conversation-card=""
      data-stream-shell="bubble"
      data-internal={internal ? 'true' : undefined}
      data-testid={testId}
      className={cn(CONVERSATION_ROW, className)}
    >
      {mark != null ? (
        <div className={CONVERSATION_SPINE_TRACK}>
          <span aria-hidden className={CONVERSATION_SPINE} />
          {mark}
        </div>
      ) : null}
      <div className={conversationShell(internal)}>
        {author || internal || metaTrailing ? (
          <div className={CONVERSATION_META}>
            {author ? <span className={CONVERSATION_AUTHOR}>{author}</span> : null}
            {internal ? (
              <>
                {author ? (
                  <span aria-hidden className="text-text-faint">
                    ·
                  </span>
                ) : null}
                <span className={CONVERSATION_INTERNAL_CHIP}>{internalLabel}</span>
              </>
            ) : null}
            {metaTrailing}
          </div>
        ) : null}
        <div className={CONVERSATION_COPY}>
          {children}
          {showClock ? (
            <span className={CONVERSATION_CLOCK_PAD} aria-hidden>
              {clock}
            </span>
          ) : null}
          {clockFace}
        </div>
        {footer}
      </div>
    </div>
  );
}
