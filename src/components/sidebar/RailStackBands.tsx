'use client';

/**
 * The desk Stack, painted — the left rail's four bands over
 * {@link stackModel} (`@/lib/nav/stack-model`).
 *
 * This component owns NO shape of its own. The model already decided that
 * there are exactly four bands, that they come in one fixed order, and that an
 * empty shift still paints all four (`block: null` / `blocks: []`, never a
 * missing band) — so the render walks `model.bands` in order and switches on
 * `kind` rather than restating the sequence. Reordering the Stack is an edit to
 * the fold, not to this file.
 *
 * Likewise the fold owns the *time*: `elapsedMs` is the sum of a block's
 * intervals measured against the shell's clock, and all this does is spell it
 * mm:ss. Nothing here reads `Date.now()` — a rail that ticked on its own would
 * disagree with the model the instant the shell's `now` and the browser's
 * drifted apart.
 *
 * Deliberately absent: no tooltips (a rail row that has to be hovered to be
 * read is a row that failed to fit), no geometry animation (the bands are a
 * standing shape staff aim at, not an arrival), and no colour of its own —
 * band labels take the same eyebrow the other rail sections take.
 */

// Direct path, not the `primitives` barrel — this file is mounted in a jsdom
// unit test, and the barrel drags every other primitive in with it.
import { Button } from '@/design-system/primitives/Button';
import type { StackBlock, StackModel, StackQueue } from '@/lib/nav/stack-model';
import { SPINE_PINNED_TITLE_ROW_CLASS } from '@/components/sidebar/sidebar-spine';
import { cn } from '@/utils/_cn';

/**
 * Band eyebrow — the same uppercase section label the rest of the rail's
 * section headers wear (`SidebarFacetGroup`). Uppercase is the CSS's job, not
 * the string's: the label stays sentence-case in source so it reads normally
 * to a screen reader and in a `textContent` assertion.
 *
 * NOT {@link SPINE_PINNED_TITLE_CLASS} — that one is documented "never
 * uppercase" because Pinned is a standing sentence-case title. The Stack bands
 * are section eyebrows above grouped rows, which is the other role.
 */
const BAND_LABEL_CLASS =
  'text-role-eyebrow font-semibold uppercase tracking-widest text-text-soft';

/** Quiet line for a band the shift has not filled yet. */
const BAND_EMPTY_CLASS = 'px-2 py-1.5 text-role-micro text-text-faint';

/** Row of facts under NOW: state · elapsed. */
const NOW_META_CLASS = 'text-role-micro text-text-soft';

const BAND_ROW_BUTTON_CLASS = 'w-full justify-start';

/**
 * mm:ss, floor-rounded, minutes uncapped — a block parked at 03:41:07 of work
 * reads `221:07`, not `41:07`. An hours field would be a third unit staff have
 * to parse on every row for the rare block that needs it; the minute count
 * growing a digit says the same thing without one.
 */
export function stackElapsedLabel(elapsedMs: number): string {
  const total = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function BandLabel({ kind, children }: { kind: string; children: string }) {
  return (
    <div className={SPINE_PINNED_TITLE_ROW_CLASS}>
      <span
        data-stack-band={kind}
        className={cn('min-w-0 flex-1 truncate', BAND_LABEL_CLASS)}
      >
        {children}
      </span>
    </div>
  );
}

function NowBand({ block }: { block: StackBlock | null }) {
  if (!block) {
    return <p className={BAND_EMPTY_CLASS}>Nothing armed.</p>;
  }
  return (
    <div data-stack-now={block.id} className="px-2 py-1.5">
      <p className="truncate text-role-body font-normal text-text-default">{block.title}</p>
      <p className={NOW_META_CLASS}>
        <span>{block.state}</span>
        <span aria-hidden="true"> · </span>
        <span data-stack-elapsed className="tabular-nums">
          {stackElapsedLabel(block.elapsedMs)}
        </span>
      </p>
    </div>
  );
}

function EarlierBand({
  blocks,
  onResume,
}: {
  blocks: readonly StackBlock[];
  onResume: (id: string) => void;
}) {
  if (blocks.length === 0) {
    return <p className={BAND_EMPTY_CLASS}>Nothing else on the shift yet.</p>;
  }
  return (
    <>
      {blocks.map((block) => (
        <Button
          key={block.id}
          variant="ghost"
          size="sm"
          data-stack-resume={block.id}
          className={BAND_ROW_BUTTON_CLASS}
          onClick={() => onResume(block.id)}
        >
          {`${block.title} · ${stackElapsedLabel(block.elapsedMs)}`}
        </Button>
      ))}
    </>
  );
}

function QueuesBand({
  queues,
  onOpenQueue,
}: {
  queues: readonly StackQueue[];
  onOpenQueue: (tableId: string) => void;
}) {
  if (queues.length === 0) {
    return <p className={BAND_EMPTY_CLASS}>No queues on this desk.</p>;
  }
  return (
    <>
      {queues.map((queue) => (
        <Button
          key={queue.id}
          variant="ghost"
          size="sm"
          data-stack-queue={queue.tableId}
          className={BAND_ROW_BUTTON_CLASS}
          onClick={() => onOpenQueue(queue.tableId)}
        >
          {queue.label}
        </Button>
      ))}
    </>
  );
}

export function RailStackBands({
  model,
  onResume,
  onOpenQueue,
  onFind,
}: {
  model: StackModel;
  onResume: (id: string) => void;
  onOpenQueue: (tableId: string) => void;
  onFind: () => void;
}) {
  return (
    <div data-rail-stack-bands role="group" aria-label="Stack">
      {model.bands.map((band) => {
        switch (band.kind) {
          case 'now':
            return (
              <section key="now" aria-label="Now">
                <BandLabel kind="now">Now</BandLabel>
                <NowBand block={band.block} />
              </section>
            );
          case 'earlier':
            return (
              <section key="earlier" aria-label="Earlier today">
                <BandLabel kind="earlier">Earlier today</BandLabel>
                <EarlierBand blocks={band.blocks} onResume={onResume} />
              </section>
            );
          case 'queues':
            return (
              <section key="queues" aria-label="Queues">
                <BandLabel kind="queues">Queues</BandLabel>
                <QueuesBand queues={band.queues} onOpenQueue={onOpenQueue} />
              </section>
            );
          case 'find':
            return (
              <section key="find" aria-label="Find">
                <BandLabel kind="find">Find</BandLabel>
                <Button
                  variant="ghost"
                  size="sm"
                  data-stack-find
                  className={BAND_ROW_BUTTON_CLASS}
                  onClick={onFind}
                >
                  Find anything
                </Button>
              </section>
            );
        }
        return null;
      })}
    </div>
  );
}
