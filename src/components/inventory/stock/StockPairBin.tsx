'use client';

/**
 * Pair tote — make a tote (or any barcoded bin) the SKU's HOME tote
 * (`sku_stock.location`, what the To-ship queue reads as `sku_home_location`),
 * `POST /api/update-sku-location`. The home can always be switched:
 *
 * - The SKU has a home → a **Home …** pill naming it (just **Home tote** when
 *   it is this record's own tote).
 * - This record has a tote that is not home yet → **Pair tote** (this one).
 * - Always → a picker over every tote and location (`useStockPlaceOptions`):
 *   choosing one pairs it — **Switch home tote** once a home exists.
 *
 * The home is ONE tote; the SKU can still sit in many totes and bins at once
 * (its Locations group, `bin_contents`).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Link2 } from '@/components/Icons';
import { SearchableSelectField } from '@/design-system/components/SearchableSelectField';
import { Button } from '@/design-system/primitives';
import { useUIModeOptional } from '@/design-system/providers/UIModeProvider';
import { skuExceptionLocationFace } from '@/lib/inventory/sku-exception-links';
import { toast } from '@/lib/toast';
import { useStockPlaceOptions } from '@/hooks/useStockPlaceOptions';

/** The home is written verbatim (the barcode the pairing sent); a match is the same string, trimmed and case-folded. */
function sameTote(a: string | null, b: string | null): boolean {
  const key = (value: string | null) => (value ?? '').trim().toUpperCase();
  return key(a) !== '' && key(a) === key(b);
}

async function pairSkuToTote(sku: string, barcode: string): Promise<void> {
  const res = await fetch('/api/update-sku-location', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sku, location: barcode }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error || `Could not pair the tote (${res.status})`);
  }
}

const HOME_PILL_CLASS = 'inline-flex h-6 items-center gap-1 rounded-full bg-surface-success px-2.5 text-xs font-medium text-text-success';

export function StockPairBin({
  sku,
  barcode,
  face,
  homeLocation,
  onPaired,
}: {
  sku: string;
  /** This record's own tote barcode; null ⇒ no tote of its own (an unplaced `TMP-`, the SKU page). */
  barcode: string | null;
  /** How this tote reads (`C-02-01-2-00`). */
  face: string | null;
  /** The SKU's home as written, null when it has none. */
  homeLocation: string | null;
  /** A surface reading the SKU client-side re-reads it here (`router.refresh` covers route loaders). */
  onPaired?: () => void;
}) {
  const router = useRouter();
  // The phone reads the same verbs at the 44px touch rung.
  const { isMobile } = useUIModeOptional();
  const [pairing, setPairing] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  // ~130 KB of locations: fetched when the picker first opens.
  const [wanted, setWanted] = useState(false);
  const places = useStockPlaceOptions({ enabled: wanted });

  const pair = async (target: string, targetFace: string) => {
    setPairing(true);
    try {
      await pairSkuToTote(sku, target);
      toast.success(`${sku} home tote is ${targetFace}`);
      router.refresh();
      onPaired?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not pair the tote');
    } finally {
      setPicked(null);
      setPairing(false);
    }
  };

  const homeIsThis = barcode != null && sameTote(homeLocation, barcode);
  const homeFace = homeLocation ? skuExceptionLocationFace(homeLocation) : null;

  return (
    <>
      {homeFace ? (
        <span
          className={HOME_PILL_CLASS}
          title={homeIsThis ? `${face ?? homeFace} is ${sku}'s home tote` : `${sku}'s home tote`}
          data-testid="stock-home-bin"
        >
          <Check className="size-3.5" aria-hidden />
          {homeIsThis ? 'Home tote' : `Home ${homeFace}`}
        </span>
      ) : null}
      {barcode != null && !homeIsThis ? (
        <Button
          variant="secondary"
          size={isMobile ? 'lg' : 'sm'}
          radius="surface"
          icon={<Link2 aria-hidden />}
          onClick={() => void pair(barcode, face ?? barcode)}
          loading={pairing && picked == null}
          title={homeFace ? `Home tote now ${homeFace} — make ${face ?? barcode} home` : `Make ${face ?? barcode} ${sku}'s home tote`}
          data-testid="stock-pair-bin"
        >
          Pair tote
        </Button>
      ) : null}
      <SearchableSelectField
        value={picked}
        onOpenChange={(open) => {
          if (open) setWanted(true);
        }}
        onChange={(next) => {
          if (next == null) return;
          const value = String(next);
          setPicked(value);
          void (async () => {
            try {
              const target = await places.resolve(value);
              await pair(target, places.faceOf(value));
            } catch (err) {
              setPicked(null);
              toast.error(err instanceof Error ? err.message : 'Could not use that tote');
            }
          })();
        }}
        options={places.options}
        loading={places.loading || pairing}
        placeholder={homeFace ? 'Switch home tote' : 'Pair a tote'}
        searchPlaceholder="Tote (H-12), bin code or room…"
        emptyMessage="No matching tote or location"
        ariaLabel={`Tote to pair ${sku} to`}
        className={isMobile ? 'h-11 w-56 max-w-full' : 'w-56'}
        testId="stock-pair-bin-picker"
      />
    </>
  );
}
