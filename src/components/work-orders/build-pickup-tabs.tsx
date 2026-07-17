import type { ReactNode } from 'react';
import { Package, Plus } from '@/components/Icons';
import { buildSectionTabs } from '@/components/station/workbench';

interface BuildPickupTabsInput {
  itemContent: ReactNode;
  addContent: ReactNode;
  itemCount: number;
}

/**
 * Local Pickup's two durable displays. Keeping the ids here in one builder
 * keeps SectionTabsSlider and STATION_TERMINAL_REGISTRY.pickup in lock-step.
 */
export function buildPickupTabs({
  itemContent,
  addContent,
  itemCount,
}: BuildPickupTabsInput) {
  return buildSectionTabs([
    {
      id: 'item',
      label: itemCount > 0 ? `Item · ${itemCount}` : 'Item',
      icon: Package,
      content: itemContent,
    },
    {
      id: 'add',
      label: 'Add item',
      icon: Plus,
      content: addContent,
    },
  ]);
}
