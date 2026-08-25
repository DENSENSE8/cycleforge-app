'use client';

/**
 * THE CANVAS — a TWO-PANE SPLIT, INVERTED (2026-08-24, second ruling).
 *
 * The first split put the composer on a fixed 420px left pane and let the
 * data take the remainder. That was backwards for the shape the operator
 * actually described: the work surface is the big thing and the queue is a
 * COLUMN beside it. So the basis moved — the composer pane is now
 * `flex: 1` and the queue is the fixed, operator-resizable column on the
 * right (280–480px, `pane-resize.ts`).
 *
 * D2 still holds: the composer is permanent and never removed. What
 * changed is which pane holds the fixed width, not whether the composer
 * survives.
 *
 * THE DIVIDER IS QUEUE-ONLY, AND THAT IS DELIBERATE. A parallel lane
 * (HANDOFF-orders-first) renders open tiles into this same right pane, and
 * a tile's floor is `--tile-min-table` (520px) — above this column's 480px
 * ceiling. Clamping the tiles branch to the queue's range would crush every
 * tile below its own declared minimum. So the width and the handle apply to
 * the QUEUE branch only; with tiles open the pane goes back to the flexible
 * behaviour that lane built, and the handle is not rendered at all.
 *
 * NO LAYOUT MOTION. The resize is a raw inline width, the branch swap is a
 * conditional render. Nothing here tweens (M1; the feedback ruling).
 */

import { AssistantFeed } from '@/shell/AssistantFeed';
import { StageQueue } from '@/shell/StageQueue';
import { Tile } from '@/shell/Tile';
import { QUEUE_MAX_PX, QUEUE_MIN_PX, useQueuePaneWidth } from '@/shell/pane-resize';
import { splitHairline } from '@/shell/rail-icon';
import type { ShellApi } from '@/shell/useShell';
import { cn } from '@/utils/_cn';

export function Well({ shell }: { shell: ShellApi }) {
  const { tiles } = shell;
  const { width, dragging, onPointerDown, onKeyDown } = useQueuePaneWidth();
  const showQueue = tiles.length === 0;

  return (
    <div className="well-ground">
      <div className="well">
        <div className="canvas-split" {...(dragging ? { 'data-queue-resize': '' } : {})}>
          <section className="pane pane-composer" aria-label="Composer">
            <AssistantFeed shell={shell} />
          </section>

          {showQueue ? (
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize the work order column"
              aria-valuenow={width}
              aria-valuemin={QUEUE_MIN_PX}
              aria-valuemax={QUEUE_MAX_PX}
              tabIndex={0}
              onPointerDown={onPointerDown}
              onKeyDown={onKeyDown}
              /* 9px grab; the 1px rule paints on hover / focus / coarse / drag. */
              className={`group relative w-[9px] shrink-0 cursor-col-resize touch-none self-stretch focus-visible:outline-2 focus-visible:outline-edge-accent ${
                dragging ? 'bg-edge-accent/20' : ''
              }`}
            >
              <span
                aria-hidden
                className={cn(
                  'pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors',
                  dragging ? 'bg-edge-accent' : splitHairline,
                )}
              />
            </div>
          ) : null}

          {showQueue ? (
            <section
              className="pane pane-queue"
              aria-label="Queued work orders"
              /* The one dynamic inline style the ruling permits. */
              style={{ width: `${width}px` }}
            >
              <StageQueue shell={shell} />
            </section>
          ) : (
            <section className="pane pane-queue canvas-tiles" aria-label="Open tiles">
              {tiles.map((tile, i) => (
                <Tile key={tile.id} tile={tile} shell={shell} isLast={i === tiles.length - 1} />
              ))}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
