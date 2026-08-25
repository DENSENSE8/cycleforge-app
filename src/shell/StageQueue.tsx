'use client';

/**
 * THE QUEUE COLUMN.
 *
 * What the operator sees beside the work surface: queued work orders
 * first, then parked sessions. It replaced the centred "Welcome back"
 * greeting on 2026-08-24 — see `WORK_ORDER_QUEUE` in model.ts for why the
 * greeting was deleted rather than reworded.
 *
 * NO "WORK ORDERS" HEADER (2026-08-24 ruling: "delete the section title
 * and its count badge; lead directly with the tiles"). The Parked heading
 * SURVIVES on purpose: it is not chrome restating the column's own name,
 * it is the seam between two genuinely different kinds of row. Without it
 * a parked session is indistinguishable from a work order.
 *
 * NO HEADING FOR THE SESSION EITHER. The active session's title lives in
 * the beam and the left rail only; a canvas that re-announces its own
 * title spends the operator's best pixels on something already on screen.
 *
 * NO SCAN BUTTON, EVER. The wedge is always live (I2/I3, T20/T21) — a
 * "Scan" affordance would teach that scanning is a mode you enter first,
 * which is false and breaks every acceptance scenario.
 *
 * SHADCN PRIMITIVES ONLY (2026-08-24 ruling: "only use the shadcn UI
 * components as the building blocks"). Every box here is `Card` /
 * `Button` / `Badge` / `Separator` from `@/components/ui`; this file
 * composes them and positions them, and declares no chrome of its own.
 *
 * Those primitives are mapped ONTO this shell's tokens, not the reverse —
 * the shadcn→plane alias block in `globals.css` points `card`,
 * `background`, `border`, `primary` and the `--radius-*` knob at the
 * planes and the amended LAW 1 scale. So a shadcn `Card` here paints
 * `--plane-stage` at `--r-surface` and follows the inversion in both
 * themes, without a `bg-neutral-100` anywhere.
 *
 * The old `.stage-*` block in `shell.css` was deleted rather than left
 * orphaned: a dead block that still matches nothing is what makes the
 * next reader think the CSS is the source of truth.
 */

import { useCallback, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { hhmmss } from '@/shell/clock';
import { playFeedback } from '@/shell/feedback';
import { WORK_ORDER_QUEUE, WORK_ORDER_URGENCY, type SessionBlock, type WorkOrder } from '@/shell/model';
import { cn } from '@/utils/_cn';
import type { ShellApi } from '@/shell/useShell';

/** Elapsed is the SUM OF INTERVALS, never wall time — parking stops it. */
function blockElapsed(block: SessionBlock, now: number): number {
  const ms = block.intervals.reduce((total, iv) => total + ((iv.end ?? now) - iv.start), 0);
  return Math.max(0, Math.floor(ms / 1000));
}

/** The CTA leans on the urgency accent rather than one hardcoded red —
 *  only one seed in four is `now`. `now` takes shadcn's `destructive`
 *  variant (already mapped to `--text-danger`); the other two need a fill
 *  shadcn has no variant for, so they pass a className, which is the
 *  documented way to extend a shadcn variant rather than fork it. */
const URGENCY_CTA: Record<string, { variant: 'destructive' | 'default'; className?: string }> = {
  now: { variant: 'destructive' },
  today: { variant: 'default', className: 'bg-ink-warning text-white hover:bg-ink-warning/90' },
  queued: { variant: 'default' },
};

function StartButton({ wo, onStart }: { wo: WorkOrder; onStart?: (id: string) => void }) {
  const reduced = useReducedMotion() ?? false;
  const [started, setStarted] = useState(false);
  const cta = URGENCY_CTA[wo.urgency] ?? URGENCY_CTA.queued;

  const start = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      setStarted(true);
      // TODO: wire to the real transition. `src/app/api/work-orders/route.ts`
      // owns the status machine (OPEN | ASSIGNED | IN_PROGRESS | DONE |
      // CANCELED) and stamps `started_at` when a row reaches IN_PROGRESS, so
      // "Start" is that PATCH. It cannot be called yet: WORK_ORDER_QUEUE is
      // seed data and `wo.id` matches no `work_assignments` row.
      onStart?.(wo.id);
      playFeedback(e.currentTarget, 'commit', reduced);
    },
    [onStart, reduced, wo.id],
  );

  return (
    /* `asChild` is what keeps this ONE element. Wrapping a `<Button>` in a
       `<motion.div>` would nest a box around the control and hand the tap
       target to the wrapper; `asChild` merges shadcn's classes and props
       onto the motion element instead, so there is a single <button>. */
    <Button
      asChild
      variant={cta.variant}
      size="sm"
      disabled={started}
      className={cn(
        'font-condensed text-xs font-bold uppercase tracking-[0.08em]',
        started ? 'bg-surface-success text-ink-success hover:bg-surface-success' : cta.className,
      )}
    >
      <motion.button
        type="button"
        /* MOTION IS FEEDBACK ONLY (feedback.ts). Both animate `transform`,
           which composites and displaces no neighbour — never
           width/height/margin, and no `layout` prop anywhere. */
        whileHover={reduced ? undefined : { scale: 1.02 }}
        whileTap={reduced ? undefined : { scale: 0.97 }}
        onClick={start}
      >
        {started ? 'Started' : 'Start'}
      </motion.button>
    </Button>
  );
}

