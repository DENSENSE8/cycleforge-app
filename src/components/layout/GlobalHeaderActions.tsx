'use client';

/**
 * Legacy **actions** zone once mounted on {@link GlobalHeader} (far-right).
 *
 * Currently **unmounted** — GlobalHeader remounts only
 * {@link GlobalHeaderKioskButton} far-right. Kept so find · add · goal · inbox ·
 * assistant can return as one cluster without inventing a second rail.
 * Affected API: none. Schemas: none.
 *
 * **Desktop only.** Mobile mounts no part of this component.
 */

import { GlobalHeaderAssistantButton } from '@/components/layout/GlobalHeaderAssistantButton';
import { GlobalHeaderAddMenu } from '@/components/layout/GlobalHeaderAddMenu';
import { GlobalHeaderKioskButton } from '@/components/layout/GlobalHeaderKioskButton';
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

export function GlobalHeaderActions() {
  const { user } = useAuth();

  if (!user) return null;

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
        <GlobalHeaderSearch />
        <GlobalHeaderAddMenu />
        <GlobalHeaderKioskButton />
        <HeaderGoalChip />
        <ActivityInboxButton />
        <GlobalHeaderAssistantButton />
      </div>
    </div>
  );
}
