/**
 * Same-tab control for {@link DETAIL_STACK_COLLAPSE} — Band 3 inspector toggle /
 * Cmd+\ flip the parked state without clearing the rail occupant target.
 *
 * {@link useLocalStorage} in RightRailHost does not see cross-component writes;
 * this module writes storage + broadcasts a window event the host listens for.
 */

import { DETAIL_STACK_COLLAPSE } from './layout';

export const DETAIL_INSPECTOR_COLLAPSE_EVENT = 'detail-inspector-collapsed-change';

export type DetailInspectorCollapseDetail = { collapsed: boolean };

function readCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = localStorage.getItem(DETAIL_STACK_COLLAPSE.storageKey);
    if (raw == null) return false;
    return Boolean(JSON.parse(raw));
  } catch {
    return false;
  }
}

export function getDetailInspectorCollapsed(): boolean {
  return readCollapsed();
}

export function setDetailInspectorCollapsed(collapsed: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(DETAIL_STACK_COLLAPSE.storageKey, JSON.stringify(collapsed));
  } catch {
    /* quota — still broadcast so in-memory host can update */
  }
  try {
    window.dispatchEvent(
      new CustomEvent<DetailInspectorCollapseDetail>(DETAIL_INSPECTOR_COLLAPSE_EVENT, {
        detail: { collapsed },
      }),
    );
  } catch {
    /* CustomEvent unavailable — ignore */
  }
}

/** Flip parked ↔ expanded. Returns the new collapsed flag. */
export function toggleDetailInspectorCollapsed(): boolean {
  const next = !readCollapsed();
  setDetailInspectorCollapsed(next);
  return next;
}
