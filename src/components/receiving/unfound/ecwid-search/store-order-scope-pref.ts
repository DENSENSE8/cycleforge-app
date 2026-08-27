/**
 * Device-level Store order-scope preference (Package Pairing P2 / D8).
 * Survives refresh; no org-wide admin setting.
 */

import type { EcwidOrderScope } from '@/components/receiving/unfound/ecwid-search/ecwid-search-shared';

const STORE_ORDER_SCOPE_STORAGE_KEY = 'cf:store-order-scope';

export function readStoredStoreOrderScope(): EcwidOrderScope | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = window.localStorage.getItem(STORE_ORDER_SCOPE_STORAGE_KEY);
    if (v === 'all' || v === 'repair_rs') return v;
  } catch {
    /* private mode / blocked storage */
  }
  return null;
}

export function writeStoredStoreOrderScope(scope: EcwidOrderScope): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORE_ORDER_SCOPE_STORAGE_KEY, scope);
  } catch {
    /* ignore */
  }
}
