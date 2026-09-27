'use client';

import type { ReactNode } from 'react';
import { ChevronRight } from '@/components/Icons';
import { motion } from '@/design-system/motion';
import { cn } from '@/utils/_cn';
import {
  AI_CARD_CLASS,
  AI_CARD_GLYPH_CLASS,
  AI_CARD_SELECTED_CLASS,
  AI_FOCUS_CLASS,
  AI_SKELETON_BAR_CLASS,
} from './classes';
import { aiGesture, aiPresence, aiTransition, useMotionPresence, useMotionTransition } from './motion';

export interface AiArtifactCardProps {
  title: string;
  /** What it is — "Table", "Timeline", "Record". */
  kind: string;
  /** How big it is — "12 rows", "4 events". Omitted when the kind has no count. */
  count?: string | null;
  /** The kind's glyph, sized by the caller (`h-4 w-4`). */
  icon: ReactNode;
  /** This artifact is the one open in the side panel. */
  selected?: boolean;
  /**
   * Announced by the model (`ui_tool_start render_artifact`), payload still
   * streaming: a SKELETON card that is not openable yet. The real card replaces
   * it when the artifact lands.
   */
  pending?: boolean;
  /** A later turn failed; this answer may be out of date. */
  stale?: boolean;
  onOpen?: () => void;
  className?: string;
}

/**
 * AiArtifactCard — the compact face of an artifact IN the transcript.
 *
 * Title + kind + count, one click to open it in the side panel. The data
 * itself never renders in the column: the column is the conversation, the
 * panel is where the operator chooses to look.
 */
export function AiArtifactCard({
  title,
  kind,
  count,
  icon,
  selected = false,
  pending = false,
  stale = false,
  onOpen,
  className,
}: AiArtifactCardProps) {
  const presence = useMotionPresence(aiPresence.turn);
  const transition = useMotionTransition(aiTransition.turn);
  const meta = [kind, count, stale ? 'may be out of date' : null].filter(Boolean).join(' · ');
  return (
    <motion.button
      type="button"
      {...presence}
      transition={transition}
      whileHover={pending ? undefined : aiGesture.card.whileHover}
      whileTap={pending ? undefined : aiGesture.card.whileTap}
      disabled={pending}
      aria-pressed={pending ? undefined : selected}
      aria-busy={pending || undefined}
      aria-label={pending ? 'Preparing a result' : undefined}
      onClick={onOpen}
      data-ai-artifact-card={pending ? 'pending' : 'ready'}
      className={cn(
        AI_CARD_CLASS,
        AI_FOCUS_CLASS,
        'ds-raw-button flex w-full max-w-sm items-center gap-3 px-3 py-2.5 text-left disabled:cursor-progress',
        selected && AI_CARD_SELECTED_CLASS,
        className,
      )}
    >
      <span className={cn(AI_CARD_GLYPH_CLASS, pending && 'animate-pulse')} aria-hidden>
        {icon}
      </span>
      {pending ? (
        <span className="flex min-w-0 flex-1 animate-pulse flex-col gap-2 py-0.5" aria-hidden>
          <span className={cn(AI_SKELETON_BAR_CLASS, 'h-3 w-40')} />
          <span className={cn(AI_SKELETON_BAR_CLASS, 'h-2.5 w-24')} />
        </span>
      ) : (
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-ai-title text-ai-ink">{title}</span>
          <span className={cn('truncate text-ai-label', stale ? 'text-text-warning' : 'text-ai-faint')}>{meta}</span>
        </span>
      )}
      {pending ? null : <ChevronRight className="h-4 w-4 shrink-0 text-ai-faint" aria-hidden />}
    </motion.button>
  );
}
