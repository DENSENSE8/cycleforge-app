/**
 * The per-page sidebar switch (Phase 4) — DATA, read identically by the web
 * shell and the Tauri app through `NavContext.rollout`.
 *
 * Every `SIDEBAR_PAGE_NAV` page starts `legacy` (the old master nav + panel).
 * A page flips to `contextual` in the same PR that deletes its old panel and
 * tab row, and only when `parityGaps(pageId)` is empty (the resolver test
 * fails otherwise). Runtime org/staff switches were retired: one deployed
 * build now has one sidebar contract on every hostname.
 */

import type { NavRolloutState } from './schema';

/**
 * Owner ruling (2026-09-28): a scan station's browse views live in the
 * contextual sidebar. Scan input and recents are part of that same contract,
 * so no station needs a blanket legacy pin.
 */
export const NAV_CONTEXT_PINNED_LEGACY: ReadonlySet<string> = new Set();

export const NAV_CONTEXT_ROLLOUT: Readonly<Record<string, NavRolloutState>> = {
  'ai-chat': 'contextual',
  home: 'contextual',
  'stations-live': 'contextual',
  sales: 'contextual',
  customers: 'contextual',
  operations: 'contextual',
  reports: 'contextual',
  'ops-photos': 'contextual',
  triage: 'contextual',
  receive: 'contextual',
  pickup: 'contextual',
  repair: 'contextual',
  testing: 'contextual',
  'ready-to-pack': 'contextual',
  incoming: 'contextual',
  receiving: 'contextual',
  sourcing: 'contextual',
  fba: 'contextual',
  'label-intake': 'contextual',
  // App-wide (owner 2026-09-29): dogfooded contextual by the org-1 owner, parity gaps empty — every org gets it.
  outbound: 'contextual',
  fulfilled: 'contextual',
  // Born contextual (2026-10-03): one row, no views or controls; its Day | Week window is page chrome.
  'live-feed': 'contextual',
  'scan-out': 'contextual',
  packer: 'contextual',
  products: 'contextual',
  // Warehouse's landing page. Like Fulfillment, Stock opens the existing
  // spine and exposes the Warehouse mode + Stock view switchers there.
  stock: 'contextual',
  inventory: 'contextual',
  'qc-labels': 'contextual',
  support: 'contextual',
  studio: 'contextual',
  // Born contextual (2026-09-28): no old panel to retire; its filters were never anywhere else.
  imports: 'contextual',
  // Born contextual (owner 2026-09-28): the Exceptions hub's kinds are its panel.
  exceptions: 'contextual',
  // Born contextual (owner 2026-09-29): Find + its one view are the whole panel.
  'print-station': 'contextual',
  // `/search/list` (2026-10-04): the pasted list's bucket facet + Sort left the body (ruling A1/A4).
  search: 'contextual',
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
