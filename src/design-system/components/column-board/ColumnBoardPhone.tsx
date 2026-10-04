'use client';

/**
 * A `lanes` {@link ColumnBoard} on a phone: one column per screen (`full`
 * width), paged by {@link useColumnBoardPager}, with {@link ColumnBoardSwitcher}
 * — every column as a snap list — above it.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

/**
 * Phone paging over a `lanes` board of `full` columns: which column fills
 * the strip now (read off its scroll), and `show(id)` to page to one.
 * `enabled` false (a desktop board) listens to nothing.
 */
export function useColumnBoardPager(ids: readonly string[], enabled: boolean) {
  const stripRef = useRef<HTMLDivElement | null>(null);
  const [activeId, setActiveId] = useState<string | null>(ids[0] ?? null);
  const current = ids.includes(activeId ?? '') ? activeId : (ids[0] ?? null);
  const listening = enabled && ids.length > 0;

  useEffect(() => {
    const strip = stripRef.current;
    if (!listening || !strip) return;
    let frame = 0;
    const read = () => {
      frame = 0;
      const width = strip.clientWidth || 1;
      const index = Math.round(strip.scrollLeft / width);
      const column = strip.querySelectorAll<HTMLElement>('[data-column]')[index];
      const id = column?.dataset.column ?? null;
      if (id) setActiveId(id);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    strip.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      strip.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [listening]);

  const show = useCallback((id: string) => {
    const strip = stripRef.current;
    const column = strip?.querySelector<HTMLElement>(`[data-column="${CSS.escape(id)}"]`);
    if (!strip || !column) return;
    setActiveId(id);
    strip.scrollTo({ left: column.offsetLeft, behavior: 'smooth' });
  }, []);

  return { stripRef, activeId: current, show };
}

/** The phone's column switcher: every column as a snap list; the one on screen is current. */
export function ColumnBoardSwitcher({
  label,
  columns,
  activeId,
  onPick,
  testId,
}: {
  label: string;
  columns: readonly { id: string; label: string; count: number }[];
  activeId: string | null;
  onPick: (id: string) => void;
  testId: string;
}) {
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    if (!activeId) return;
    const list = listRef.current;
    const chip = list?.querySelector<HTMLElement>(`[data-switch="${CSS.escape(activeId)}"]`);
    if (!list || !chip) return;
    // Scroll the list itself — scrollIntoView would also scroll every clipped ancestor (the desk stage).
    // The list is `relative`, so the chip's offsetLeft is measured from it.
    const left = chip.offsetLeft;
    if (left < list.scrollLeft || left + chip.offsetWidth > list.scrollLeft + list.clientWidth) {
      list.scrollTo({ left: left - (list.clientWidth - chip.offsetWidth) / 2, behavior: 'smooth' });
    }
  }, [activeId]);
  return (
    <nav aria-label={label} data-testid={testId} className="w-full min-w-0 max-w-full">
      <ol ref={listRef} className="relative flex snap-x snap-mandatory gap-1 overflow-x-auto px-mode-page py-1.5">
        {columns.map((column) => {
          const active = column.id === activeId;
          return (
            <li key={column.id} className="shrink-0 snap-start">
              <button
                type="button"
                data-switch={column.id}
                aria-current={active ? 'true' : undefined}
                onClick={() => onPick(column.id)}
                className={cn(
                  'inline-flex h-8 items-center gap-1.5 rounded-mode-pill px-3 text-role-data transition-colors',
                  active ? 'bg-mode-well font-semibold text-text-default' : 'text-text-muted hover:bg-mode-hover',
                  focusRing('control'),
                )}
              >
                <span className="whitespace-nowrap">{column.label}</span>
                <span className="tabular-nums">{column.count}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
