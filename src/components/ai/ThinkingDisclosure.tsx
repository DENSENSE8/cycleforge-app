'use client';

/**
 * ThinkingDisclosure — the visible work above an assistant reply (the
 * coding-harness grammar, on the AI design system).
 *
 * OPEN while the turn works: the live timeline builds step by step — each row
 * enters as it starts, the live row carries the iris spinner and shimmer, and
 * its spinner morphs into ✓ / ✕ with the done-phrase and a short result
 * ("3 results") when the tool reports back. It AUTO-COLLAPSES the moment the
 * answer starts streaming, to "Thought for 4s · 3 steps"; clicking re-opens
 * it. Each tool row clicks open to its humanised detail (`key: value`) —
 * never a tool id, never JSON.
 *
 * Self-contained on purpose: it owns its open state and reads only the turn's
 * `steps` / `thinkingMs` (`@/lib/assistant/turn-trace`), so the transcript
 * that hosts it can be re-laid-out without touching it.
 */

import { useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion } from '@/design-system/motion';
import {
  AI_FOCUS_CLASS,
  AI_STEP_ROW_CLASS,
  AI_STEP_STAGGER,
  AiIrisSpinner,
  AiShimmer,
  aiPresence,
  aiTransition,
  useMotionPresence,
  useMotionTransition,
} from '@/design-system/ai';
import { Check, ChevronRight, X } from '@/components/Icons';
import { ChatPhaseLine } from '@/components/ai/ChatPhaseLine';
import { humanizeToolInput, toolDonePhrase } from '@/lib/assistant/tool-activity';
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

