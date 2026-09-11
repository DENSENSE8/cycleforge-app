/**
 * Shared open-set for compound leaf detail bands.
 *
 * No JSX. VirtualGroupedSections reads {@link compoundRowDetailEstimatePx}
 * (48 vs 96) and {@link subscribeCompoundRowDetailOpen} so first paint and
 * measureElement stay in sync with the chevron.
 *
 * Callers: CompoundRow, OrdersQueueTableRow, VirtualGroupedSections.
 * User: restore SLOT_TABLE_ENGINE_CONTRACT leafDetailBand without changing
 * CompoundItem paint.
 */

import { useCallback, useSyncExternalStore } from 'react';
import {
  COMPOUND_ROW_DETAIL_EXPANDED_PX,
  COMPOUND_ROW_PX,
} from '@/components/tables/compound/compound-row-chrome';

type Listener = () => void;

const openIds = new Set<string>();
const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** Virtualizer item keys are `r:{id}` (and similar `g:` folds). */
export function compoundRowDetailIdFromItemKey(itemKey: string): string {
  const colon = itemKey.indexOf(':');
  if (colon === 1 || colon === 5) return itemKey.slice(colon + 1);
  return itemKey;
}

function isOpenId(id: string): boolean {
  if (openIds.has(id)) return true;
  const fromKey = compoundRowDetailIdFromItemKey(id);
  return fromKey !== id && openIds.has(fromKey);
}

export function subscribeCompoundRowDetailOpen(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function compoundRowDetailEstimatePx(itemKey: string, idlePx: number): number {
  if (!isOpenId(itemKey) && !isOpenId(compoundRowDetailIdFromItemKey(itemKey))) {
    return idlePx;
  }
  if (idlePx === COMPOUND_ROW_PX) return COMPOUND_ROW_DETAIL_EXPANDED_PX;
  return idlePx * 2;
}

export function useCompoundRowDetail(rowId: string): {
  open: boolean;
  toggle: () => void;
  close: () => void;
} {
  const open = useSyncExternalStore(
    subscribeCompoundRowDetailOpen,
    () => openIds.has(rowId),
    () => false,
  );

  const toggle = useCallback(() => {
    if (openIds.has(rowId)) openIds.delete(rowId);
    else openIds.add(rowId);
    emit();
  }, [rowId]);

  const close = useCallback(() => {
    if (!openIds.has(rowId)) return;
    openIds.delete(rowId);
    emit();
  }, [rowId]);

  return { open, toggle, close };
}
