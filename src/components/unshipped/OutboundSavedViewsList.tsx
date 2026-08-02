'use client';

/**
 * Outbound's saved views — a thin lifecycle-mode → (storageKey, paramKeys)
 * resolver over the shared {@link SavedViewsList}.
 *
 * The list body used to live here. It moved to `@/components/saved-views` when
 * Home → Today needed the same always-visible face (2026-08-01): two copies of
 * one list over one store is the fork `pattern-evolution.md` bans, and the only
 * genuinely Outbound-specific thing was this three-way mode mapping.
 */

import { SavedViewsList } from '@/components/saved-views/SavedViewsList';
import {
  PACKED_SAVED_VIEWS_KEY,
  PACKED_VIEW_PARAMS,
  SHIPPED_SAVED_VIEWS_KEY,
  SHIPPED_VIEW_PARAMS,
  UNSHIPPED_SAVED_VIEWS_KEY,
  UNSHIPPED_VIEW_PARAMS,
} from '@/components/unshipped/outbound-sidebar-shared';

export function OutboundSavedViewsList({
  mode,
}: {
  mode: 'unshipped' | 'packed' | 'shipped';
}) {
  const storageKey =
    mode === 'unshipped'
      ? UNSHIPPED_SAVED_VIEWS_KEY
      : mode === 'packed'
        ? PACKED_SAVED_VIEWS_KEY
        : SHIPPED_SAVED_VIEWS_KEY;
  const paramKeys =
    mode === 'unshipped'
      ? UNSHIPPED_VIEW_PARAMS
      : mode === 'packed'
        ? PACKED_VIEW_PARAMS
        : SHIPPED_VIEW_PARAMS;

  return <SavedViewsList storageKey={storageKey} paramKeys={paramKeys} />;
}
