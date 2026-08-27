'use client';

/**
 * Conversation message card — hard DS primitive for every chat / thread bubble.
 *
 * White-plane hosts paint gray public cards and amber internal washes via
 * {@link conversationShell}. Compose this; never a page-local bubble twin.
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
  /** Leading mark column (avatar / glyph). Compose {@link CONVERSATION_MARK_BOX}. */
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
      {mark != null ? mark : null}
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
