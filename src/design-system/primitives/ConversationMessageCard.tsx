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
 */

import type { ReactNode } from 'react';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { cn } from '@/utils/_cn';
import {
  CONVERSATION_AGE,
  CONVERSATION_AUTHOR,
  CONVERSATION_INTERNAL_CHIP,
  CONVERSATION_META,
  CONVERSATION_ROW,
  CONVERSATION_SPINE,
  CONVERSATION_SPINE_TRACK,
  conversationShell,
  formatConversationAge,
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
  /** ISO / Date for relative age; absolute stays on hover when `atAbsolute` set. */
  at?: string | Date | null;
  atAbsolute?: string | null;
  internalLabel?: string;
  /** Extra meta (edited · menu). */
  metaTrailing?: ReactNode;
  children: ReactNode;
  className?: string;
  'data-testid'?: string;
}) {
  const age = at != null ? formatConversationAge(at) : null;
  const ageNode =
    age == null ? null : atAbsolute ? (
      <HoverTooltip label={atAbsolute} focusable={false}>
        <span className={CONVERSATION_AGE}>{age}</span>
      </HoverTooltip>
    ) : (
      <span className={CONVERSATION_AGE}>{age}</span>
    );

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
        {author || ageNode || internal || metaTrailing ? (
          <div className={CONVERSATION_META}>
            {author ? <span className={CONVERSATION_AUTHOR}>{author}</span> : null}
            {author && ageNode ? (
              <span aria-hidden className="text-text-faint">
                ·
              </span>
            ) : null}
            {ageNode}
            {internal ? (
              <>
                {(author || ageNode) && (
                  <span aria-hidden className="text-text-faint">
                    ·
                  </span>
                )}
                <span className={CONVERSATION_INTERNAL_CHIP}>{internalLabel}</span>
              </>
            ) : null}
            {metaTrailing}
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
}
