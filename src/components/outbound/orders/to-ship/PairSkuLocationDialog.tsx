'use client';

/**
 * Pair SKU to location — the Allocate record's centered picker dialog
 * (operator 2026-10-08), the same shape as Report out of stock: the search is
 * open and focused over every barcoded location; type or scan a location
 * code, Enter pairs it. The location becomes the SKU's home bin
 * (`sku_stock.location`, what Allocate reads as `sku_home_location`) through
 * `POST /api/update-sku-location` (`bin.set`), the same write as the record's
 * SKU-bin picker and the phone's Set bin sheet.
 */

import { useState } from 'react';
import { IntakeCombobox } from '@/components/outbound/orders/intake/IntakeCombobox';
import { VerbDoneState } from '@/design-system/components/record-action-strip/VerbDoneState';
import { useLocationPickerOptions } from '@/hooks/useLocationPickerOptions';
import { formatOutboundStoragePath } from '@/lib/shipping/outbound-storage-path';
import { refreshDomain } from '@/lib/refresh/bus';
import { toast } from '@/lib/toast';
import type { ShippedOrder } from '@/lib/neon/orders-queries';

export function PairSkuLocationDialog({ record, done }: { record: ShippedOrder; done: () => void }) {
  const sku = String(record.sku ?? '').trim();
  const home = formatOutboundStoragePath(record.sku_home_location ? [record.sku_home_location] : null);
  const { options, loading } = useLocationPickerOptions();
  const [saving, setSaving] = useState(false);
  // The done face: where the SKU now lives, until the operator taps Done (or Enter).
  const [paired, setPaired] = useState<string | null>(null);

  const pair = async (barcode: string) => {
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch('/api/update-sku-location', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku, location: barcode }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || `Could not pair the location (${res.status})`);
      }
      refreshDomain('orders.outbound');
      setPaired(options.find((option) => option.value === barcode)?.label ?? barcode);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not pair the location');
    } finally {
      setSaving(false);
    }
  };

  if (paired) {
    return <VerbDoneState title="SKU paired" detail={`${sku} → ${paired}`} onDone={done} testId="order-pair-sku-location-done" />;
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-2" data-testid="order-pair-sku-location">
      <p className="text-role-caption text-text-soft">
        SKU <span className="font-mono text-text-default">{sku}</span>
        {home ? (
          <>
            {' '}
            · home <span className="font-mono text-text-default">{home}</span>
          </>
        ) : (
          ' · no home location yet'
        )}
      </p>
      <IntakeCombobox
        surface="open"
        value={null}
        onChange={(barcode) => void pair(barcode)}
        options={options.map((option) => ({ ...option, meta: option.meta ? `${option.value} · ${option.meta}` : option.value }))}
        placeholder="Location code"
        searchPlaceholder={loading ? 'Loading locations…' : 'Scan or type a location code…'}
        emptyMessage={loading ? 'Loading locations…' : 'No matching location'}
        disabled={saving}
        ariaLabel={`Pair SKU ${sku} to a location`}
        testId="order-pair-sku-location-combobox"
        className="flex-1"
      />
    </div>
  );
}
