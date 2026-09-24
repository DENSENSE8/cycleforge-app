'use client';

/**
 * Locations & count — one row per location holding the placeholder, each with
 * a signed amount (− takes, + puts) and Apply, plus "Add to location" for a
 * bin that holds none yet.
 *
 * Every write is the phone's own bin verb (`PATCH /api/locations/[barcode]`
 * `put` / `take` through {@link stockAdjustRequest}), so the ledger row, the
 * `sku_stock` recompute and the `STOCK_DELTA_*` publish are identical to a
 * count made on the floor. A take can never exceed what the bin holds.
 */

import { useState } from 'react';
import { Minus, Plus } from '@/components/Icons';
import { Input } from '@/components/ui/input';
import { Button } from '@/design-system/primitives/Button';
import { IconButton } from '@/design-system/primitives/IconButton';
import { SearchableSelectField } from '@/design-system/components/SearchableSelectField';
import { triagePanelControl } from '@/design-system/tokens/triage-panel';
import { useAuth } from '@/contexts/AuthContext';
import { useLocationPickerOptions } from '@/hooks/useLocationPickerOptions';
import type {
  ProvisionalSkuDetail,
  ProvisionalSkuLocation,
} from '@/lib/neon/provisional-sku-queries';
import { commitStockRequest, stockAdjustRequest } from '@/lib/inventory/stock-bin-verb-writes';
import type { StockBinWriteTarget } from '@/lib/inventory/stock-bin-writes';
import { skuExceptionLocationFace } from '@/lib/inventory/sku-exception-links';
import { toast } from '@/lib/toast';

/** Keep digits only, with an optional leading minus — the amount is signed. */
function signedDraft(raw: string): string {
  const negative = raw.trim().startsWith('-');
  const digits = raw.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  return negative ? `-${digits}` : digits;
}

function target(sku: string, barcode: string, qty: number): StockBinWriteTarget {
  const face = skuExceptionLocationFace(barcode);
  return { rowId: `${barcode}:${sku}`, barcode, sku, qty, face: `${face} · ${sku}` };
}

function LocationCountRow({
  sku,
  location,
  staffId,
  onChanged,
}: {
  sku: string;
  location: ProvisionalSkuLocation;
  staffId: number | undefined;
  onChanged: () => Promise<void>;
}) {
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const face = skuExceptionLocationFace(location.barcode);
  const parsed = Number.parseInt(draft, 10);
  // Clamp at the shelf: a take larger than the count is not a count.
  const delta = Number.isFinite(parsed) ? Math.max(parsed, -location.qty) : 0;

  const step = (by: number) => setDraft(String(Math.max(delta + by, -location.qty)));

  const apply = async () => {
    if (delta === 0 || busy) return;
    setBusy(true);
    try {
      await commitStockRequest(
        stockAdjustRequest(target(sku, location.barcode, location.qty), {
          direction: delta > 0 ? 'in' : 'out',
          qty: Math.abs(delta),
          staffId,
        }),
      );
      setDraft('');
      await onChanged();
      toast.success(`${face}: ${location.qty} → ${location.qty + delta}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not adjust the count.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="flex items-center gap-3 py-2" data-testid={`sku-exception-location-${location.barcode}`}>
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-role-body text-text-default">{face}</p>
        {location.room ? (
          <p className="truncate text-role-caption text-text-soft">{location.room}</p>
        ) : null}
      </div>
      <span className="w-16 text-right text-role-body tabular-nums text-text-default">
        {location.qty}
      </span>
      <div className="flex items-center gap-1">
        <IconButton
          size="sm"
          ariaLabel={`Take one from ${face}`}
          icon={<Minus />}
          disabled={busy || delta <= -location.qty}
          onClick={() => step(-1)}
        />
        <Input
          value={draft}
          onChange={(e) => setDraft(signedDraft(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void apply();
          }}
          inputMode="numeric"
          placeholder="±0"
          aria-label={`Amount to adjust at ${face}`}
          className={triagePanelControl('w-20 text-center tabular-nums')}
        />
        <IconButton
          size="sm"
          ariaLabel={`Add one at ${face}`}
          icon={<Plus />}
          disabled={busy}
          onClick={() => step(1)}
        />
      </div>
      <span className="w-20 text-role-caption tabular-nums text-text-muted">
        {delta !== 0 ? `→ ${location.qty + delta}` : ''}
      </span>
      <Button
        variant="secondary"
        size="sm"
        disabled={delta === 0}
        loading={busy}
        onClick={() => void apply()}
      >
        Apply
      </Button>
    </li>
  );
}

export function SkuExceptionLocations({
  item,
  onChanged,
}: {
  item: ProvisionalSkuDetail;
  onChanged: () => Promise<void>;
}) {
  const { user } = useAuth();
  const staffId = user?.staffId && user.staffId > 0 ? user.staffId : undefined;
  const { options, loading } = useLocationPickerOptions();
  const [barcode, setBarcode] = useState<string | null>(null);
  const [qtyDraft, setQtyDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const qty = Number.parseInt(qtyDraft, 10);
  const ready = Boolean(barcode) && Number.isFinite(qty) && qty > 0 && !busy;
  const existing = item.locations.find((loc) => loc.barcode === barcode)?.qty ?? 0;

  const add = async () => {
    if (!ready || !barcode) return;
    setBusy(true);
    try {
      await commitStockRequest(
        stockAdjustRequest(target(item.sku, barcode, existing), {
          direction: 'in',
          qty,
          staffId,
          // The reason the phone's pairing commit sends, so both read as one verb.
          reasonCode: 'BIN_ADD',
        }),
      );
      setQtyDraft('');
      setBarcode(null);
      await onChanged();
      toast.success(`Added ${qty} at ${skuExceptionLocationFace(barcode)}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add stock.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {item.locations.length > 0 ? (
        <ul className="divide-y divide-border-hairline" aria-label="Locations holding this SKU">
          {item.locations.map((location) => (
            <LocationCountRow
              key={location.locationId}
              sku={item.sku}
              location={location}
              staffId={staffId}
              onChanged={onChanged}
            />
          ))}
        </ul>
      ) : (
        <p className="text-role-caption text-text-soft">Not stocked in any location.</p>
      )}
      <p className="text-right text-role-caption tabular-nums text-text-muted">
        {item.stock} on hand in total
      </p>
      <div className="flex flex-wrap items-center gap-2 border-t border-border-hairline pt-4">
        <span className="text-role-caption font-semibold text-text-default">Add to location</span>
        <SearchableSelectField
          value={barcode}
          onChange={(next) => setBarcode(next == null ? null : String(next))}
          options={options}
          loading={loading}
          placeholder="Location"
          searchPlaceholder="Bin code, name or room…"
          emptyMessage="No matching location"
          ariaLabel="Location to add stock to"
          className="w-56"
          testId="sku-exception-add-location"
        />
        <Input
          value={qtyDraft}
          onChange={(e) => setQtyDraft(e.target.value.replace(/\D/g, ''))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void add();
          }}
          inputMode="numeric"
          placeholder="Qty"
          aria-label="Quantity to add"
          className={triagePanelControl('w-20 text-center tabular-nums')}
        />
        {barcode && ready ? (
          <span className="text-role-caption tabular-nums text-text-muted">
            {existing} → {existing + qty}
          </span>
        ) : null}
        <Button
          variant="primary"
          size="sm"
          className="ml-auto"
          disabled={!ready}
          loading={busy}
          onClick={() => void add()}
        >
          Add stock
        </Button>
      </div>
    </div>
  );
}
