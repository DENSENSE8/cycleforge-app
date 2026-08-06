'use client';

/**
 * Desk order inspector Displays — Unbox twin via {@link buildSectionTabs} +
 * {@link SectionTabsSlider} `density="icon"`. Locked four topics (Documents gated).
 */

import type { ReactNode } from 'react';
import {
  FileText,
  History,
  MessageSquare,
  Package,
} from '@/components/Icons';
import { buildSectionTabs, type SectionTabDef } from '@/components/station/workbench/build-section-tabs';
import type { SectionTab } from '@/design-system/components';
import { orderInspectorDisplayTopics } from '@/lib/shipping/order-inspector-topics';

export function buildOrderInspectorDisplays(input: {
  showDocumentsTab: boolean;
  contents: Record<'order' | 'documents' | 'timeline' | 'conversation', ReactNode>;
}): SectionTab[] {
  const topics = orderInspectorDisplayTopics({
    showDocumentsTab: input.showDocumentsTab,
  });

  const iconFor = {
    order: Package,
    documents: FileText,
    timeline: History,
    conversation: MessageSquare,
  } as const;

  const defs: SectionTabDef[] = topics.map((t) => ({
    id: t.key,
    label: t.tabLabel,
    icon: iconFor[t.key],
    content: input.contents[t.key],
    visible: true,
  }));

  return buildSectionTabs(defs);
}
