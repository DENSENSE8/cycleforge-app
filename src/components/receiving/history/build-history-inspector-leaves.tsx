'use client';

/**
 * Unbox History desk inspector — Root Index rows + leaf contents.
 * Never PaneHeaderTabs / SectionTabsSlider density=icon for Display topics.
 */

import type { ReactNode } from 'react';
import {
  Camera,
  History,
  Package,
  Truck,
} from '@/components/Icons';
import type { DeskInspectorLeaf } from '@/components/right-rail/DeskInspectorIndexShell';
import type { DisplayIndexRow } from '@/components/station/displays/display-index';
import type { HistoryInspectorDisplayTopic } from '@/lib/receiving/history-inspector-topics';

const ICON_FOR = {
  summary: Package,
  logistics: Truck,
  photos: Camera,
  audit: History,
} as const;

const SUBTITLE_FOR: Record<HistoryInspectorDisplayTopic, string> = {
  summary: 'Order / PO summary',
  logistics: 'Channel & tracking',
  photos: 'Photo evidence',
  audit: 'Audit / timeline',
};

const GROUP_FOR: Record<HistoryInspectorDisplayTopic, DisplayIndexRow['group']> = {
  summary: 'verification',
  logistics: 'context',
  photos: 'assets',
  audit: 'context',
};

const LABEL_FOR: Record<HistoryInspectorDisplayTopic, string> = {
  summary: 'Details',
  logistics: 'Logistics',
  photos: 'Evidence',
  audit: 'History',
};

export function buildHistoryInspectorLeaves(input: {
  topics: readonly HistoryInspectorDisplayTopic[];
  contents: Partial<Record<HistoryInspectorDisplayTopic, ReactNode>>;
}): DeskInspectorLeaf[] {
  return input.topics.map((key) => ({
    id: key,
    label: LABEL_FOR[key],
    subtitle: SUBTITLE_FOR[key],
    tone: 'neutral' as const,
    group: GROUP_FOR[key],
    icon: ICON_FOR[key],
    content: input.contents[key] ?? null,
  }));
}
