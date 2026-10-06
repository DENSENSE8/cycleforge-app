'use client';

/**
 * Desktop tote record — `/tote/{id}`, where a tote find hit and a scanned
 * `H-{id}` plate land on the desk (the phone keeps `/m/h/{id}`). The record
 * grammar `/search` uses for every non-order entity (SearchEntityRecord): the
 * tote's units as its lines, plus any SKU stock filed on the tote when it is a
 * stock place; code, status, bin and the order it carries as facts.
 *
 * Reads: `GET /api/handling-units/{id}` (handling_unit.view) and, for stock,
 * `GET /api/locations/{code}` (a 404 = the tote is not a stock place).
 */

import { useQuery } from '@tanstack/react-query';
import { Archive } from '@/components/Icons';
import { EmptyState } from '@/design-system/primitives';
import { SearchEntityRecord } from '@/components/search/dossier/SearchEntityRecord';
import { useHandlingUnitDetail } from '@/hooks/useHandlingUnitDetail';
import { conditionLabel } from '@/lib/conditions';
import { sentenceCaseLabel } from '@/lib/text/sentence-case-label';
import type {
  SearchDossierFact,
  SearchDossierLine,
  SearchDossierLink,
} from '@/lib/search/search-dossier-model';

interface ToteStockRow {
  id: number;
  sku: string;
  qty: number;
  productTitle: string | null;
  displayNameOverride: string | null;
}

export function ToteRecord({ toteRef, onBack }: { toteRef: string; onBack?: () => void }) {
  const detail = useHandlingUnitDetail(toteRef);
  const tote = detail.data?.handling_unit ?? null;

  const stock = useQuery<ToteStockRow[]>({
    queryKey: ['tote-record.stock', tote?.code ?? ''],
    enabled: Boolean(tote?.code),
    queryFn: async () => {
      const res = await fetch(`/api/locations/${encodeURIComponent(tote!.code)}`, { cache: 'no-store' });
      if (res.status === 404) return [];
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { contents?: ToteStockRow[] };
      return (json.contents ?? []).filter((row) => Number(row.qty) > 0);
    },
    refetchOnWindowFocus: false,
  });

  if (detail.isLoading) return null;
  if (!tote) {
    return (
      <div className="flex h-full min-h-0 flex-1 items-center justify-center bg-surface-card p-8">
        <EmptyState
          icon={<Archive className="h-6 w-6 text-text-faint" />}
          title="Tote not found"
          description={detail.error instanceof Error ? detail.error.message : 'No tote with this plate in this workspace.'}
        />
      </div>
    );
  }

  const unitLines: SearchDossierLine[] = tote.units.map((unit) => ({
    id: `unit:${unit.id}`,
    title: unit.serial_number || `Unit U-${unit.id}`,
    facts: [
      ...(unit.sku ? [{ label: 'SKU', value: unit.sku }] : []),
      { label: 'Status', value: sentenceCaseLabel(unit.current_status) },
      ...(unit.condition_grade ? [{ label: 'Condition', value: conditionLabel(unit.condition_grade, 'compact') }] : []),
      ...(unit.current_location ? [{ label: 'Bin', value: unit.current_location }] : []),
    ],
    links: [
      {
        id: `unit:${unit.id}`,
        label: 'Unit',
        value: `U-${unit.id}`,
        target: { sel: { entityType: 'unit', id: unit.id } },
      },
    ],
  }));
  const stockLines: SearchDossierLine[] = (stock.data ?? []).map((row) => ({
    id: `stock:${row.id}`,
    title: row.displayNameOverride || row.productTitle || row.sku,
    facts: [
      { label: 'SKU', value: row.sku },
      { label: 'Qty', value: String(row.qty) },
    ],
    links: [{ id: `sku:${row.sku}`, label: 'SKU', value: row.sku, target: { query: row.sku } }],
  }));
  const lines = [...unitLines, ...stockLines];

  const pairedOrder = tote.paired_order_number || (tote.paired_order_id != null ? `#${tote.paired_order_id}` : null);
  const facts: SearchDossierFact[] = [
    { id: 'code', label: 'Tote', value: tote.code, copy: true },
    { id: 'status', label: 'Status', value: sentenceCaseLabel(tote.status) },
    { id: 'bin', label: 'Bin', value: tote.location_name || 'Unassigned' },
    { id: 'order', label: 'Order', value: pairedOrder || 'None' },
    { id: 'tested', label: 'Tested', value: `${tote.rollup.tested} of ${tote.rollup.total}` },
    ...(tote.notes ? [{ id: 'notes', label: 'Notes', value: tote.notes }] : []),
  ];
  const related: SearchDossierLink[] =
    tote.paired_order_id != null && pairedOrder
      ? [
          {
            id: `order:${tote.paired_order_id}`,
            label: 'Order',
            value: pairedOrder,
            target: { sel: { entityType: 'order', id: tote.paired_order_id } },
          },
        ]
      : [];

  return (
    <SearchEntityRecord
      entity="Tote"
      reference={tote.code}
      status={tote.status}
      findings={[]}
      lines={lines}
      linesLabel={stockLines.length > 0 ? 'item' : 'unit'}
      emptyLines="Empty tote — no units or stock in it."
      events={[]}
      emptyEvents="Totes keep no timeline — open a unit for its history."
      facts={facts}
      related={related}
      handoffs={[]}
      onBack={onBack}
    />
  );
}
