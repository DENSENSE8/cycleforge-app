'use client';

/**
 * AgendaBandSection — one BAND of the one task list, draggable by its TITLE
 * (operator 2026-09-23: *"just have the drag and drop to the left of the
 * title itself, not in the dropdown component"*).
 *
 * The grip sits LEFT of the band title; the section is a Motion `Reorder.Item`
 * with `dragListener={false}` — the grip is the only drag origin, and since a
 * band title has no click verb, there is no tap/drag fight at all. Dropping
 * one band on another rewrites the shared `order` in {@link useAgendaKindPrefs},
 * so the phone and the desk each keep their own arrangement.
 *
 * The host wraps its sections in `Reorder.Group` (axis "y", values = band
 * order, onReorder = prefs reorder) and renders each band through this, so
 * the drag mechanics are declared once for both surfaces.
 *
 * MOBILE-FIRST by address: the desk's Daily list mounts THIS file.
 */

import type { ReactNode } from 'react';
import { Reorder, useDragControls } from '@/design-system/motion';
import { GripVertical } from '@/components/Icons';
import { cn } from '@/utils/_cn';
import type { DailyAgendaType } from '@/lib/daily/daily-agenda-row';
import { AGENDA_KIND_LABEL } from '@/lib/daily/agenda-kind-filter';

export function AgendaBandSection({
  band,
  count,
  children,
}: {
  band: DailyAgendaType;
  /** Rows in the band — the band's whole weight, right-aligned in the title. */
  count: number;
  children: ReactNode;
}) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={band}
      as="section"
      dragListener={false}
      dragControls={controls}
      className="mb-7 last:mb-0"
      whileDrag={{ scale: 1.01, zIndex: 10 }}
    >
      <div className="flex items-center gap-1 px-1 pb-1.5">
        {/* The grip is the drag origin — left of the title, touch-none, and
            the ONLY pointer path that starts a drag. */}
        <button
          type="button"
          aria-label={`Reorder ${AGENDA_KIND_LABEL[band]} band`}
          onPointerDown={(e) => controls.start(e)}
          className={cn(
            'flex h-8 w-8 cursor-grab touch-none items-center justify-center text-text-faint',
            'hover:text-text-default active:cursor-grabbing',
          )}
        >
          <GripVertical className="h-3.5 w-3.5" aria-hidden />
        </button>
        <h2 className="flex min-w-0 flex-1 items-baseline justify-between text-role-eyebrow uppercase tracking-wider text-text-muted">
          <span>{AGENDA_KIND_LABEL[band]}</span>
          <span className="tabular-nums" data-band-count={band}>
            {count}
          </span>
        </h2>
      </div>
      {children}
    </Reorder.Item>
  );
}
