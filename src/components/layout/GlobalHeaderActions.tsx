'use client';

import { GlobalHeaderSearch } from '@/components/layout/GlobalHeaderSearch';
import { GlobalHeaderAssistantButton } from '@/components/layout/GlobalHeaderAssistantButton';
import { HeaderGoalChip } from '@/components/layout/HeaderGoalChip';
import { useAuth } from '@/contexts/AuthContext';
import { ActivityInboxButton } from '@/components/quick-access/ActivityInboxButton';
import { cn } from '@/utils/_cn';
import { HEADER_ICON_CLUSTER, HEADER_ICON_GAP } from './header-shell';

/**
 * Matches `RightRailHost` at rest — min width keeps icons column-aligned with
 * the detail panel. Grows left when search expands (icons stay `shrink-0`).
 */
const HEADER_RAIL_WIDTH = 'min-w-[420px]';

/**
 * Persistent **actions** zone of the {@link GlobalHeader} (far-right).
 *
 * Desktop order (left → right): **search · goal · work order · inbox ·
 * assistant (far-right)**. Sparkles opens the assistant right-rail occupant, so
 * it sits at the edge it owns (mirror of MasterNav collapse on the far left).
 * Staff identity + org live on the MasterNav spine — no avatar here.
 *
 * Clipboard history, phone sign-in QR, and kiosk preview stay in the spine
 * account overflow ({@link StaffAccountFooter} ⋯) — earned by frequency, not
 * existence. Goal / work-order are session glanceables on desktop only; mobile
 * keeps goal on {@link MobileTopBar} and does not remount them here.
 *
 * **Desktop only.** This used to carry a `variant="mobile"` branch — a compact
 * utility cluster (clipboard · phone QR · inbox · account avatar) for the phone
 * top bar, justified by "mobile has no spine, therefore no account overflow".
 * That justification expired on 2026-08-21 when the mobile drawer footer
 * ({@link MobileAccountFooter}) became exactly that overflow, so the branch was
 * DELETED rather than left as a second shape for the same job. Mobile mounts no
 * part of this component.
 */
export function GlobalHeaderActions() {
  const { user } = useAuth();

  if (!user) return null;

  // Order: search · pace-and-next (goal ring) · inbox · assistant (far-right).
  // Search stays mounted on `/search` (and carton detail) so find is always
  // reachable from the header — page-rail entry is additive, not a replacement.
  // Stretch the row to the header beam so expanded find + icon washes lock flush.
  return (
    <div
      className={cn(
        'flex h-full shrink-0 items-stretch justify-end',
        HEADER_ICON_GAP,
        HEADER_RAIL_WIDTH,
      )}
    >
      <GlobalHeaderSearch />
      <div className={HEADER_ICON_CLUSTER} data-header-zone="actions">
        <HeaderGoalChip />
        <ActivityInboxButton />
        <GlobalHeaderAssistantButton />
      </div>
    </div>
  );
}
