/**
 * One row-level panel action (Goals / Notes / Urgent / Status / Out-of-stock).
 * Rescued out of `@/hooks/usePanelActions` (Warehouse-OS) — the catalog is
 * JSX, this shape is not.
 */
import type { ReactNode } from 'react';

export type PanelEntityType = 'order' | 'work_order' | 'fba_item' | 'repair' | 'walk_in_sale';

export interface PanelAction {
  key: string;
  label: string;
  icon: ReactNode;
  toneClassName: string;
  onAction: () => void;
}

export interface PanelActionContext {
  entityType: PanelEntityType;
  entityId: number | string;
  orderId?: string | null;
}
