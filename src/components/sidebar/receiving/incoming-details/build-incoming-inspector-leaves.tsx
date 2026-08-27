'use client';

/**
 * Incoming desk inspector — Root Index rows + leaf contents.
 * Never PaneHeaderTabs for primary topics.
 */

import type { ReactNode } from 'react';
import {
  Activity,
  FileText,
  Link2,
  Mail,
  Package,
  ShoppingCart,
  Truck,
} from '@/components/Icons';
import type { DeskInspectorLeaf } from '@/components/right-rail/DeskInspectorIndexShell';
import type { DisplayIndexRow } from '@/components/station/displays/display-index';
import type { TabId } from './incoming-details-shared';

const ICON_FOR: Record<TabId, DeskInspectorLeaf['icon']> = {
  pairing: Link2,
  ebay: ShoppingCart,
  po: Package,
  shipment: Truck,
  activity: Activity,
  email: Mail,
  notes: FileText,
};

const SUBTITLE_FOR: Record<TabId, string> = {
  pairing: 'Match carton to PO',
  ebay: 'Marketplace order',
  po: 'Purchase order lines',
  shipment: 'Carrier & tracking',
  activity: 'Timeline',
  email: 'Vendor email',
  notes: 'Ops notes',
};

const GROUP_FOR: Record<TabId, DisplayIndexRow['group']> = {
  pairing: 'verification',
  ebay: 'context',
  po: 'verification',
  shipment: 'context',
  activity: 'context',
  email: 'context',
  notes: 'context',
};

export function buildIncomingInspectorLeaves(input: {
  tabs: ReadonlyArray<{ value: TabId; label: string }>;
  contents: Partial<Record<TabId, ReactNode>>;
}): DeskInspectorLeaf[] {
  return input.tabs.map((t) => ({
    id: t.value,
    label: t.label,
    subtitle: SUBTITLE_FOR[t.value],
    tone: 'neutral' as const,
    group: GROUP_FOR[t.value],
    icon: ICON_FOR[t.value],
    content: input.contents[t.value] ?? null,
  }));
}
