'use client';

/**
 * Keyboard complete for Dashboard · Outbound queues:
 *   j / ↓  — next row (opens detail)
 *   k / ↑  — previous row
 *   Enter  — open first row if none selected (or re-fire navigate down noop)
 *   Esc    — close detail
 *
 * Reuses the existing navigate-shipped-details / close-shipped-details bridge
 * so OrdersGridView and DashboardShippedTable stay in sync without a second
 * selection bus. Capture-phase so it coexists with filter hotkeys (A/1/2/3).
 */

import { useEffect, useRef } from 'react';
import { hasOpenOverlay } from '@/lib/overlay-stack/store';
import {
  dispatchCloseShippedDetails,
  dispatchNavigateShippedDetails,
  dispatchOpenShippedDetails,
  type ShippedDetailsContext,
} from '@/utils/events';
import type { ShippedOrder } from '@/types/orders';

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  const role = el.getAttribute('role');
  if (role === 'textbox' || role === 'searchbox' || role === 'combobox') return true;
  return false;
}

function scrollRowIntoView(id: number | string | null | undefined) {
  if (id == null || typeof document === 'undefined') return;
  const el = document.querySelector(`[data-order-row-id="${String(id)}"]`);
  if (el instanceof HTMLElement) {
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

export function useOutboundQueueKeyboard({
  enabled,
  orderedRecords,
  selectedId,
  context = 'queue',
  /** When no selection, Enter opens this record (usually orderedRecords[0]). */
  openRecord,
}: {
  enabled: boolean;
  orderedRecords: ReadonlyArray<{ id: number | string } | ShippedOrder>;
  selectedId: number | null;
  context?: ShippedDetailsContext;
  openRecord?: (record: ShippedOrder) => void;
}): void {
  const orderedRef = useRef(orderedRecords);
  const selectedRef = useRef(selectedId);
  const openRef = useRef(openRecord);
  orderedRef.current = orderedRecords;
  selectedRef.current = selectedId;
  openRef.current = openRecord;

  useEffect(() => {
    if (!enabled) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      if (isTypingTarget(e.target) || isTypingTarget(document.activeElement)) return;
      // The innermost open overlay owns the keyboard. This listener is CAPTURE
      // phase, so without this bail-out its `stopPropagation()` would swallow
      // Escape (and j/k) before an open popover / menu / cell editor ever sees
      // it — closing the inspector while the popover stayed on screen. The
      // typing-target test above only covers input/textarea editors, never
      // button-and-menu popovers. See `src/lib/overlay-stack/store.ts`.
      if (hasOpenOverlay()) return;

      const code = e.code;

      if (code === 'Escape') {
        if (selectedRef.current == null) return;
        e.preventDefault();
        e.stopPropagation();
        dispatchCloseShippedDetails();
        return;
      }

      if (code === 'KeyJ' || code === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        if (selectedRef.current == null) {
          const first = orderedRef.current[0] as ShippedOrder | undefined;
          if (first) {
            openRef.current?.(first);
            dispatchOpenShippedDetails(first, context);
            scrollRowIntoView(first.id);
          }
          return;
        }
        dispatchNavigateShippedDetails('down');
        // Next paint: selection listeners update; scroll best-effort by neighbor.
        requestAnimationFrame(() => {
          const cur = selectedRef.current;
          if (cur == null) return;
          const list = orderedRef.current;
          const idx = list.findIndex((r) => Number(r.id) === cur);
          const next = idx >= 0 ? list[idx + 1] : null;
          if (next) scrollRowIntoView(next.id);
        });
        return;
      }

      if (code === 'KeyK' || code === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        if (selectedRef.current == null) {
          const first = orderedRef.current[0] as ShippedOrder | undefined;
          if (first) {
            openRef.current?.(first);
            dispatchOpenShippedDetails(first, context);
            scrollRowIntoView(first.id);
          }
          return;
        }
        dispatchNavigateShippedDetails('up');
        requestAnimationFrame(() => {
          const cur = selectedRef.current;
          if (cur == null) return;
          const list = orderedRef.current;
          const idx = list.findIndex((r) => Number(r.id) === cur);
          const prev = idx > 0 ? list[idx - 1] : null;
          if (prev) scrollRowIntoView(prev.id);
        });
        return;
      }

      if (code === 'Enter') {
        // Don't steal Enter from buttons/links.
        if (e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement) return;
        // Don't steal Enter from a FOCUSED ROW either. Rows are `tabIndex={0}`
        // and handle Enter/Space themselves to open the record they belong to;
        // this branch only knows how to open `orderedRecords[0]`, so capturing
        // here opened the wrong order whenever the operator had tabbed down.
        if (e.target instanceof Element && e.target.closest('[data-order-row-id]')) return;
        if (selectedRef.current != null) return;
        const first = orderedRef.current[0] as ShippedOrder | undefined;
        if (!first) return;
        e.preventDefault();
        e.stopPropagation();
        openRef.current?.(first);
        dispatchOpenShippedDetails(first, context);
      }
    };

    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [enabled, context]);
}
