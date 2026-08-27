'use client';

/**
 * Home Daily desk inspector — Root Index rows + leaf contents.
 * Unbox Displays grammar on RightRailHost. Never StationDisplaysPushStack.
 */

import type { ReactNode } from 'react';
import {
  Link2,
  Package,
  Ticket,
  User,
  Wrench,
} from '@/components/Icons';
import type { DeskInspectorLeaf } from '@/components/right-rail/DeskInspectorIndexShell';
import type { DisplayIndexRow } from '@/components/station/displays/display-index';

export const DAILY_CHECK_INSPECTOR_TOPICS = [
  'overview',
  'connections',
  'ticket',
  'work-order',
  'who-ran',
] as const;

type DailyCheckInspectorTopic = (typeof DAILY_CHECK_INSPECTOR_TOPICS)[number];

const ICON_FOR: Record<DailyCheckInspectorTopic, DeskInspectorLeaf['icon']> = {
  overview: Package,
  connections: Link2,
  ticket: Ticket,
  'work-order': Wrench,
  'who-ran': User,
};

const LABEL_FOR: Record<DailyCheckInspectorTopic, string> = {
  overview: 'Overview',
  connections: 'Connections',
  ticket: 'Ticket',
  'work-order': 'Work order',
  'who-ran': 'Who ran it',
};

const GROUP_FOR: Record<DailyCheckInspectorTopic, DisplayIndexRow['group']> = {
  overview: 'verification',
  connections: 'context',
  ticket: 'context',
  'work-order': 'assets',
  'who-ran': 'context',
};

export function dailyCheckInspectorSubtitle(
  topic: DailyCheckInspectorTopic,
  flags: { ticketLinked: boolean; workOrderLinked: boolean },
): string {
  switch (topic) {
    case 'overview':
      return 'Your mark & roster';
    case 'connections':
      return 'Tickets & work orders';
    case 'ticket':
      return flags.ticketLinked ? 'Linked — view in panel' : 'Connect a ticket';
    case 'work-order':
      return flags.workOrderLinked ? 'Linked' : 'Attach a work order';
    case 'who-ran':
      return 'Staff who ticked today';
  }
}

export function buildDailyCheckInspectorLeaves(input: {
  contents: Record<DailyCheckInspectorTopic, ReactNode>;
  ticketLinked?: boolean;
  workOrderLinked?: boolean;
}): DeskInspectorLeaf[] {
  const flags = {
    ticketLinked: input.ticketLinked === true,
    workOrderLinked: input.workOrderLinked === true,
  };
  return DAILY_CHECK_INSPECTOR_TOPICS.map((id) => ({
    id,
    label: LABEL_FOR[id],
    subtitle: dailyCheckInspectorSubtitle(id, flags),
    tone: 'neutral' as const,
    group: GROUP_FOR[id],
    icon: ICON_FOR[id],
    content: input.contents[id],
  }));
}
