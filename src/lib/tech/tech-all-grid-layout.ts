/**
 * Tech All triage spreadsheet columns — Type · Identity · Stage · Urgency.
 * Shared by Testing / Shipping / Unbox All tabs via {@link TechAllTriageTable}.
 */

import { gridFrozenKeys } from '@/design-system/components/grid/grid-column-editability';
import {
  gridFrozenLeft,
  gridTemplate,
} from '@/design-system/components/grid/grid-column-geometry';
import type { ColumnType, TableId } from '@/lib/tables/table-columns';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

/** Staff-prefs + Fields vocabulary — one All triage grid, one bucket. */
export const TECH_ALL_TABLE_ID: TableId = 'tech-all';

export type TechAllGridColumnKey =
  | 'select'
  | 'identity'
  | 'type'
  | 'stage'
  | 'urgency';

export interface TechAllGridColumn {
  key: TechAllGridColumnKey;
  width: string;
  label?: string;
  gridLabel?: string;
  labelFitRem?: number;
  type?: ColumnType;
  align?: 'start' | 'end';
  frozen?: boolean;
  sortable?: boolean;
  hideKey?: string;
  tier?: 'core' | 'optional';
}

/**
 * Canonical All columns. Identity flexes; Type / Stage / Urgency are content-hard.
 * Frozen pane = `select · identity` (browse-and-open, no bulk).
 * Urgency is a magnitude → `type: 'number'` → end-align via resolveGridColumnAlign.
 */
export const TECH_ALL_GRID_COLUMNS: readonly TechAllGridColumn[] = [
  { key: 'select', width: 'minmax(2rem, 2rem)', sortable: false, frozen: true },
  {
    key: 'identity',
    frozen: true,
    width: 'minmax(12rem, 1fr)',
    label: 'Identity',
    type: 'text',
    labelFitRem: 8,
  },
  {
    key: 'type',
    width: 'minmax(7.5rem, 7.5rem)',
    label: 'Type',
    type: 'tag',
    hideKey: 'type',
    labelFitRem: 4.5,
  },
  {
    key: 'stage',
    width: 'minmax(8rem, 8rem)',
    label: 'Stage',
    type: 'text',
    hideKey: 'stage',
    labelFitRem: 4.5,
  },
  {
    key: 'urgency',
    width: 'minmax(4.5rem, 4.5rem)',
    label: 'Urgency',
    type: 'number',
    hideKey: 'urgency',
    labelFitRem: 4.5,
  },
] as const;

const TECH_ALL_GRID_LOCKED_KEYS: readonly TechAllGridColumnKey[] =
  gridFrozenKeys(TECH_ALL_GRID_COLUMNS);

const TECH_ALL_GRID_SORTABLE_KEYS: readonly TechAllGridColumnKey[] =
  TECH_ALL_GRID_COLUMNS.filter((c) => c.sortable !== false && c.key !== 'select').map(
    (c) => c.key,
  );

export function isTechAllGridSortable(key: string): key is TechAllGridColumnKey {
  return (TECH_ALL_GRID_SORTABLE_KEYS as readonly string[]).includes(key);
}

export function isTechAllGridFrozen(key: string): boolean {
  return TECH_ALL_GRID_LOCKED_KEYS.includes(key as TechAllGridColumnKey);
}

export function techAllGridTemplate(
  columns: readonly TechAllGridColumn[] = TECH_ALL_GRID_COLUMNS,
): string {
  return gridTemplate(columns);
}

export function techAllGridFrozenLeft(key: TechAllGridColumnKey): string {
  return gridFrozenLeft(TECH_ALL_GRID_COLUMNS, key);
}

/** First-activation direction — urgency opens most-urgent-first (lower rank). */
export function defaultDirForTechAllGridSort(key: TechAllGridColumnKey): GridSortDir {
  return key === 'urgency' ? 'asc' : 'asc';
}

export {
  LEDGER_GRID_FROZEN_CELL as TECH_ALL_GRID_FROZEN_CELL,
  ledgerGridCell as techAllGridCell,
  ledgerGridRowShellClass as techAllGridRowShellClass,
} from '@/design-system/components/grid/grid-cell-chrome';
