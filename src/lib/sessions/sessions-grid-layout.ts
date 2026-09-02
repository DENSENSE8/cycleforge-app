/**
 * Reports › Sessions — compound column model (staff × warehouse day).
 */

import { compoundColumnsFor } from '@/components/tables/compound/compound-columns';
import {
  SESSIONS_FIELD_CATALOG,
  SESSIONS_PRODUCT_LAYOUT,
} from '@/lib/tables/field-catalog/sessions';
import { materializeTracks, type SlotTrackFields } from '@/lib/tables/materialize-tracks';
import { isSlotTableChromeTrack } from '@/lib/tables/slot-table-header-sort';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';
import type { ColumnType } from '@/lib/tables/table-columns';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

export type SessionsGridColumnKey =
  | 'select'
  | 'thumb'
  | 'item'
  | 'fulfillment'
  | 'state'
  | 'amount'
  | 'actions'
  | '_fill'
  | `status:${number}`
  | `subtitle:${number}`;

export interface SessionsGridColumn extends SlotTrackFields {
  key: SessionsGridColumnKey;
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
  resizable?: boolean;
  omitCellIcon?: boolean;
}

export function sessionsCompoundColumnsFor(layout: SlotLayout): readonly SessionsGridColumn[] {
  return materializeTracks<SessionsGridColumn>({
    layout,
    catalog: SESSIONS_FIELD_CATALOG,
    base: compoundColumnsFor<SessionsGridColumn>(),
  });
}

export const SESSIONS_COMPOUND_COLUMNS: readonly SessionsGridColumn[] =
  sessionsCompoundColumnsFor(SESSIONS_PRODUCT_LAYOUT);

export type SessionsSortFact =
  | 'staff'
  | 'status'
  | 'station'
  | 'duration'
  | 'blocks'
  | 'image'
  | 'order'
  | 'amount';

const SESSIONS_SORT_FACTS: readonly SessionsSortFact[] = [
  'staff',
  'status',
  'station',
  'duration',
  'blocks',
  'image',
  'order',
  'amount',
];

const SESSIONS_TRACK_SORT_FACTS: Readonly<Record<string, SessionsSortFact>> = {
  item: 'staff',
  state: 'status',
  thumb: 'image',
  fulfillment: 'order',
  amount: 'amount',
};

const SESSIONS_SLOT_SORT_FACTS: Readonly<Record<string, SessionsSortFact>> = {
  'sessions.staff': 'staff',
  'sessions.status': 'status',
  'sessions.station': 'station',
  'sessions.duration': 'duration',
  'sessions.blocks': 'blocks',
};

export function sessionsSortFactFor(
  col: Pick<SessionsGridColumn, 'key' | 'sortable' | 'fieldId'>,
): SessionsSortFact | null {
  if (isSlotTableChromeTrack(col.key) || col.sortable === false) return null;
  const slot = col.fieldId ? SESSIONS_SLOT_SORT_FACTS[col.fieldId] : undefined;
  if (slot) return slot;
  return SESSIONS_TRACK_SORT_FACTS[col.key] ?? null;
}

export function isSessionsSortFact(raw: string): raw is SessionsSortFact {
  return (SESSIONS_SORT_FACTS as readonly string[]).includes(raw);
}

export function isSessionsGridSortable(
  columns: readonly SessionsGridColumn[],
  key: string,
): boolean {
  const col = columns.find((c) => c.key === key);
  return col ? sessionsSortFactFor(col) != null : false;
}

export function sessionsColumnKeyForSort(
  columns: readonly SessionsGridColumn[],
  fact: SessionsSortFact | null,
): SessionsGridColumnKey | null {
  if (!fact) return null;
  return columns.find((c) => sessionsSortFactFor(c) === fact)?.key ?? null;
}

export const SESSIONS_SORT_FACT_TYPES: Readonly<Record<SessionsSortFact, ColumnType>> = {
  staff: 'text',
  status: 'tag',
  station: 'text',
  duration: 'text',
  blocks: 'number',
  image: 'text',
  order: 'text',
  amount: 'price',
};

export function defaultDirForSessionsGridSort(fact: SessionsSortFact): GridSortDir {
  return fact === 'duration' || fact === 'blocks' || fact === 'amount' || fact === 'image'
    ? 'desc'
    : 'asc';
}
