'use client';

/**
 * Mint an on-hold placeholder for a product the catalog has never heard of.
 *
 * ## Why two fields and not one
 *
 * The barcode is what a LATER merge matches on, and the name is what a human
 * reads on the rack today. Collapsing them loses one job or the other: a
 * name-only placeholder can never be auto-matched to the real SKU when it
 * appears (every reconcile becomes somebody's memory), and a barcode-only one
 * is unreadable on every warehouse surface it shows up on.
 *
 * The search query the operator already typed seeds whichever field it looks
 * like, so the common path is one field plus Create. A wedge scanner firing
 * into the focused barcode field works for the same reason the station's
 * manual-entry field works — it is just keystrokes ending in Enter.
 *
 * ## This is a modal, and should be
 *
 * Unlike `MobileStationSheet` (the station's always-present working surface),
 * this interrupts to ask two questions and goes away. It mounts inside the
 * bind sheet's own slot rather than over the whole screen so the location code
 * stays visible above it — you are naming a thing that goes in THAT bin.
 */

import { useCallback, useMemo, useState } from 'react';
import { Loader2 } from '@/components/Icons';
import { Button } from '@/design-system/primitives/Button';
import { TextField } from '@/design-system/primitives';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import type { SkuCatalogItem } from '@/hooks/useSkuCatalogSearch';

/**
 * Does this look like something a scanner produced rather than something a
 * person typed? Digits and dashes, long enough to be a real symbology — UPC-A
 * is 12, EAN-13 is 13, and the shortest thing worth treating as a code is an
 * EAN-8.
 */
function looksLikeBarcode(value: string): boolean {
  const compact = value.trim().replace(/[\s-]/g, '');
  return compact.length >= 8 && /^[0-9]+$/.test(compact);
}

export function ProvisionalCreateSheet({
  seed,
  staffId,
  onCancel,
  onCreated,
}: {
  /** Whatever was in the search box when the operator gave up on the catalog. */
  seed: string;
  staffId: number;
  onCancel: () => void;
  /** Hands back a catalog-shaped item so the caller's normal pairing path runs. */
  onCreated: (item: SkuCatalogItem) => void;
}) {
  const seedIsBarcode = useMemo(() => looksLikeBarcode(seed), [seed]);
  const [barcode, setBarcode] = useState(seedIsBarcode ? seed.trim() : '');
  const [title, setTitle] = useState(seedIsBarcode ? '' : seed.trim());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = barcode.trim().length > 0 && title.trim().length >= 2;

  const submit = useCallback(async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/sku-catalog/provisional', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          barcode: barcode.trim(),
          productTitle: title.trim(),
          staffId: staffId > 0 ? staffId : undefined,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
        item?: { sku: string; productTitle: string; barcode: string };
      } | null;
      if (!res.ok || !data?.success || !data.item) {
        throw new Error(data?.error || `Could not create (${res.status})`);
      }
      // Shaped as a catalog hit so the caller pairs it through the exact same
      // keypad path a real SKU takes — one pairing flow, not two.
      onCreated({
        id: -1,
        sku: data.item.sku,
        zoho_sku: null,
        product_title: data.item.productTitle,
        category: null,
        upc: data.item.barcode || null,
        image_url: null,
        is_active: true,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create');
    } finally {
      setBusy(false);
    }
  }, [barcode, busy, onCreated, ready, staffId, title]);

  return (
    <div
      className={cn(
        // The border delimits this form; a second GROUND inside a white flow is
        // the wrap the kiosk retired ("There should just be a white
        // background", `kiosk-chrome.ts`) and the phone follows it.
        'flex flex-col gap-2 border border-border-soft bg-surface-card p-3',
        cornerClass('surface'),
      )}
    >
      <p className="text-role-caption font-semibold text-text-default">On-hold product</p>

      <TextField
        value={barcode}
        onChange={setBarcode}
        label="Barcode / UPC"
        mono
        inputMode="text"
        autoComplete="off"
        autoFocus={!seedIsBarcode ? false : undefined}
      />
      <TextField
        value={title}
        onChange={setTitle}
        label="What is it?"
        inputMode="text"
        autoComplete="off"
        autoFocus={seedIsBarcode}
      />

      {error && (
        <p role="alert" className="text-role-caption text-text-danger">
          {error}
        </p>
      )}

      <p className="text-role-micro text-text-faint">
        Stock counts immediately. Not sellable until it is merged into a real SKU.
      </p>

      <div className="flex items-stretch gap-2">
        <Button
          variant="ghost"
          size="lg"
          radius="flush"
          className="flex-1"
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          variant="primary"
          size="lg"
          radius="flush"
          className="flex-1"
          disabled={!ready || busy}
          icon={busy ? <Loader2 className="animate-spin" /> : undefined}
          onClick={() => void submit()}
        >
          {busy ? 'Creating…' : 'Create & count'}
        </Button>
      </div>
    </div>
  );
}
