/**
 * The per-page sidebar switch (Phase 4) — DATA, read identically by the web
 * shell and the Tauri app through `NavContext.rollout`.
 *
 * Every `SIDEBAR_PAGE_NAV` page starts `legacy` (the old master nav + panel).
 * A page flips to `contextual` in the same PR that deletes its old panel and
 * tab row, and only when `parityGaps(pageId)` is empty (the resolver test
 * fails otherwise). Before that, an org or a staffer can dogfood one page
 * through the `nav.contextual.<pageId>` setting.
 */

import { SIDEBAR_PAGE_NAV } from '@/lib/sidebar-navigation';
import type { NavRolloutState } from './schema';

/**
 * Scan stations are NOT ported to the contextual sidebar (operator ruling
 * 2026-09-26). Station work is physical — you move to complete it — so its
 * long-term home is `/m/*`, with desktop showing a live feed of what staff do
 * on mobile. Until then every station keeps its current desktop surface (the
 * two-card column: scan bar + recents rail) unchanged. These pages resolve
 * `legacy` whatever the map or a `nav.contextual.<pageId>` override says.
 */
export const NAV_CONTEXT_PINNED_LEGACY: ReadonlySet<string> = new Set(
  SIDEBAR_PAGE_NAV.filter((page) => page.kind === 'station').map((page) => page.id),
);

export const NAV_CONTEXT_ROLLOUT: Readonly<Record<string, NavRolloutState>> = {
  'ai-chat': 'contextual',
  home: 'legacy',
  sales: 'legacy',
  operations: 'legacy',
  reports: 'legacy',
  triage: 'legacy',
  receive: 'legacy',
  pickup: 'legacy',
  repair: 'legacy',
  testing: 'legacy',
  'ready-to-pack': 'legacy',
  incoming: 'contextual',
  receiving: 'legacy',
  sourcing: 'legacy',
  fba: 'legacy',
  'label-intake': 'legacy',
  outbound: 'legacy',
  'scan-out': 'legacy',
  packer: 'legacy',
  products: 'legacy',
  inventory: 'legacy',
  support: 'legacy',
  studio: 'legacy',
};

/** Settings value set of `nav.contextual.<pageId>`; `inherit` defers to the next level. */
export const NAV_ROLLOUT_SETTING_VALUES = ['inherit', 'legacy', 'contextual'] as const;

/** Settings Registry key of one page's switch (org scope, personalizable). */
export function navRolloutSettingKey(pageId: string): string {
  return `nav.contextual.${pageId}`;
}

/**
 * A resolved `nav.contextual.<pageId>` setting → the page override, or `null`
 * to fall back to {@link NAV_CONTEXT_ROLLOUT}. `value` is the staffer's pick
 * when they made one (personalizable), else the org's; a staffer's `inherit`
 * defers to the org value.
 */
export function navRolloutOverride(setting: {
  value: unknown;
  orgValue?: unknown;
}): NavRolloutState | null {
  for (const candidate of [setting.value, setting.orgValue]) {
    if (candidate === 'legacy' || candidate === 'contextual') return candidate;
  }
  return null;
}
