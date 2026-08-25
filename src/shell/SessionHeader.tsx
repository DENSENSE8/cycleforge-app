'use client';

/**
 * THE SESSION HEADER — the armed session's face, mounted INSIDE the
 * composer block, directly above the field (operator ruling, 2026-08-25 —
 * HANDOFF-session-composer-ux §1/§2). Arming a session opens NO canvas
 * tile: the wedge lands in the composer, so the session that owns the
 * wedge lives ON the composer, and the canvas stays free for data tiles
 * (C8). The chronology sits above this header; the field sits below it.
 *
 * REAL STATE OR NOTHING. It renders only while a block is armed, and every
 * fact on it is the block's own: title, kind, elapsed (sum of intervals,
 * S12), and the stage strip only when the block's ref IS a pipeline stage.
 * The prototype tile's fake carton/serial placeholders did not survive the
 * conversion — nothing here invents a fact to fill space.
 *
 * PARK / END moved here from the deleted SessionPopover (§5): the beam's
 * ⋯ is the tools entry now, and a session's verbs belong on the session's
 * face — one session mouth, not two.
 *
 * M1: collapse/appear is a conditional render; the elapsed text is
 * tabular, so the only thing that ever changes is ink.
 */

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { hhmmss, useClock } from '@/shell/clock';
import {
  PIPELINE,
  blockElapsedSeconds,
  pipelineLabel,
  type SessionBlock,
} from '@/shell/model';
import type { ShellApi } from '@/shell/useShell';

/** Elapsed against the shared once-a-second pulse — interval math, never
 *  wall time (S12). */
function SessionClock({ block }: { block: SessionBlock }) {
  const clock = useClock();
  return (
    <span className="mono text-xs text-muted-foreground">
      {hhmmss(blockElapsedSeconds(block.intervals, clock.now))}
    </span>
  );
}

/**
 * The stage strip — scan type IS the process stage (B15's spine, relocated
 * with the session's face). Filled track, clipped cells (F10); renders only
 * when the ref is a real pipeline stage.
 */
function StageStrip({ current }: { current: number }) {
  return (
    <div className="flex h-3.5 items-stretch overflow-hidden rounded-sm border border-border bg-surface-low">
      {PIPELINE.map((stage, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div
            key={stage}
            className={`flex flex-1 items-center gap-1 px-1.5 font-condensed text-technical font-bold uppercase tracking-[0.08em] ${
              active ? 'text-ink-accent' : done ? 'text-ink-success' : 'text-muted-foreground'
            }`}
          >
            <span
              aria-hidden
              className={`size-1.5 shrink-0 rounded-sm ${
                active ? 'bg-ink-accent' : done ? 'bg-ink-success' : 'bg-surface-highest'
              }`}
            />
            <span className="truncate">{pipelineLabel(stage)}</span>
          </div>
        );
      })}
    </div>
  );
}

export function SessionHeader({ shell }: { shell: ShellApi }) {
  const block = shell.armedBlock;
  if (!block) return null;

  const task = block.sessionKind === 'task';
  const stage = PIPELINE.indexOf(block.ref);

  return (
    <section
      aria-label="Armed session"
      className="flex flex-col gap-1.5 rounded-lg border border-border bg-card px-3 py-2"
    >
      <div className="flex items-center gap-2">
        <Badge
          variant="outline"
          className="border-edge-success font-condensed text-technical font-bold uppercase tracking-[0.1em] text-ink-success"
        >
          {task ? 'building' : 'armed'}
        </Badge>
        <span className="min-w-0 truncate text-sm font-medium text-card-foreground">
          {block.title}
        </span>
        <SessionClock block={block} />
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-6 px-2 text-xs"
            title="Park — lossless, one keystroke's worth (⌘N also parks and cuts a new block)"
            onClick={shell.parkArmedBlock}
          >
            Park
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive"
            title="End — seals the block; an ended session is history, not a resumable"
            onClick={shell.endSession}
          >
            End
          </Button>
        </div>
      </div>
      {!task && stage >= 0 ? <StageStrip current={stage} /> : null}
    </section>
  );
}
