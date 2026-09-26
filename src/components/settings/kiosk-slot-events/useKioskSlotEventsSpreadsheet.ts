'use client';

/** Gate preamble (Fact-Forcing): */

import { useCallback, useMemo, useState } from 'react';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';
import {
  useCompoundSpreadsheet,
  type CompoundSpreadsheetFeed,
} from '@/components/tables/useCompoundSpreadsheet';
import { resolveKioskSlotEventsSlotValue } from '@/lib/tables/field-catalog/kiosk-slot-events-resolve';
import { kioskSlotEventCompoundView } from '@/lib/kiosk/kiosk-slot-event-row-adapter';
import type { KioskSlotEventTableRow } from '@/lib/kiosk/kiosk-slot-event-row';
import { KIOSKSLOTEVENTS_GRID_CAPABILITIES } from './kiosk-slot-events-grid-descriptor';
import {
  kioskSlotEventsCompoundColumnsFor,
  kioskSlotEventsSortFactFor,
  type KioskSlotEventsGridColumn,
  type KioskSlotEventsGridColumnKey,
} from './kiosk-slot-events-grid-layout';
import { KIOSKSLOTEVENTS_TABLE_BINDING } from './kiosk-slot-events-table-definition';
import { useKioskSlotEventsTableLayout } from './useKioskSlotEventsTableLayout';

export interface UseKioskSlotEventsSpreadsheetOptions {
  events: readonly KioskSlotEventTableRow[];
  loading?: boolean;
  emptyMessage?: string;
  searchPlaceholder?: string;
}

export function useKioskSlotEventsSpreadsheet({
  events,
  loading = false,
  emptyMessage = 'No slot events yet. Transitions appear here once the kiosk runtime emits them.',
  searchPlaceholder = 'Filter slot history…',
}: UseKioskSlotEventsSpreadsheetOptions): CompoundSpreadsheetFeed<
  KioskSlotEventTableRow,
  KioskSlotEventsGridColumnKey,
  KioskSlotEventsGridColumn
> {
  const [sort, setSort] = useState<KioskSlotEventsGridColumnKey | null>(null);
  const [dir, setDir] = useState<GridSortDir | null>(null);
  const [query, setQuery] = useState('');

  const { effectiveLayout, subtitleFieldIds, fields } = useKioskSlotEventsTableLayout();
  const columns = useMemo(
    () => kioskSlotEventsCompoundColumnsFor(effectiveLayout),
    [effectiveLayout],
  );

  const onSortChange = useCallback(
    (key: KioskSlotEventsGridColumnKey, nextDir: 'asc' | 'desc') => {
      setSort(key);
      setDir(nextDir);
    },
    [],
  );

  const search = useMemo(
    () => ({ value: query, onChange: setQuery, placeholder: searchPlaceholder }),
    [query, searchPlaceholder],
  );

  return useCompoundSpreadsheet<
    KioskSlotEventTableRow,
    KioskSlotEventsGridColumnKey,
    KioskSlotEventsGridColumn
  >({
    binding: KIOSKSLOTEVENTS_TABLE_BINDING,
    columns,
    fields,
    rows: events,
    getRowId: (row) => String(row.id),
    adapter: kioskSlotEventCompoundView,
    subtitleFieldIds,
    resolve: resolveKioskSlotEventsSlotValue,
    sortFactFor: kioskSlotEventsSortFactFor,
    capabilities: KIOSKSLOTEVENTS_GRID_CAPABILITIES,
    sort,
    dir,
    onSortChange,
    search,
    loading,
    emptyMessage,
    ariaLabel: 'Kiosk slot history',
  });
}
