/**
 * `G` then a letter → one of the CURRENT lane's modes (the parent level).
 * Scoped per lane (owner 2026-09-27): a lane's letters never leak onto another
 * lane's pages, so two lanes may reuse a letter (Shipping and Sourcing are
 * both `S`). Keyed by letter inside each lane so two modes of one lane can
 * never claim the same one. A page's views keep bare `1`–`9` (child level);
 * modes get the "go somewhere" sequence (Linear, GitHub, Gmail). Off a lane
 * with modes, `G` does nothing.
 */

import type { SpineSectionId } from '@/lib/sidebar-navigation';

export const NAV_GO_KEYS: Readonly<Partial<Record<SpineSectionId, Readonly<Record<string, string>>>>> = {
  fulfillment: { s: 'outbound', f: 'fba', l: 'label-intake' },
  inbound: { d: 'incoming', s: 'sourcing' },
  inventory: { i: 'inventory', q: 'qc-labels' },
};