function WorkOrderCard({
  wo,
  shell,
  onStart,
}: {
  wo: WorkOrder;
  shell: ShellApi;
  onStart?: (id: string) => void;
}) {
  const urgency = WORK_ORDER_URGENCY[wo.urgency];

  return (
    /* shadcn `Card`, not a bare div. It brings the surface, the border and
       the radius from the mapped tokens. Urgency lives on the Badge
       (F10: no side-tab). `overflow-hidden` clips the row to `--r-surface`.

       The card is NOT a button. It holds two real actions — open and
       start — and a button inside a button is invalid HTML that collapses
       to one keyboard target. Two siblings, two tab stops. */
    <Card className="h-full flex-row items-stretch gap-3 overflow-hidden px-3 py-3 transition-colors hover:border-input">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <button
          type="button"
          onClick={() => shell.openTile(wo.id, wo.ref, 'session')}
          title={`${wo.ref} — ${wo.title}`}
          className="min-w-0 rounded-md text-left transition-colors hover:text-ink-accent"
        >
          <span className="block truncate text-sm font-medium text-card-foreground">{wo.title}</span>
          <span className="block truncate text-xs text-muted-foreground">
            <span className="mono">{wo.ref}</span>
            <span aria-hidden> · </span>
            {wo.sub}
          </span>
        </button>

        <div className="mt-1 flex items-center gap-2">
          {/* Badge carries D16's urgency word; the variant IS the tone. */}
          <Badge variant={wo.urgency}>{urgency.label}</Badge>
          <span className="mono text-xs text-muted-foreground">{wo.age}</span>
          <span className="ml-auto">
            <StartButton wo={wo} onStart={onStart} />
          </span>
        </div>
      </div>
    </Card>
  );
}

function ParkedSessions({ shell }: { shell: ShellApi }) {
  const now = Date.now();
  const parked = shell.feed.filter(
    (e): e is SessionBlock => e.kind === 'block' && e.state === 'parked',
  );
  if (parked.length === 0) return null;

  return (
    <section className="flex flex-col gap-2" aria-labelledby="stage-parked">
      {/* A shadcn `Separator` does the dividing; the label names what is
          below it. Together they are the seam between two genuinely
          different row kinds — not chrome restating the column's name,
          which is why this heading survived the header deletion. */}
      <div className="flex items-center gap-2 px-2">
        <h2
          id="stage-parked"
          className="font-condensed text-technical font-bold uppercase tracking-[0.14em] text-muted-foreground"
        >
          Parked
        </h2>
        <Separator className="flex-1" />
      </div>

      <ul className="flex list-none flex-col gap-2">
        {parked.map((block) => (
          <li key={block.id}>
            <Card asChild>
              <button
                type="button"
                onClick={() => shell.resumeBlock(block.ref)}
                title={`Resume ${block.title} — elapsed is preserved`}
                className="h-full w-full flex-row items-stretch gap-3 overflow-hidden px-3 py-3 text-left transition-colors hover:bg-muted"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="truncate text-sm font-medium text-card-foreground">{block.title}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {block.items.length} {block.items.length === 1 ? 'event' : 'events'}
                  </span>
                  <span className="mt-1 flex items-center gap-2">
                    <Badge variant="queued">Resume</Badge>
                    {/* Elapsed rides across the park — the number the
                        operator left is the number they come back to (S2/S3). */}
                    <span className="mono ml-auto text-xs text-muted-foreground">
                      {hhmmss(blockElapsed(block, now))}
                    </span>
                  </span>
                </span>
              </button>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function StageQueue({
  shell,
  onStart,
}: {
  shell: ShellApi;
  /** TODO: no caller passes this yet — see `StartButton`'s note for the
   *  real transition it should reach. */
  onStart?: (workOrderId: string) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-2">
      {/* No section header — the tiles lead (2026-08-24 ruling). */}
      <ul className="flex list-none flex-col gap-2">
        {WORK_ORDER_QUEUE.map((wo) => (
          <li key={wo.id}>
            <WorkOrderCard wo={wo} shell={shell} onStart={onStart} />
          </li>
        ))}
      </ul>

      <ParkedSessions shell={shell} />
    </div>
  );
}
