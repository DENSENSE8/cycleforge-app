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
import { outboundSavedViewsConfig } from '@/components/unshipped/outbound-sidebar-shared';

export function OutboundSavedViewsList({
  mode,
}: {
  mode: 'unshipped' | 'packed' | 'shipped';
}) {
  const { storageKey, paramKeys } = outboundSavedViewsConfig(mode);
  return <SavedViewsList storageKey={storageKey} paramKeys={paramKeys} />;
}
