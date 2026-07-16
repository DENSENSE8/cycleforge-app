'use client';

/**
 * Walk-In context sidebar for master-nav / legacy embeds.
 * Tasks moved to Receiving Walk-In (`/pickup?job=`); this panel is history + station links.
 */

import { WalkInHistorySidebar } from '@/components/walk-in/WalkInHistorySidebar';

interface WalkInSidebarPanelProps {
  embedded?: boolean;
  hideSectionHeader?: boolean;
}

export function WalkInSidebarPanel(_props: WalkInSidebarPanelProps = {}) {
  return <WalkInHistorySidebar />;
}
