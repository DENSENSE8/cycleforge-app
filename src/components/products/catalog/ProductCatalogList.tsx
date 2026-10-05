'use client';

import { memo, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { CirclePause, Copy, Maximize2, RotateCcw } from '@/components/Icons';
import { ProductDetail } from '@/components/products/ProductDetail';
import { PRODUCT_RECORD_PARAM } from '@/components/products/products-view';
import { deactivateSkuCatalog, reactivateSkuCatalog } from '@/components/sku/sku-detail/sku-detail-api';
import { useAuth } from '@/contexts/AuthContext';
import { RecordActionStrip, type RecordActionVerb } from '@/design-system/components/record-action-strip/RecordActionStrip';
import { TriageCardList, type TriageCardSlotProps, type TriageFeed } from '@/design-system/components/triage-card-list/TriageCardList';
import { TriageAllClear } from '@/design-system/components/triage-card-list/TriageListBody';
import { TriageRow, type TriageRowFace } from '@/design-system/components/triage-card-list/TriageRow';
import { useLocalTriageSelection } from '@/design-system/components/triage-card-list/local-selection';
import { useTriageCut } from '@/design-system/components/triage-card-list/triage-list-state';
import { triageFamily } from '@/design-system/components/triage-card-list/triage-view';
import type { RecordStateFace } from '@/design-system/tokens/record';
import type { RowGroup } from '@/lib/group-rows';
import { usePublishRecordCursor } from '@/lib/record-cursor/useRecordCursor';
import { readLiveSearchParams } from '@/lib/routing/optimistic-url-param';
import { PRODUCTS_CATALOG_VIEW } from '@/lib/triage/views';
import { toast } from '@/lib/toast';
import type { CatalogListRow } from './types';

const VIEW = PRODUCTS_CATALOG_VIEW;
const NO_CHIPS: readonly never[] = [];
const rowId = (row: CatalogListRow): number => row.id;
/** An `?openSku=` the loaded list does not carry: the record still opens (it reads by SKU). */
const NOT_LOADED_ID = -1;

const PRODUCT_STATE = {
  attention: { id: 'attention', code: 'ATT', label: 'Needs attention', tone: 'warning', icon: 'alert-triangle' },
  active: { id: 'active', code: 'ACT', label: 'Active', tone: 'success', icon: 'circle-check' },
  inactive: { id: 'inactive', code: 'OFF', label: 'Inactive', tone: 'neutral', icon: 'circle-pause' },
} as const satisfies Readonly<Record<string, RecordStateFace>>;

type ProductRowModel = { key: string; ids: readonly number[]; lead: CatalogListRow };

function stateOf(row: CatalogListRow): RecordStateFace {
  if (row.has_pending_action) return PRODUCT_STATE.attention;
  return row.is_active ? PRODUCT_STATE.active : PRODUCT_STATE.inactive;
}

function itemNumberOf(row: CatalogListRow): string | null {
  return row.platform_ids
    .map((identity) => identity.platform_item_id?.trim() || null)
    .find((value): value is string => Boolean(value)) ?? null;
}

function ProductCatalogRowImpl(props: TriageCardSlotProps<CatalogListRow, ProductRowModel>) {
  const row = props.model.lead;
  const itemNumber = itemNumberOf(row);
  const title = row.display_title || row.product_title || row.sku;
  const face = useMemo<TriageRowFace>(
    () => ({
      state: stateOf(row),
      identity: row.sku,
      identityCopy: row.sku ? { value: row.sku, tone: 'sku' } : undefined,
      identityWidth: 'code',
      title,
      photo: { url: row.image_url },
      facts: [
        {
          id: 'item',
          label: 'Item',
          value: itemNumber ? { kind: 'code', text: itemNumber, title: `Item ${itemNumber}` } : null,
          copy: itemNumber ? { value: itemNumber, tone: 'id' } : undefined,
          width: 'long',
          tone: itemNumber ? 'default' : 'warn',
          tip: itemNumber ?? 'No linked item number',
        },
        { id: 'category', value: row.category || 'Uncategorized', width: 'long', tone: row.category ? 'muted' : 'warn' },
        {
          id: 'channels',
          value: `${row.platform_count} channel${row.platform_count === 1 ? '' : 's'}`,
          width: 'short',
          tone: 'muted',
        },
        {
          id: 'inventory',
          value: row.is_inventory_linked ? 'Inventory linked' : 'Unlinked',
          width: 'short',
          tone: row.is_inventory_linked ? 'muted' : 'warn',
        },
      ],
      next: { label: 'Open' },
      aria: {
        row: `${title}, SKU ${row.sku}`,
        open: `Open ${title}`,
        check: `Select ${title}`,
      },
    }),
    [itemNumber, row, title],
  );
  return <TriageRow {...props} face={face} testIdPrefix={VIEW.testIdPrefix} />;
}

const ProductCatalogRow = memo(ProductCatalogRowImpl);

function compareRows(a: CatalogListRow, b: CatalogListRow, sort: string): number {
  if (sort === 'sku') return a.sku.localeCompare(b.sku, undefined, { numeric: true });
  if (sort === 'channels') return b.platform_count - a.platform_count || a.display_title.localeCompare(b.display_title);
  if (sort === 'attention') return Number(b.has_pending_action) - Number(a.has_pending_action) || a.display_title.localeCompare(b.display_title);
  return a.display_title.localeCompare(b.display_title, undefined, { numeric: true });
}

function keepForState(row: CatalogListRow, state: string): boolean {
  if (state === 'active') return row.is_active;
  if (state === 'inactive') return !row.is_active;
  if (state === 'attention') return row.has_pending_action;
  if (state === 'unlinked') return !row.is_inventory_linked;
  return true;
}

/** Run one catalog writer over each checked product; one toast for the whole set. */
async function writeEach(targets: readonly CatalogListRow[], write: (id: number) => Promise<void>, done: string): Promise<number> {
  const results = await Promise.allSettled(targets.map((row) => write(row.id)));
  const failed = results.flatMap((result) => (result.status === 'rejected' ? [result.reason] : []));
  const ok = targets.length - failed.length;
  if (ok > 0) toast.success(`${done} ${ok} ${ok === 1 ? 'product' : 'products'}`);
  if (failed.length > 0) {
    const reason = failed[0] instanceof Error ? failed[0].message : 'Update failed';
    toast.error(failed.length === 1 ? reason : `${failed.length} products not changed — ${reason}`);
  }
  return ok;
}

export function ProductCatalogList({
  rows,
  loading,
  onChanged,
}: {
  rows: readonly CatalogListRow[];
  loading: boolean;
  /** A select-bar writer changed the catalog — reload the list. */
  onChanged: () => void;
}) {
  const searchParams = useSearchParams();
  const state = searchParams.get('catalogStatus') ?? '';
  const sort = searchParams.get('catalogSort') ?? 'title';
  const visibleRows = useMemo(
    () => rows.filter((row) => keepForState(row, state)).slice().sort((a, b) => compareRows(a, b, sort)),
    [rows, sort, state],
  );

  const cut = useTriageCut({ statusKeys: NO_CHIPS, recordParams: VIEW.recordParams, statusParam: VIEW.chips.param });
  const allBands = useMemo<[string, RowGroup<CatalogListRow>[]][]>(
    () => (visibleRows.length ? [['catalog', visibleRows.map((row) => ({ key: String(row.id), rows: [row] }))]] : []),
    [visibleRows],
  );
  const bands = allBands;
  const selection = useLocalTriageSelection(rowId);

  // The open product rides `?openSku=` — reload and a shared link land on it. The
  // History API moves it within the loaded list (no server round-trip: J / K stay instant).
  const writeOpen = useCallback(
    (sku: string | null) => {
      const params = readLiveSearchParams(searchParams.toString());
      if (sku) params.set(PRODUCT_RECORD_PARAM, sku);
      else params.delete(PRODUCT_RECORD_PARAM);
      const qs = params.toString();
      window.history.replaceState(null, '', qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
    },
    [searchParams],
  );
  const openSku = searchParams.get(PRODUCT_RECORD_PARAM)?.trim() || null;
  const openRecord = useMemo(() => (openSku ? (rows.find((row) => row.sku === openSku) ?? null) : null), [openSku, rows]);
  const openId = openRecord ? openRecord.id : openSku ? NOT_LOADED_ID : null;
  const openRow = useCallback((row: CatalogListRow) => writeOpen(row.sku), [writeOpen]);
  const closeRecord = useCallback(() => writeOpen(null), [writeOpen]);

  usePublishRecordCursor({
    surfaceId: 'product-catalog-rows',
    scope: 'record',
    enabled: true,
    order: bands,
    openId,
    getId: rowId,
    onOpen: openRow,
    onClose: closeRecord,
  });

  const { has } = useAuth();
  const canManage = has('sku_stock.manage');
  const checked = useMemo(() => rows.filter((row) => selection.ids.has(row.id)), [rows, selection.ids]);
  // The check-set's verbs (Law 5): the same list in the same order at 1 or N checked.
  const bulkVerbs = useMemo<RecordActionVerb[]>(() => {
    const active = checked.filter((row) => row.is_active);
    const inactive = checked.filter((row) => !row.is_active);
    const noPermission = 'Changing the catalog needs the manage SKU stock permission';
    return [
      {
        id: 'open',
        label: 'Open',
        icon: <Maximize2 className="size-4" aria-hidden />,
        disabled: checked.length !== 1,
        disabledReason: 'Open one product at a time',
        run: () => {
          if (checked[0]) openRow(checked[0]);
        },
      },
      {
        id: 'copy-skus',
        label: 'Copy SKUs',
        icon: <Copy className="size-4" aria-hidden />,
        run: async () => {
          try {
            await navigator.clipboard.writeText(checked.map((row) => row.sku).join('\n'));
            toast.success(`Copied ${checked.length} ${checked.length === 1 ? 'SKU' : 'SKUs'}`);
          } catch {
            toast.error('Failed to copy');
          }
        },
      },
      {
        id: 'deactivate',
        label: 'Deactivate',
        icon: <CirclePause className="size-4" aria-hidden />,
        disabled: !canManage || active.length === 0,
        disabledReason: !canManage ? noPermission : 'No active products checked',
        run: async () => {
          if ((await writeEach(active, deactivateSkuCatalog, 'Deactivated')) > 0) onChanged();
        },
      },
      {
        id: 'reactivate',
        label: 'Reactivate',
        icon: <RotateCcw className="size-4" aria-hidden />,
        disabled: !canManage || inactive.length === 0,
        disabledReason: !canManage ? noPermission : 'No inactive products checked',
        run: async () => {
          if ((await writeEach(inactive, reactivateSkuCatalog, 'Reactivated')) > 0) onChanged();
        },
      },
    ];
  }, [canManage, checked, onChanged, openRow]);

  const family = useMemo(
    () =>
      triageFamily(VIEW, {
        rowId,
        groupKey: (group: RowGroup<CatalogListRow>) => group.key,
        cardModel: (group: RowGroup<CatalogListRow>): ProductRowModel => {
          const lead = group.rows[0]!;
          return { key: group.key, ids: [lead.id], lead };
        },
        exactFind: (query: string, model: ProductRowModel) =>
          model.lead.sku.toLowerCase() === query || itemNumberOf(model.lead)?.toLowerCase() === query,
        renderCard: (props: TriageCardSlotProps<CatalogListRow, ProductRowModel>) => <ProductCatalogRow {...props} />,
      }),
    [],
  );

  const feed: TriageFeed<CatalogListRow> = {
    bands,
    allBands,
    painted: visibleRows,
    sectioned: false,
    total: visibleRows.length,
    loading,
    fetching: loading,
    search: { value: searchParams.get('q') ?? '', pending: loading },
    selection,
    open: { id: openId, open: openRow, close: closeRecord },
  };

  const narrowed = Boolean(searchParams.get('q')?.trim()) || Boolean(state);

  return (
    <TriageCardList
      density="row"
      family={family}
      feed={feed}
      cut={cut}
      summary={null}
      bulk={<RecordActionStrip verbs={bulkVerbs} label="Checked product actions" testId="product-bulk" face="header" />}
      searchEmpty={narrowed ? <p className="text-sm text-text-muted">No products match the sidebar search and filters.</p> : null}
      allClear={<TriageAllClear title="No catalog products yet" detail="Catalog products appear here after they are ingested." />}
      record={{
        title: openSku ?? 'Product',
        subtitle: openRecord ? openRecord.display_title || openRecord.product_title || undefined : undefined,
        noun: VIEW.noun.one,
        testId: 'product-record',
        summary: null,
        strip: null,
        view: openSku ? <ProductDetail key={openSku} sku={openSku} face="record" /> : null,
      }}
    />
  );
}
