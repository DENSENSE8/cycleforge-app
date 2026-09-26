'use client';

import { useCallback } from 'react';
import { SidebarRailShell } from '@/components/sidebar/SidebarRailShell';
import type { SidebarRailShellProps } from '@/components/sidebar/rail-shell/sidebar-rail-shared';
import type { RailRowActionsResolver } from '@/components/sidebar/rail-shell/rail-row-actions';
import { railIdentityActions } from '@/components/sidebar/rail-shell/rail-row-verbs';
import { copyRailValue } from '@/components/sidebar/rail-shell/rail-row-copy';

export type SidebarRecentRailBaseProps<TRow> = SidebarRailShellProps<TRow>;

/** Generic "recent activity rail" base — the single shell node shared by the domain presets: */
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
