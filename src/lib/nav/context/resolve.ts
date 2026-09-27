/**
 * `resolveNavContext` — the contextual sidebar's answer for a URL, with the
 * rollout gate applied. The web shell calls it in-process; `GET
 * /api/nav/context` returns the same value to Tauri.
 *
 * THE GATE: a page resolves `contextual` only when the switch asks for it
 * (the staff / org override, else `NAV_CONTEXT_ROLLOUT`) AND its contract
 * covers every PARITY.md row (`parityGaps` is empty) AND the page is not a scan
 * station (`NAV_CONTEXT_PINNED_LEGACY`). Otherwise `legacy` — an override can
 * never hand a page to a sidebar that would drop its scan input, views or
 * filters, and stations keep their desktop surface as-is.
 */

import { buildNavContext, type ResolveNavContextInput } from './build';
import { parityGaps } from './parity';
import { NAV_CONTEXT_PINNED_LEGACY } from './rollout';
import type { NavContext } from './schema';

/** Gap-free verdict per page. The rows and registries are static, so it is computed once. */
const PARITY_COMPLETE = new Map<string, boolean>();

function parityComplete(pageId: string): boolean {
  let complete = PARITY_COMPLETE.get(pageId);
  if (complete === undefined) {
    complete = parityGaps(pageId).length === 0;
    PARITY_COMPLETE.set(pageId, complete);
  }
  return complete;
}

export function resolveNavContext(input: ResolveNavContextInput): NavContext {
  const context = buildNavContext(input);
  if (
    context.rollout === 'contextual' &&
    (NAV_CONTEXT_PINNED_LEGACY.has(context.page.id) || !parityComplete(context.page.id))
  ) {
    return { ...context, rollout: 'legacy' };
  }
  return context;
}
