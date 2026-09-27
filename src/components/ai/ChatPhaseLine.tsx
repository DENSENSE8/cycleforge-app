'use client';

/**
 * ChatPhaseLine — "what is the agent doing right now", morphing.
 *
 * The phase line is the only signal a turn is moving, so when the agent swaps
 * tools mid-turn ("Reading the packing KPIs…" → "Checking receiving
 * exceptions…") the swap itself should feel like work continuing, not a label
 * being replaced. Motion+ `ScrambleText` settles the new phrase out of
 * character noise (studio-grade status morph); the timing is the AI system's
 * `AI_PHASE_SCRAMBLE_DURATION`, so no call site invents a duration.
 *
 * Accessibility: the SETTLED phrase is what means something, so the visual
 * scramble is aria-hidden and a visually-hidden live region carries the clean
 * text — a screen reader hears the phrase once, at phrase-swap cadence, not
 * every character frame.
 *
 * Reduced motion: plain text swap, no scramble (a shivering line is the
 * definition of motion with no information gain).
 *
 * Phrasing-content root (`span`), so it can sit inside the thinking
 * disclosure's toggle button. The caller resolves the phrase
 * (`toolActivityPhrase` for a running tool); this appends the "…".
 */

import { useReducedMotion } from '@/design-system/motion';
import { ScrambleText } from '@/design-system/motion/plus';
import { AI_PHASE_SCRAMBLE_DURATION, AiIrisSpinner } from '@/design-system/ai';
import { cn } from '@/utils/_cn';

export function ChatPhaseLine({
  phrase: activity,
  indicator = true,
  className,
}: {
  phrase: string;
  /** Lead with the iris spinner — off when the live step row beside it already carries one. */
  indicator?: boolean;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const phrase = `${activity}…`;
  return (
    <span
      aria-live="polite"
      className={cn('flex min-w-0 items-center gap-1.5 text-ai-prose-sm text-ai-muted', className)}
    >
      {indicator ? <AiIrisSpinner /> : null}
      <span className="sr-only">{phrase}</span>
      {reduced ? (
        <span aria-hidden>{phrase}</span>
      ) : (
        <ScrambleText
          aria-hidden
          duration={AI_PHASE_SCRAMBLE_DURATION}
          interval={0.04}
          className="min-w-0"
        >
          {phrase}
        </ScrambleText>
      )}
    </span>
  );
}
