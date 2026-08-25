'use client';

import { useCallback } from 'react';
import { SidebarRailShell } from '@/components/sidebar/SidebarRailShell';
import type { SidebarRailShellProps } from '@/components/sidebar/rail-shell/sidebar-rail-shared';
import type { RailRowActionsResolver } from '@/components/sidebar/rail-shell/rail-row-actions';
import { railIdentityActions } from '@/components/sidebar/rail-shell/rail-row-verbs';
import { copyRailValue } from '@/components/sidebar/rail-shell/rail-row-copy';

export type SidebarRecentRailBaseProps<TRow> = SidebarRailShellProps<TRow>;

/**
 * Generic "recent activity rail" base — the single shell node shared by the
 * domain presets:
 *   • receiving/testing → `RecentActivityRailBase` (`ReceivingLineRow`)
 *   • shipping          → `ShippingStaffScanHistoryRail` (`TechRecord` history feed)
 *   • pack / labels / pickup / product-labels — same shell
 *
 * It applies the recent-rail defaults (pin-selected-lead + collapsed-strip MRU
 * publish) and forwards everything else to the fully-generic
 * {@link SidebarRailShell}. A preset supplies only its row type, fetch/query
 * wiring, and slot renderers — neither domain calls `SidebarRailShell` raw, so
 * the "recent rail" contract has exactly one home. Defaults are overridable.
 *
 * ## The first-load cascade is OFF (2026-08-08)
 *
 * This default was `staggerReveal = true`: on every fresh load the rail's rows
 * cascaded in at 50ms apiece, so a ten-row recent dock took ~500ms to finish
 * arriving. It is now `false`, for the same reason the MasterNav spine went
 * motion-free on the same day — **these are the two navigators an operator
 * reaches into by muscle memory**, and a cascade puts time between the reach
 * and the row. A recent rail is a list of cartons the operator just touched;
 * they are looking for a specific one, not being introduced to the set.
 *
 * **This turns off the first-load CASCADE, not per-row CRUD motion.** With no
 * stagger variants, `RailRow` falls back to `framerPresence.sidebarRailRow` —
 * the scan-in / dismiss-out presence for a row that genuinely arrives or leaves
 * mid-session. That one is feedback about a change the operator caused, which
 * is the opposite case from a list appearing because it loaded. Rails that
 * still want the cascade pass `staggerReveal` explicitly.
 *
 * **Never Framer `layout` / `popLayout` on this feed.** Column resize (sash ·
 * Displays dual-rail) must snap like the right panel — layout projection was
 * the wrapper that lagged and rubber-banded every row.
 *
 * ## Every recent rail gets a row menu, for free
 *
 * A rail that does not pass `rowActions` gets a default built from the identity
 * facts it ALREADY publishes for the parked-strip peek (`getCollapsePinFacts`):
 * one Copy per identity the row carries. That is deliberate — the alternative
 * is nine rails each hand-rolling the same verbs against the same data, which
 * is how the row menu would end up meaning something slightly different on
 * every station. A rail with a fuller vocabulary (receiving, which can also
 * Share, Hide and Delete) passes `rowActions` and wins.
 *
 * A rail that publishes NO facts gets no menu at all. Give it facts and it
 * gains both — the peek card and the menu — in one edit.
 */
export function SidebarRecentRailBase<TRow>({
  staggerReveal = false,
  pinSelectedLead = true,
  // Flush-right under full-bleed scan bands (Unboxed / Testing / Labels).
  railInset = 'scanDock',
  // Parked mid-strip peek — every recent-activity rail publishes by default.
  publishCollapseMru = true,
  rowActions,
  getCollapsePinFacts,
  ...rest
}: SidebarRecentRailBaseProps<TRow>) {
  const factActions = useCallback<RailRowActionsResolver<TRow>>(
    (row) => railIdentityActions({ copy: copyRailValue }, getCollapsePinFacts?.(row)),
    [getCollapsePinFacts],
  );
  return (
    <SidebarRailShell<TRow>
      staggerReveal={staggerReveal}
      pinSelectedLead={pinSelectedLead}
      railInset={railInset}
      publishCollapseMru={publishCollapseMru}
      getCollapsePinFacts={getCollapsePinFacts}
      rowActions={rowActions ?? (getCollapsePinFacts ? factActions : undefined)}
      {...rest}
    />
  );
}
