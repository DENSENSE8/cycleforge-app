'use client';

/**
 * Locations — every tote and bin holding the SKU (one SKU, many places:
 * one `bin_contents` row each, `GET /api/sku-stock/[sku]/bins`), each with
 * the one count control (− / signed amount / + · Apply), then **Add
 * location**: a tote or bin (`useStockPlaceOptions`; a tote that never held
 * stock becomes a stock place on first use) and a qty, written as the
 * phone's own put (`PATCH /api/locations/[barcode]`, reason `BIN_ADD`).
 * Mounted by every stock record — paired and `TMP-` placeholder alike.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SearchableSelectField } from '@/design-system/components/SearchableSelectField';
import { EVIDENCE_CONTROL_CLASS, EvidenceCountStepper } from '@/design-system/components/record-ledger/RecordEvidence';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import { Button } from '@/design-system/primitives';
import { RECORD_ID_CLASS, RECORD_LABEL_CLASS } from '@/design-system/tokens/industrial-record';
import { useAuth } from '@/contexts/AuthContext';
import { skuExceptionLocationFace } from '@/lib/inventory/sku-exception-links';
import { commitStockRequest, stockAdjustRequest } from '@/lib/inventory/stock-bin-verb-writes';
import type { StockBinWriteTarget } from '@/lib/inventory/stock-bin-writes';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import { useStockPlaceOptions } from './useStockPlaceOptions';

interface SkuPlaceRow {
  location: { id: number; name: string; room: string | null; barcode: string | null };
  qty: number;
}

export function skuPlacesQueryKey(sku: string) {
  return ['sku-stock', sku, 'places'] as const;
}

function writeTarget(sku: string, barcode: string, qty: number): StockBinWriteTarget {
  return { rowId: `${barcode}:${sku}`, barcode, sku, qty, face: `${skuExceptionLocationFace(barcode)} · ${sku}` };
}

export function StockLocationsGroup({
  sku,
  onChanged,
}: {
  sku: string;
  /** Anything else reading this SKU's stock re-reads here (the SKU-exception detail). */
  onChanged?: () => void | Promise<void>;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const staffId = user?.staffId && user.staffId > 0 ? user.staffId : undefined;

  const places = useQuery<SkuPlaceRow[]>({
    queryKey: skuPlacesQueryKey(sku),
    queryFn: async () => {
      const res = await fetch(`/api/sku-stock/${encodeURIComponent(sku)}/bins`, { credentials: 'include', cache: 'no-store' });
      if (!res.ok) throw new Error(`Could not load locations (${res.status})`);
      const json = (await res.json()) as { bins?: SkuPlaceRow[] };
      return json.bins ?? [];
    },
  });
  const rows = (places.data ?? []).filter((row) => row.location.barcode);
  const onHand = rows.reduce((sum, row) => sum + row.qty, 0);

  const [wanted, setWanted] = useState(false);
  const picker = useStockPlaceOptions({ enabled: wanted });
  const [choice, setChoice] = useState<string | null>(null);
  const [qtyDraft, setQtyDraft] = useState('1');
  const [busy, setBusy] = useState(false);
  const qty = Number.parseInt(qtyDraft, 10);
  const ready = choice != null && Number.isFinite(qty) && qty > 0 && !busy;

  const changed = async () => {
    await queryClient.invalidateQueries({ queryKey: skuPlacesQueryKey(sku) });
    router.refresh();
    await onChanged?.();
  };

  const add = async () => {
    if (!ready || choice == null) return;
    setBusy(true);
    try {
      const barcode = await picker.resolve(choice);
      const existing = rows.find((row) => row.location.barcode === barcode)?.qty ?? 0;
      await commitStockRequest(
        stockAdjustRequest(writeTarget(sku, barcode, existing), { direction: 'in', qty, staffId, reasonCode: 'BIN_ADD' }),
      );
      toast.success(`Added ${qty} of ${sku} to ${picker.faceOf(choice)}`);
      setChoice(null);
      setQtyDraft('1');
      await changed();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add stock.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <RecordGroup
      title="Locations"
      testId="stock-locations"
      titleAccessory={
        <span className="text-role-caption tabular-nums text-mode-muted" data-testid="stock-locations-on-hand">
          {onHand} on hand · {rows.length} {rows.length === 1 ? 'place' : 'places'}
        </span>
      }
    >
      <div className="flex flex-col px-4 pb-3">
        {places.isLoading ? (
          <p className="py-2 text-role-caption text-mode-muted">Loading locations…</p>
        ) : rows.length > 0 ? (
          <ul className="flex flex-col" aria-label={`Totes and bins holding ${sku}`}>
            {rows.map((row) => {
              const barcode = row.location.barcode!;
              const face = skuExceptionLocationFace(barcode);
              return (
                <li
                  key={row.location.id}
                  className="flex items-center gap-1.5 border-b border-mode-fact py-1.5 last:border-b-0"
                  data-testid={`stock-location-${barcode}`}
                >
                  <div className="min-w-0 flex-1">
                    <p className={cn(RECORD_ID_CLASS, 'truncate text-mode-ink')}>{face}</p>
                    {row.location.room ? <p className="truncate text-role-caption text-mode-muted">{row.location.room}</p> : null}
                  </div>
                  <span className={cn(RECORD_ID_CLASS, 'w-8 text-right text-mode-ink')} data-testid="stock-location-qty">
                    {row.qty}
                  </span>
                  <EvidenceCountStepper
                    face={face}
                    qty={row.qty}
                    onCommit={async (delta) => {
                      await commitStockRequest(
                        stockAdjustRequest(writeTarget(sku, barcode, row.qty), {
                          direction: delta > 0 ? 'in' : 'out',
                          qty: Math.abs(delta),
                          staffId,
                        }),
                      );
                      await changed();
                    }}
                  />
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="py-2 text-role-data font-medium text-mode-warn">Not in any tote or bin</p>
        )}
        <div className="mt-2 flex flex-col gap-2 border-t border-mode-fact pt-3">
          <span className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>Add location</span>
          <div className="flex items-center gap-2">
            <SearchableSelectField
              value={choice}
              onOpenChange={(open) => {
                if (open) setWanted(true);
              }}
              onChange={(next) => setChoice(next == null ? null : String(next))}
              options={picker.options}
              loading={picker.loading}
              placeholder="Tote or bin"
              searchPlaceholder="Tote (H-12), bin code or room…"
              emptyMessage="No matching tote or location"
              ariaLabel={`Tote or bin to add ${sku} to`}
              className="min-w-0 flex-1"
              testId="stock-add-location"
            />
            <input
              value={qtyDraft}
              onChange={(event) => setQtyDraft(event.target.value.replace(/\D/g, ''))}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void add();
              }}
              inputMode="numeric"
              placeholder="Qty"
              aria-label="Quantity to add"
              className={cn(EVIDENCE_CONTROL_CLASS, 'w-14 text-center tabular-nums')}
              data-testid="stock-add-location-qty"
            />
            <Button variant="ink" size="sm" disabled={!ready} loading={busy} onClick={() => void add()} data-testid="stock-add-location-submit">
              Add
            </Button>
          </div>
        </div>
      </div>
    </RecordGroup>
  );
}
