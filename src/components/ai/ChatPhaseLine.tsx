'use client';

/**
 * ChatPhaseLine — "what is the agent doing right now", morphing.
 *
 * The phase line is the only signal a turn is moving, so when the agent swaps
 * tools mid-turn ("Reading the packing KPIs…" → "Checking receiving
 * exceptions…") the swap itself should feel like work continuing, not a label
 * being replaced. Motion+ `ScrambleText` settles the new phrase out of
 * character noise (studio-grade status morph); the timing is the catalog's
 * `framerDuration.chatPhaseScramble`, so no call site invents a duration.
 *
 * Accessibility: the SETTLED phrase is what means something, so the visual
 * scramble is aria-hidden and a visually-hidden live region carries the clean
 * text — a screen reader hears the phrase once, at phrase-swap cadence, not
 * every character frame.
 *
 * Reduced motion: plain text swap, no scramble (a shivering line is the
 * definition of motion with no information gain).
 */

import { Loader2 } from '@/components/Icons';
import { useReducedMotion } from '@/design-system/motion';
import { ScrambleText } from '@/design-system/motion/plus';
import { framerDuration } from '@/design-system/foundations/motion-framer';
import { toolActivityPhrase } from '@/lib/assistant/tool-activity';
import { cn } from '@/utils/_cn';

export function ChatPhaseLine({ tool, className }: { tool: string; className?: string }) {
  const reduced = useReducedMotion();
  const phrase = `${toolActivityPhrase(tool)}…`;
  return (
    <p
      aria-live="polite"
      className={cn('flex items-center gap-1.5 text-role-caption leading-5 text-text-muted', className)}
    >
      <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
      <span className="sr-only">{phrase}</span>
      {reduced ? (
        <span aria-hidden>{phrase}</span>
      ) : (
        <ScrambleText
          aria-hidden
          duration={framerDuration.chatPhaseScramble}
          interval={0.04}
          className="min-w-0"
        >
          {phrase}
        </ScrambleText>
      )}
    </p>
  );
}