export function ThinkingDisclosure({
  steps,
  thinkingMs,
  streaming,
  answering,
  usage,
  className,
}: {
  steps: readonly AssistantStep[];
  thinkingMs: number | null;
  /** The turn is still streaming. */
  streaming: boolean;
  /** Answer text has started arriving — the timeline folds away. */
  answering: boolean;
  /** What the turn cost — shown in the header while it is open. */
  usage?: TurnUsage | null;
  className?: string;
}) {
  // `null` = follow the turn (open while working, closed once answering); a
  // click pins the operator's choice until the turn changes phase.
  const [pinned, setPinned] = useState<boolean | null>(null);
  const working = streaming && !answering;
  useEffect(() => setPinned(null), [working]);
  const open = pinned ?? working;
  const regionId = useId();
  const presence = useMotionPresence(aiPresence.reveal);
  const transition = useMotionTransition(aiTransition.reveal);
  // Every MODEL turn gets its row — "Thought for 2s" is the provenance of an
  // answer no tool backs. A deterministic reply (no model round: no steps, no
  // thinking time) has nothing to disclose.
  if (!streaming && steps.length === 0 && thinkingMs === null) return null;

  const tools = steps.filter((s): s is ToolStep => s.kind === 'tool');
  const running = tools.findLast((s) => s.status === 'running');
  const livePhrase = running ? running.phrase : answering ? 'Writing the answer' : 'Thinking';
  const failed = tools.filter((s) => s.status === 'error').length;
  const summary = [
    `Thought for ${formatDuration(thinkingMs ?? 0)}`,
    tools.length > 0 ? `${tools.length} ${tools.length === 1 ? 'step' : 'steps'}` : null,
    failed > 0 ? `${failed} failed` : null,
    // The expanded header also says what the turn cost: tokens, then wall time.
    open && usage && usage.inputTokens !== null && usage.outputTokens !== null
      ? `${formatTokens(usage.inputTokens + usage.outputTokens)} tokens`
      : null,
    open && usage ? `${(usage.totalMs / 1000).toFixed(1)}s` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className={cn('min-w-0', className)} data-testid="thinking-disclosure">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? regionId : undefined}
        onClick={() => setPinned(!open)}
        data-testid="thinking-disclosure-toggle"
        className={cn(
          'ds-raw-button -ml-1.5 flex max-w-full items-center gap-1.5 rounded-ai-step px-1.5 py-0.5 text-left text-ai-prose-sm text-ai-faint',
          'transition-colors hover:bg-ai-hover hover:text-ai-muted',
          AI_FOCUS_CLASS,
        )}
      >
        <ChevronRight className={cn('h-3 w-3 shrink-0 transition-transform duration-200', open && 'rotate-90')} />
        {streaming ? (
          // The live step row carries the spinner while the timeline is open.
          <ChatPhaseLine phrase={livePhrase} indicator={!(open && running)} />
        ) : (
          <span className="min-w-0 truncate">{summary}</span>
        )}
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="steps"
            id={regionId}
            role="region"
            aria-label="Thinking history"
            initial={presence.initial}
            animate={presence.animate}
            exit={presence.exit}
            transition={transition}
            className="overflow-hidden"
          >
            <StepTimeline steps={steps} streaming={streaming} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function StepTimeline({ steps, streaming }: { steps: readonly AssistantStep[]; streaming: boolean }) {
  // Rows present when the timeline opens enter as a quick stagger; rows that
  // arrive later (live) enter on their own, immediately.
  const openedWith = useRef(steps.length);
  const presence = useMotionPresence(aiPresence.step);
  const enter = useMotionTransition(aiTransition.turn);
  return (
    <ol className="mb-1 ml-1 mt-1.5 space-y-0.5 border-l border-ai-line pl-2.5" data-testid="thinking-steps">
      {steps.length === 0 ? (
        <li className="px-2 py-1 text-ai-prose-sm text-ai-faint">
          {streaming ? 'Getting started…' : 'No tools ran — answered from the model alone.'}
        </li>
      ) : (
        steps.map((step, i) => (
          <motion.li
            key={i}
            initial={presence.initial}
            animate={presence.animate}
            transition={i < openedWith.current ? { ...enter, delay: i * AI_STEP_STAGGER } : enter}
            className="min-w-0"
            data-step={step.kind}
            data-status={step.kind === 'tool' ? step.status : undefined}
          >
            {step.kind === 'tool' ? (
              <ToolStepRow step={step} />
            ) : (
              <p
                className={cn(
                  'whitespace-pre-wrap px-2 py-1 text-ai-prose-sm',
                  step.kind === 'reasoning' ? 'italic text-ai-faint' : 'text-ai-muted',
                )}
              >
                {step.text.trim()}
              </p>
            )}
          </motion.li>
        ))
      )}
    </ol>
  );
}

function ToolStepRow({ step }: { step: ToolStep }) {
  const [expanded, setExpanded] = useState(false);
  const detailId = useId();
  const glyph = useMotionPresence(aiPresence.glyph);
  const morph = useMotionTransition(aiTransition.morph);
  const reveal = useMotionPresence(aiPresence.reveal);
  const revealTransition = useMotionTransition(aiTransition.reveal);
  const live = step.status === 'running';
  const done = toolDonePhrase(step.name);
  const label = live
    ? `${step.phrase}…`
    : step.status === 'ok'
      ? done.charAt(0).toUpperCase() + done.slice(1)
      : `${step.phrase} — failed`;
  const detail = [
    ...humanizeToolInput(step.input),
    ...(step.result ? [{ label: 'Result', value: step.result }] : []),
  ];
  const expandable = detail.length > 0;
  return (
    <div className={AI_STEP_ROW_CLASS}>
      {live ? <AiShimmer /> : null}
      <button
        type="button"
        disabled={!expandable}
        aria-expanded={expandable ? expanded : undefined}
        aria-controls={expandable && expanded ? detailId : undefined}
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          'ds-raw-button relative flex w-full min-w-0 items-center gap-2 rounded-ai-step px-2 py-1 text-left text-ai-prose-sm text-ai-muted',
          expandable && 'hover:bg-ai-hover',
          AI_FOCUS_CLASS,
        )}
      >
        <span className="relative flex h-3.5 w-3.5 shrink-0 items-center justify-center">
          <AnimatePresence mode="popLayout" initial={false}>
            {live ? (
              <motion.span key="live" {...glyph} transition={morph} className="flex">
                <AiIrisSpinner />
              </motion.span>
            ) : step.status === 'ok' ? (
              <motion.span key="ok" {...glyph} transition={morph} className="flex text-text-success">
                <Check className="h-3.5 w-3.5" />
              </motion.span>
            ) : (
              <motion.span key="error" {...glyph} transition={morph} className="flex text-text-danger">
                <X className="h-3.5 w-3.5" />
              </motion.span>
            )}
          </AnimatePresence>
        </span>
        <span className={cn('min-w-0 truncate', live && 'text-ai-ink', step.status === 'error' && 'text-text-danger')}>
          {label}
          {step.result && !live ? <span className="text-ai-faint"> · {step.result}</span> : null}
        </span>
        {step.endedAt !== null && step.startedAt > 0 ? (
          <span className="ml-auto shrink-0 text-ai-label text-ai-faint">{formatDuration(step.endedAt - step.startedAt)}</span>
        ) : null}
      </button>
      <AnimatePresence initial={false}>
        {expandable && expanded ? (
          <motion.dl
            key="detail"
            id={detailId}
            {...reveal}
            transition={revealTransition}
            className="relative ml-7 overflow-hidden pb-1.5 pr-2 text-ai-label"
          >
            {detail.map((d) => (
              <div key={d.label} className="flex min-w-0 gap-1.5 py-0.5">
                <dt className="shrink-0 text-ai-faint">{d.label}:</dt>
                <dd className="min-w-0 break-words text-ai-muted">{d.value}</dd>
              </div>
            ))}
          </motion.dl>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
