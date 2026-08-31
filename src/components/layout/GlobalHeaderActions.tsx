'use client';

import { GlobalHeaderAssistantButton } from '@/components/layout/GlobalHeaderAssistantButton';
import { GlobalHeaderAddMenu } from '@/components/layout/GlobalHeaderAddMenu';
import { GlobalHeaderSearch } from '@/components/layout/GlobalHeaderSearch';
import { HeaderGoalChip } from '@/components/layout/HeaderGoalChip';
import { useAuth } from '@/contexts/AuthContext';
import { ActivityInboxButton } from '@/components/quick-access/ActivityInboxButton';
import { cn } from '@/utils/_cn';
import { HEADER_ICON_CLUSTER, HEADER_ICON_GAP } from './header-shell';

/**
 * Matches `RightRailHost` at rest — min width keeps icons column-aligned with
 * the detail panel.
 */
const HEADER_RAIL_WIDTH = 'min-w-[420px]';

/**
 * Persistent **actions** zone of the {@link GlobalHeader} (far-right).
 *
 * Desktop order (left → right): **find · add · goal · inbox · assistant**.
 * Find is {@link GlobalHeaderSearch} / {@link CommandBar} (⌘K).
 *
 * Clipboard history stays in the spine account overflow
 * ({@link StaffAccountFooter} ⋯) — earned by frequency, not existence. Phone
 * sign-in QR and kiosk preview live on Settings → Workstation. Goal / work-order
 * / throw are session glanceables on desktop only; mobile keeps goal on
 * {@link MobileTopBar} and does not remount them here.
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

  // Order: add · pace-and-next (goal ring) · inbox · assistant (far-right).
  // Stretch the row to the header beam so icon washes lock flush.
  return (
    <div
      className={cn(
        'flex h-full shrink-0 items-stretch justify-end',
        HEADER_ICON_GAP,
        HEADER_RAIL_WIDTH,
      )}
    >
      <div
        className={HEADER_ICON_CLUSTER}
        data-header-zone="actions"
        data-global-add="mounted"
      >
        {/* Find · add · pace-and-next · inbox · assistant (far-right). */}
        <GlobalHeaderSearch />
        <GlobalHeaderAddMenu />
        <HeaderGoalChip />
        <ActivityInboxButton />
        <GlobalHeaderAssistantButton />
      </div>
    </div>
  );
}
