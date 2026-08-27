'use client';

/**
 * Desk order inspector — Root Index rows + leaf contents (Unbox grammar).
 * Documents gated. Never SectionTabsSlider density=icon.
 */

import type { ReactNode } from 'react';
import {
  FileText,
  History,
  MessageSquare,
  Package,
} from '@/components/Icons';
import type { DeskInspectorLeaf } from '@/components/right-rail/DeskInspectorIndexShell';
import type { DisplayIndexRow } from '@/components/station/displays/display-index';
import {
  orderInspectorDisplayTopics,
  type OrderInspectorDisplayTopic,
} from '@/lib/shipping/order-inspector-topics';

const ICON_FOR = {
  order: Package,
  documents: FileText,
  timeline: History,
  conversation: MessageSquare,
} as const;

const SUBTITLE_FOR: Record<OrderInspectorDisplayTopic, string> = {
  order: 'Fulfillment & product',
  documents: 'Label & packing slip',
  timeline: 'Order & item journey',
  conversation: 'Thread',
};

const GROUP_FOR: Record<OrderInspectorDisplayTopic, DisplayIndexRow['group']> = {
  order: 'verification',
  documents: 'assets',
  timeline: 'context',
  conversation: 'context',
};

export function buildOrderInspectorLeaves(input: {
  showDocumentsTab: boolean;
  contents: Record<OrderInspectorDisplayTopic, ReactNode>;
}): DeskInspectorLeaf[] {
  const topics = orderInspectorDisplayTopics({
    showDocumentsTab: input.showDocumentsTab,
  });

  return topics.map((t) => ({
    id: t.key,
    label: t.tabLabel,
    subtitle: SUBTITLE_FOR[t.key],
    tone: 'neutral' as const,
    group: GROUP_FOR[t.key],
    icon: ICON_FOR[t.key],
    content: input.contents[t.key],
  }));
}

