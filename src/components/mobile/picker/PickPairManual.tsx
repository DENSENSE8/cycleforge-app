'use client';

/**
 * Pair's hand entry, in the camera's typed slot (owner 2026-10-08): no label to scan, so a switch
 * between the two things a SKU is paired by. Tote — the tote number pad; the SKU pairs to the shelf
 * the tote is parked on. Location — the stock drill-down (Rooms › Aisle › Side › Bay), full screen,
 * where tapping a location pairs it.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Check, MapPin } from '@/components/Icons';
import { ToteNumberPad } from '@/components/mobile/keypad/ToteNumberPad';
import { TabSwitch } from '@/design-system/components/TabSwitch';
import { Button } from '@/design-system/primitives';
import type { StockTote } from '@/lib/inventory/stock-places';

type Kind = 'location' | 'tote';

export function PickPairManual({
  busy,
  onPairTote,
  onChooseLocation,
}: {
  busy: boolean;
  /** Pair to the keyed tote's shelf (`H-{digits}`). */
  onPairTote: (tote: string) => void;
  /** Open the stock drill-down to choose the location. */
  onChooseLocation: () => void;
}) {
  const [kind, setKind] = useState<Kind>('location');
  const [digits, setDigits] = useState('');
  const totes = useQuery<StockTote[]>({
    queryKey: ['stock-places', 'totes'],
    enabled: kind === 'tote',
    staleTime: 30_000,
    queryFn: async () => {
      const response = await fetch('/api/stock-places', { credentials: 'include', cache: 'no-store' });
      const body = (await response.json().catch(() => null)) as { totes?: StockTote[]; error?: string } | null;
      if (!response.ok) throw new Error(body?.error || 'Could not load totes');
      return body?.totes ?? [];
    },
  });
  const tote = digits ? (totes.data ?? []).find((t) => t.id === Number(digits)) ?? null : null;
  const caption = totes.isLoading
    ? 'Loading open totes…'
    : !digits
      ? 'Tap the tote number'
      : !tote
        ? `No open tote H-${digits}`
        : tote.physicalLocationName
          ? `Parked at ${tote.physicalLocationName}`
          : 'Not parked on a shelf';
  const pairable = Boolean(tote?.physicalLocationBarcode);

  return (
    <div className="flex flex-col bg-surface-card pb-[env(safe-area-inset-bottom,0px)]" data-testid="pick-pair-manual">
      <div className="px-mode-page py-3">
        <TabSwitch
          tabs={[
            { id: 'location', label: 'Location', testId: 'pick-pair-kind-location' },
            { id: 'tote', label: 'Tote label', testId: 'pick-pair-kind-tote' },
          ]}
          activeTab={kind}
          onTabChange={(id) => setKind(id as Kind)}
        />
      </div>
      {kind === 'location' ? (
        <div className="px-mode-page pb-3">
          <Button
            variant="primary"
            size="lg"
            radius="mode"
            icon={<MapPin />}
            iconRight={<ArrowRight />}
            className="w-full"
            disabled={busy}
            onClick={onChooseLocation}
            data-testid="pick-pair-choose-location"
          >
            Choose location
          </Button>
        </div>
      ) : (
        <>
          <ToteNumberPad
            digits={digits}
            onChange={setDigits}
            toteCode={tote?.code ?? null}
            caption={caption}
            captionAlert={Boolean(digits && !totes.isLoading && !pairable)}
            disabled={busy}
            testId="pick-pair-tote-readout"
          />
          <div className="px-mode-page py-3">
            <Button
              variant="primary"
              size="lg"
              radius="mode"
              icon={<Check />}
              className="w-full"
              disabled={!pairable}
              loading={busy}
              onClick={() => onPairTote(`H-${digits}`)}
              data-testid="pick-pair-tote-confirm"
            >
              {tote ? `Pair to ${tote.code}'s shelf` : 'Pair to tote'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
