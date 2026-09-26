'use client';

/** Click-and-hold reorder for facts under the compound title. */

import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { subtitleReorderIgnoresScrubTarget } from './scrub-number';

export const SUBTITLE_REORDER_THRESHOLD_PX = 6;

export function subtitleReorderShouldArm(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) >= SUBTITLE_REORDER_THRESHOLD_PX;
}

export function subtitlePartKeyFromPoint(x: number, y: number): string | null {
  if (typeof document === 'undefined') return null;
  const node = document.elementFromPoint(x, y);
  if (!(node instanceof Element)) return null;
  const host = node.closest('[data-subtitle-part]');
  return host?.getAttribute('data-subtitle-part') ?? null;
}

let rowSelectBlock = 0;
let swallowInstalled = false;

function swallowRowSelectEvent(event: Event) {
  event.preventDefault();
  event.stopImmediatePropagation();
}

function installRowSelectSwallow() {
  if (typeof window === 'undefined' || swallowInstalled) return;
  swallowInstalled = true;
  // Window AND document: a leftover click after qty → condition is dispatched
  // on the row, and some hosts attach React listeners on document. Capture on
  // both so neither the row nor a portal root sees it.
  for (const root of [window, document]) {
    root.addEventListener('click', swallowRowSelectEvent, true);
    root.addEventListener('mouseup', swallowRowSelectEvent, true);
    root.addEventListener('auxclick', swallowRowSelectEvent, true);
  }
}

function uninstallRowSelectSwallow() {
  if (!swallowInstalled) return;
  swallowInstalled = false;
  for (const root of [window, document]) {
    root.removeEventListener('click', swallowRowSelectEvent, true);
    root.removeEventListener('mouseup', swallowRowSelectEvent, true);
    root.removeEventListener('auxclick', swallowRowSelectEvent, true);
  }
}

function beginRowSelectBlock() {
  rowSelectBlock += 1;
  installRowSelectSwallow();
}

function endRowSelectBlock() {
  const release = () => {
    rowSelectBlock = Math.max(0, rowSelectBlock - 1);
    if (rowSelectBlock === 0) uninstallRowSelectSwallow();
  };
  if (typeof window === 'undefined') {
    release();
    return;
  }
  window.setTimeout(release, 80);
}

/** True while a subtitle-band drag is in flight (and briefly after). */
export function isSubtitleReorderBlockingRowSelect(): boolean {
  return rowSelectBlock > 0;
}

/**
 * Row `onClick` / bulk-select handlers call this first. True ⇒ this press
 * belongs to the under-title reorder, not membership / inspector open.
 */
export function ignoreRowSelectFromSubtitle(event: {
  target: EventTarget | null;
}): boolean {
  if (isSubtitleReorderBlockingRowSelect()) return true;
  if (typeof Element === 'undefined' || !(event.target instanceof Element)) {
    return false;
  }
  return Boolean(event.target.closest('[data-subtitle-reorder],[data-subtitle-part]'));
}

/**
 * Press started on qty and lifted on condition: the browser fires `click`
 * on the common ancestor — the row. Swallow that one click.
 */
export function swallowNextClick(): void {
  beginRowSelectBlock();
  endRowSelectBlock();
}

type Origin = {
  key: string;
  x: number;
  y: number;
  pointerId: number;
  target: HTMLElement;
};

export function useSubtitlePointerReorder(
  reorder: ((dragKey: string, dropKey: string) => void) | null | undefined,
) {
  const originRef = useRef<Origin | null>(null);
  const draggingKeyRef = useRef<string | null>(null);
  const skipClickRef = useRef(false);
  const reorderRef = useRef(reorder);
  reorderRef.current = reorder;
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);

  const skipClick = useCallback(() => {
    if (!skipClickRef.current) return false;
    skipClickRef.current = false;
    return true;
  }, []);

  const stopListeningRef = useRef<(() => void) | null>(null);

  const endGesture = useCallback((clientX: number, clientY: number) => {
    stopListeningRef.current?.();
    stopListeningRef.current = null;
    const origin = originRef.current;
    const from = draggingKeyRef.current;
    originRef.current = null;
    draggingKeyRef.current = null;
    setDraggingKey(null);
    setOverKey(null);
    if (typeof document !== 'undefined') {
      document.body.style.removeProperty('user-select');
    }
    if (origin) {
      try {
        if (origin.target.hasPointerCapture(origin.pointerId)) {
          origin.target.releasePointerCapture(origin.pointerId);
        }
      } catch {
        /* already released */
      }
    }
    if (!from) return;
    endRowSelectBlock();
    const write = reorderRef.current;
    const drop = subtitlePartKeyFromPoint(clientX, clientY);
    if (!write || !drop || drop === from) return;
    // Remounting the grid in this turn lets the leftover click hit the row.
    window.setTimeout(() => write(from, drop), 0);
  }, []);

  const startListening = useCallback(() => {
    stopListeningRef.current?.();
    const onMove = (event: PointerEvent) => {
      const origin = originRef.current;
      if (!origin || event.pointerId !== origin.pointerId) return;
      if (!draggingKeyRef.current) {
        if (!subtitleReorderShouldArm(event.clientX - origin.x, event.clientY - origin.y)) {
          return;
        }
        draggingKeyRef.current = origin.key;
        skipClickRef.current = true;
        setDraggingKey(origin.key);
        document.body.style.userSelect = 'none';
        beginRowSelectBlock();
        try {
          origin.target.setPointerCapture(event.pointerId);
        } catch {
          /* not a capturing element */
        }
      }
      const over = subtitlePartKeyFromPoint(event.clientX, event.clientY);
      setOverKey(over && over !== draggingKeyRef.current ? over : null);
    };
    const onUp = (event: PointerEvent) => {
      const origin = originRef.current;
      if (!origin || event.pointerId !== origin.pointerId) return;
      endGesture(event.clientX, event.clientY);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onUp, true);
    stopListeningRef.current = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onUp, true);
    };
  }, [endGesture]);

  useEffect(
    () => () => {
      stopListeningRef.current?.();
      stopListeningRef.current = null;
      if (typeof document !== 'undefined') {
        document.body.style.removeProperty('user-select');
      }
    },
    [],
  );

  const bindPart = useCallback(
    (key: string) => {
      if (!reorder || !key) return {};
      return {
        onPointerDownCapture: (event: ReactPointerEvent<HTMLElement>) => {
          if (event.button !== 0) return;
          // Price (and any Figma-scrub number) owns horizontal drag. Reorder
          // still starts from qty / condition / notes.
          if (subtitleReorderIgnoresScrubTarget(event.target)) return;
          originRef.current = {
            key,
            x: event.clientX,
            y: event.clientY,
            pointerId: event.pointerId,
            target: event.currentTarget,
          };
          skipClickRef.current = false;
          startListening();
        },
        // Bubble, not capture — children still receive the press (qty caret,
        // condition menu). The row must not: its click-select is how a
        // subtitle drag was opening the inspector and shifting the grid.
        onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
          event.stopPropagation();
        },
        onMouseDown: (event: ReactMouseEvent<HTMLElement>) => {
          event.stopPropagation();
        },
        onClick: (event: ReactMouseEvent<HTMLElement>) => {
          event.stopPropagation();
        },
      };
    },
    [reorder, startListening],
  );

  return {
    draggingKey,
    overKey,
    skipClick,
    bindPart,
    enabled: Boolean(reorder),
  };
}
