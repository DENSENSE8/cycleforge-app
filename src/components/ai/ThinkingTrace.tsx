'use client';

/**
 * The work behind an answer, in two faces (operator, 2026-09-27):
 *
 *  - {@link ThinkingLine} — WHILE the turn works and before any answer text:
 *    one line at the answer's position, "Thinking…" and then the live step in
 *    plain words ("Checking bin C-03-12-3…", `toolActivityLabel`), with the
 *    iris sweep across it. No spinner, no timeline, no counter row.
 *  - {@link ThinkingTrace} — AFTER, on demand only: the answer's lightbulb
 *    opens its "Thought process" inside the answer — numbered steps in plain
 *    words with what each returned, the reasoning as normal paragraphs, the
 *    cost (time, tokens) as the one muted line. Never a tool id, never JSON.
 */

import { useId } from 'react';
import { AnimatePresence, motion, useReducedMotion } from '@/design-system/motion';
import {
  AI_FOCUS_CLASS,
  AI_ICON_BUTTON_CLASS,
  AiTextShimmer,
  aiPresence,
  aiTransition,
  useMotionPresence,
  useMotionTransition,
} from '@/design-system/ai';
import { X } from '@/components/Icons';
import { humanizeToolNames, toolActivityLabel, toolDoneLabel } from '@/lib/assistant/tool-labels';
import type { AssistantStep, TurnUsage } from '@/lib/assistant/turn-trace';
import { cn } from '@/utils/_cn';

/** "860", "1.2k", "14k" — a token count at a glance. */
function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  return n < 10_000 ? `${(n / 1000).toFixed(1)}k` : `${Math.round(n / 1000)}k`;
}

/** "4s", "1m 5s"; under a second is still a moment, not "0s". */
function formatDuration(ms: number): string {
  if (ms < 1000) return '<1s';
  const total = Math.round(ms / 1000);
  if (total < 60) return `${total}s`;
  return `${Math.floor(total / 60)}m ${total % 60}s`;
}

type ToolStep = Extract<AssistantStep, { kind: 'tool' }>;

/**
 * The live line — the running step in plain words; a step that already
 * finished stays named while the model reads its result (a fast lookup would
 * otherwise never be seen); before any step, "Thinking…".
 */
export function ThinkingLine({ steps }: { steps: readonly AssistantStep[] }) {
  const last = steps.findLast((s): s is ToolStep => s.kind === 'tool');
  const label = !last
    ? 'Thinking…'
    : last.status === 'running'
      ? toolActivityLabel(last.name, last.input)
      : `${toolDoneLabel(last.name, last.input)} · thinking…`;
  // A new phrase replaces the old one in place and wipes in LEFT TO RIGHT
  // (a clip window opening from the left edge) — the same direction as the
  // shimmer sweep. No flip, no rotate. Reduced motion: a plain swap.
  const reduced = useReducedMotion();
  const wipe = useMotionTransition(aiTransition.wipe);
  return (
    <div className="flex min-h-6 min-w-0 items-center text-ai-prose-sm" data-thinking-line role="status" aria-live="polite">
      <motion.span
        key={label}
        initial={reduced ? false : { clipPath: 'inset(0 100% 0 0)' }}
        animate={{ clipPath: 'inset(0 0% 0 0)' }}
        transition={wipe}
        className="min-w-0 max-w-full"
      >
        <AiTextShimmer>{label}</AiTextShimmer>
      </motion.span>
    </div>
  );
}

/**
 * "Thought process" — opened only by the answer's lightbulb, inside that
 * answer, in the answer's own type: numbered steps in plain words ("Searched
 * locations for 00066-P-2 → 2 bins"), then the model's reasoning as ordinary
 * paragraphs, then one muted line of cost. × (or Esc, wired by the host) closes.
 */
export function ThinkingTrace({
  open,
  steps,
  thinkingMs,
  usage,
  onClose,
}: {
  open: boolean;
  steps: readonly AssistantStep[];
  thinkingMs: number | null;
  usage?: TurnUsage | null;
  onClose: () => void;
}) {
  const headingId = useId();
  const presence = useMotionPresence(aiPresence.reveal);
  const transition = useMotionTransition(aiTransition.reveal);
  const tools = steps.filter((s): s is ToolStep => s.kind === 'tool');
  const thoughts = steps
    .filter((s): s is Exclude<AssistantStep, ToolStep> => s.kind !== 'tool')
    .map((s) => humanizeToolNames(s.text.trim()))
    .filter(Boolean);
  const cost = [
    thinkingMs !== null ? `Thought for ${formatDuration(thinkingMs)}` : null,
    usage && usage.inputTokens !== null && usage.outputTokens !== null
      ? `${formatTokens(usage.inputTokens + usage.outputTokens)} tokens`
      : null,
    usage ? `${(usage.totalMs / 1000).toFixed(1)}s total` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.section
          key="thought-process"
          aria-labelledby={headingId}
          {...presence}
          transition={transition}
          className="overflow-hidden"
          data-thinking-trace
        >
          <div className="flex flex-col gap-3 pb-1">
            <div className="flex items-center justify-between gap-2">
              <h4 id={headingId} className="text-ai-title font-semibold text-ai-ink">
                Thought process
              </h4>
              <button
                type="button"
                aria-label="Close thought process"
                title="Close (Esc)"
                onClick={onClose}
                data-thinking-close
                className={cn('ds-raw-button h-7 w-7', AI_ICON_BUTTON_CLASS, AI_FOCUS_CLASS)}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            {tools.length > 0 ? (
              <ol className="ml-5 list-decimal space-y-1 text-ai-prose text-ai-ink marker:text-ai-faint">
                {tools.map((step, i) => (
                  <li key={i} className="pl-1" data-step="tool" data-status={step.status}>
                    {step.status === 'running' ? toolActivityLabel(step.name, step.input) : toolDoneLabel(step.name, step.input)}
                    {step.status === 'error' ? (
                      <span className="text-text-danger"> → failed</span>
                    ) : step.result ? (
                      <span> → {step.result}</span>
                    ) : null}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-ai-prose text-ai-ink">No lookups — answered from the conversation.</p>
            )}
            {thoughts.map((text, i) => (
              <p key={i} className="whitespace-pre-wrap text-ai-prose text-ai-ink" data-step="reasoning">
                {text}
              </p>
            ))}
            {cost ? (
              <p className="text-ai-label text-ai-faint" data-thinking-cost>
                {cost}
              </p>
            ) : null}
          </div>
        </motion.section>
      ) : null}
    </AnimatePresence>
  );
}
