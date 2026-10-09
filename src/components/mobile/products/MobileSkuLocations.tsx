'use client';

/** Compact one-SKU / many-location editor for phone product records. */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin } from '@/components/Icons';
import { SearchableSelectField } from '@/design-system/components/SearchableSelectField';
import { StockQtySlider } from '@/design-system/components/StockQtySlider';
import { Button } from '@/design-system/primitives';
import { useAuth } from '@/contexts/AuthContext';
import { recallStockPlace, rememberStockPlace, useStockPlaceOptions } from '@/hooks/useStockPlaceOptions';
import { commitStockRequest, stockSetRequest } from '@/lib/inventory/stock-bin-verb-writes';
import { skuPlacesQueryKey, skuPlaceWriteTarget, type SkuPlaceRow } from '@/lib/inventory/sku-stock-places';
import { skuExceptionLocationFace } from '@/lib/inventory/sku-exception-links';
import { toast } from '@/lib/toast';
import { stockQtyToneClass } from '@/design-system/tokens/stock-qty';
import { cn } from '@/utils/_cn';

function MobilePlaceCount({
  sku,
  row,
  staffId,
  refresh,
}: {
  sku: string;
  row: SkuPlaceRow;
  staffId: number | undefined;
  refresh: () => Promise<void>;
}) {
  const barcode = row.location.barcode!;
  const face = skuExceptionLocationFace(barcode);
  const [count, setCount] = useState(row.qty);
  const [busy, setBusy] = useState(false);
  const changed = count !== row.qty;
  const set = async () => {
    if (!changed || busy) return;
    setBusy(true);
    try {
      await commitStockRequest(stockSetRequest(skuPlaceWriteTarget(sku, barcode, row.qty), count, { staffId }));
      toast.success(`${face}: ${row.qty} → ${count}`);
      await refresh();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not set the count');
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="border-b border-mode-rule px-mode-page py-3 last:border-b-0">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="block truncate font-mono text-sm font-semibold text-mode-ink">{face}</span>
          {row.location.room ? <span className="block truncate text-[11px] text-mode-muted">{row.location.room}</span> : null}
        </span>
        <strong className={cn('font-mono text-base tabular-nums', stockQtyToneClass(row.qty, { inkClass: 'text-mode-ink' }))}>{row.qty}</strong>
      </div>
      <div className="flex items-center gap-2">
        <StockQtySlider value={count} onChange={setCount} anchor={row.qty} ariaLabel={`Count at ${face}`} disabled={busy} />
        <Button variant={changed ? 'ink' : 'secondary'} size="lg" radius="surface" disabled={!changed} loading={busy} onClick={() => void set()}>
          {changed ? `Set ${count}` : 'Set'}
        </Button>
      </div>
    </li>
  );
}

export function MobileSkuLocations({ sku }: { sku: string }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const staffId = user?.staffId && user.staffId > 0 ? user.staffId : undefined;
  const places = useQuery<SkuPlaceRow[]>({
    queryKey: skuPlacesQueryKey(sku),
    queryFn: async () => {
      const response = await fetch(`/api/sku-stock/${encodeURIComponent(sku)}/bins`, { credentials: 'include', cache: 'no-store' });
      if (!response.ok) throw new Error(`Could not load locations (${response.status})`);
      const body = (await response.json()) as { bins?: SkuPlaceRow[] };
      return body.bins ?? [];
    },
  });
  const rows = (places.data ?? []).filter((row) => row.location.barcode);
  const total = rows.reduce((sum, row) => sum + row.qty, 0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const picker = useStockPlaceOptions({ enabled: pickerOpen });
  const [choice, setChoice] = useState<string | null>(() => recallStockPlace());
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const refresh = async () => { await queryClient.invalidateQueries({ queryKey: skuPlacesQueryKey(sku) }); };
  const add = async () => {
    if (!choice || qty < 1 || busy) return;
    setBusy(true);
    try {
      const barcode = await picker.resolve(choice);
      const existing = rows.find((row) => row.location.barcode === barcode)?.qty ?? 0;
      await commitStockRequest(stockSetRequest(skuPlaceWriteTarget(sku, barcode, existing), existing + qty, {
        staffId,
        reason: existing === 0 ? 'BIN_ADD' : 'MANUAL_COUNT',
      }));
      rememberStockPlace(choice);
      toast.success(`Added ${qty} to ${picker.faceOf(choice)}`);
      setChoice(null);
      setQty(1);
      await refresh();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not add the location');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="bg-mode-panel" data-testid="mobile-sku-locations">
      <header className="flex min-h-11 items-center justify-between border-b border-mode-rule px-mode-page">
        <span className="flex items-center gap-2 text-sm font-semibold text-mode-ink"><MapPin className="h-4 w-4 text-emerald-600" />Locations</span>
        <span className="text-xs tabular-nums text-mode-muted">{total} on hand · {rows.length} places</span>
      </header>
      {places.isLoading ? <p className="px-mode-page py-4 text-sm text-mode-muted">Loading locations…</p> : null}
      {rows.length > 0 ? (
        <ul aria-label={`Locations holding ${sku}`}>{rows.map((row) => <MobilePlaceCount key={row.location.id} sku={sku} row={row} staffId={staffId} refresh={refresh} />)}</ul>
      ) : places.isLoading ? null : (
        <p className="px-mode-page py-4 text-sm font-semibold text-mode-warn">Not in a tote or bin yet</p>
      )}
      <div className="grid gap-2 border-t border-mode-rule px-mode-page py-3">
        <SearchableSelectField
          value={choice}
          onOpenChange={setPickerOpen}
          onChange={(next) => setChoice(next == null ? null : String(next))}
          options={picker.options}
          loading={picker.loading}
          placeholder="Add tote or bin"
          searchPlaceholder="Tote, bin code or room…"
          emptyMessage="No matching tote or location"
          ariaLabel={`Additional location for ${sku}`}
          tone="emerald"
          testId="mobile-sku-add-location"
        />
        <div className="flex items-center gap-2">
          <StockQtySlider value={qty} onChange={setQty} min={1} anchor={1} ariaLabel="Quantity to add" disabled={busy} />
          <Button variant="primary" size="lg" radius="surface" disabled={!choice || qty < 1} loading={busy} onClick={() => void add()}>Add</Button>
        </div>
      </div>
    </section>
  );
}
