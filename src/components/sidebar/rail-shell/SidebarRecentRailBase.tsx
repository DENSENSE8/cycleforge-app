'use client';

import { SidebarRailShell } from '@/components/sidebar/SidebarRailShell';
import type { SidebarRailShellProps } from '@/components/sidebar/rail-shell/sidebar-rail-shared';

export type SidebarRecentRailBaseProps<TRow> = SidebarRailShellProps<TRow>;

/**
 * Generic "recent activity rail" base — the single shell node shared by the
 * domain presets:
 *   • receiving/testing → `RecentActivityRailBase` (`ReceivingLineRow`)
 *   • shipping          → `ShippingStaffShippedRail` (`Order` ship-outs)
 *
 * It applies the recent-rail defaults (stagger reveal + pin-selected-lead) and
 * forwards everything else to the fully-generic {@link SidebarRailShell}. A
 * preset supplies only its row type, fetch/query wiring, and slot renderers —
 * neither domain calls `SidebarRailShell` raw, so the "recent rail" contract has
 * exactly one home. Both defaults are overridable per preset.
 */
export function SidebarRecentRailBase<TRow>({
  staggerReveal = true,
  pinSelectedLead = true,
  ...rest
}: SidebarRecentRailBaseProps<TRow>) {
  return (
    <SidebarRailShell<TRow>
      staggerReveal={staggerReveal}
      pinSelectedLead={pinSelectedLead}
      {...rest}
    />
  );
}
