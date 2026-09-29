'use client';

import { memo, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { TriageCardList, type TriageCardSlotProps, type TriageFeed } from '@/design-system/components/triage-card-list/TriageCardList';
import { TriageAllClear } from '@/design-system/components/triage-card-list/TriageListBody';
import { TriageRow, type TriageRowFace } from '@/design-system/components/triage-card-list/TriageRow';
import { useLocalTriageSelection } from '@/design-system/components/triage-card-list/local-selection';
import { useTriageCut } from '@/design-system/components/triage-card-list/triage-list-state';
import { triageFamily } from '@/design-system/components/triage-card-list/triage-view';
import type { RecordStateFace } from '@/design-system/tokens/industrial-record';
import type { RowGroup } from '@/lib/group-rows';
import { PRODUCTS_CATALOG_VIEW } from '@/lib/triage/views';
import { productDetailHref } from '@/components/products/products-view';
import type { CatalogListRow } from './types';

const VIEW = PRODUCTS_CATALOG_VIEW;
const NO_CHIPS: readonly never[] = [];
const rowId = (row: CatalogListRow): number => row.id;

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
      identityWidth: 'code',
      title,
      photo: { url: row.image_url },
      facts: [
        {
          id: 'item',
          label: 'Item',
          value: itemNumber ? { kind: 'code', text: itemNumber, title: `Item ${itemNumber}` } : null,
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

export function ProductCatalogList({ rows, loading }: { rows: readonly CatalogListRow[]; loading: boolean }) {
  const router = useRouter();
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
  const openRow = useCallback((row: CatalogListRow) => router.push(productDetailHref(row.sku)), [router]);

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
    open: { id: null, open: openRow, close: () => undefined },
  };

  const narrowed = Boolean(searchParams.get('q')?.trim()) || Boolean(state);

  return (
    <TriageCardList
      density="row"
      family={family}
      feed={feed}
      cut={cut}
      summary={null}
      bulk={<span className="truncate text-sm text-text-muted">Open a product to edit its packing profile</span>}
      searchEmpty={narrowed ? <p className="text-sm text-text-muted">No products match the sidebar search and filters.</p> : null}
      allClear={<TriageAllClear title="No catalog products yet" detail="Catalog products appear here after they are ingested." />}
      record={{
        title: 'Product',
        noun: VIEW.noun.one,
        testId: 'product-record',
        summary: null,
        strip: null,
        view: null,
        showIndex: false,
      }}
    />
  );
}
