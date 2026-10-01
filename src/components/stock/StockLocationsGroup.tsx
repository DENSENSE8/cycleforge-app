'use client';

/** One SKU across every tote and bin, shared by desktop and mobile records. */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SearchableSelectField } from '@/design-system/components/SearchableSelectField';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import { Button } from '@/design-system/primitives';
import { useUIModeOptional } from '@/design-system/providers/UIModeProvider';
import { RECORD_ID_CLASS, RECORD_LABEL_CLASS } from '@/design-system/tokens/record';
import { useAuth } from '@/contexts/AuthContext';
import { recallStockPlace, rememberStockPlace, useStockPlaceOptions } from '@/hooks/useStockPlaceOptions';
import { commitStockRequest, stockSetRequest } from '@/lib/inventory/stock-bin-verb-writes';
import { skuPlacesQueryKey, skuPlaceWriteTarget, type SkuPlaceRow } from '@/lib/inventory/sku-stock-places';
import { skuExceptionLocationFace } from '@/lib/inventory/sku-exception-links';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import { StockQtySlider } from '@/design-system/components/StockQtySlider';

export function StockLocationsGroup({
  sku,
  onChanged,
}: {
  sku: string;
  onChanged?: () => void | Promise<void>;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const staffId = user?.staffId && user.staffId > 0 ? user.staffId : undefined;
  const { isMobile } = useUIModeOptional();
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
  const [choice, setChoice] = useState<string | null>(() => recallStockPlace());
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const ready = choice != null && qty > 0 && !busy;

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
        stockSetRequest(skuPlaceWriteTarget(sku, barcode, existing), existing + qty, {
          staffId,
          reason: existing === 0 ? 'BIN_ADD' : 'MANUAL_COUNT',
        }),
      );
      rememberStockPlace(choice);
      toast.success(`Added ${qty} of ${sku} to ${picker.faceOf(choice)}`);
      setChoice(null);
      setQty(1);
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
      titleAccessory={(
        <span className="text-role-caption tabular-nums text-mode-muted" data-testid="stock-locations-on-hand">
          {onHand} on hand · {rows.length} {rows.length === 1 ? 'place' : 'places'}
        </span>
      )}
    >
      <div className="flex flex-col px-4 pb-3">
        {places.isLoading ? (
          <p className="py-2 text-role-caption text-mode-muted">Loading locations…</p>
        ) : rows.length > 0 ? (
          <ul className="flex flex-col" aria-label={`Totes and bins holding ${sku}`}>
            {rows.map((row) => (
              <StockPlaceCountRow key={row.location.id} sku={sku} row={row} staffId={staffId} onChanged={changed} />
            ))}
          </ul>
        ) : (
          <p className="py-2 text-role-data font-medium text-mode-warn">Not in any tote or bin</p>
        )}
        <div className="mt-2 flex flex-col gap-2 border-t border-mode-fact pt-3">
          <span className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>Add location</span>
          <SearchableSelectField
            value={choice}
            onOpenChange={(open) => { if (open) setWanted(true); }}
            onChange={(next) => setChoice(next == null ? null : String(next))}
            options={picker.options}
            loading={picker.loading}
            placeholder="Tote or bin"
            searchPlaceholder="Tote (H-12), bin code or room…"
            emptyMessage="No matching tote or location"
            ariaLabel={`Tote or bin to add ${sku} to`}
            className={cn('w-full', isMobile && 'h-11')}
            testId="stock-add-location"
          />
          <div className="flex items-center gap-2">
            <StockQtySlider value={qty} onChange={setQty} min={1} anchor={1} ariaLabel="Quantity to add" disabled={busy} testId="stock-add-location-qty" />
            <Button variant="ink" size={isMobile ? 'lg' : 'sm'} disabled={!ready} loading={busy} onClick={() => void add()} data-testid="stock-add-location-submit">
              Add
            </Button>
          </div>
        </div>
      </div>
    </RecordGroup>
  );
}

function StockPlaceCountRow({
  sku,
  row,
  staffId,
  onChanged,
}: {
  sku: string;
  row: SkuPlaceRow;
  staffId: number | undefined;
  onChanged: () => Promise<void>;
}) {
  const barcode = row.location.barcode!;
  const face = skuExceptionLocationFace(barcode);
  const [target, setTarget] = useState(row.qty);
  const [busy, setBusy] = useState(false);
  const { isMobile } = useUIModeOptional();
  const [seenQty, setSeenQty] = useState(row.qty);
  if (seenQty !== row.qty) {
    setSeenQty(row.qty);
    setTarget(row.qty);
  }
  const delta = target - row.qty;

  const apply = async () => {
    if (delta === 0 || busy) return;
    setBusy(true);
    try {
      await commitStockRequest(stockSetRequest(skuPlaceWriteTarget(sku, barcode, row.qty), target, { staffId }));
      await onChanged();
      toast.success(`${face}: ${row.qty} → ${target}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not change the count.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="flex flex-col gap-1.5 border-b border-mode-fact py-2 last:border-b-0" data-testid={`stock-location-${barcode}`}>
      <div className="flex min-w-0 items-center gap-1.5">
        <div className="min-w-0 flex-1">
          <p className={cn(RECORD_ID_CLASS, 'truncate text-mode-ink')}>{face}</p>
          {row.location.room ? <p className="truncate text-role-caption text-mode-muted">{row.location.room}</p> : null}
        </div>
        <span className={cn(RECORD_ID_CLASS, 'text-right text-mode-ink')} data-testid="stock-location-qty">{row.qty}</span>
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <StockQtySlider value={target} onChange={setTarget} anchor={row.qty} ariaLabel={`Count at ${face}`} disabled={busy} testId={`stock-location-count-${barcode}`} />
        <Button variant={delta === 0 ? 'secondary' : 'ink'} size={isMobile ? 'lg' : 'sm'} disabled={delta === 0} loading={busy} onClick={() => void apply()} data-testid={`stock-location-set-${barcode}`}>
          {delta === 0 ? 'Set' : `Set ${target}`}
        </Button>
      </div>
    </li>
  );
}
