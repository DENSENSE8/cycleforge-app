'use client';

/**
 * The Move stage of the stock position sheet: how many (a stepper starting at
 * all of them), then where — a Tote or another Location, one tab each. Either
 * tab reads a label from the small live camera (or a hardware scanner); the tote tab
 * also offers the last tote in one tap. A tote plate read on the Location tab
 * switches to Tote. The host's dock commits the destination shown here.
 */

import { useEffect, useState } from 'react';
import { MapPin, Package } from '@/components/Icons';
import { scanLocation } from '@/components/mobile/scan/location-bind-api';
import type { LocationBindContent } from '@/components/mobile/scan/location-bind-types';
import { MobileDigitPad } from '@/components/mobile/keypad/MobileDigitPad';
import { MobileScanViewfinder, useScanCameraAvailable } from '@/components/mobile/v2/scan/MobileScanViewfinder';
import { findOpenTote, TOTE_DIGITS_MAX, useOpenTotes } from '@/components/mobile/v2/stock/open-totes';
import { TouchQtyStepper } from '@/design-system/components/TouchQtyStepper';
import { Button, TextField } from '@/design-system/primitives';
import { routeScan } from '@/lib/barcode-routing';
import type { StockTote } from '@/lib/inventory/stock-places';
import { vibrateScan } from '@/lib/scan-feedback/play';
import { cn } from '@/utils/_cn';

export type MoveTab = 'tote' | 'location';
export type MoveTarget = { kind: 'tote'; tote: StockTote } | { kind: 'location'; code: string; face: string };

/** The destination's face on the commit verb and the receipt. */
export function moveTargetFace(target: MoveTarget): string {
  return target.kind === 'tote' ? target.tote.code : target.face;
}

export function StockMoveStage({
  row,
  recordCode,
  qty,
  onQtyChange,
  tab,
  onTabChange,
  target,
  onTarget,
  lastToteId,
  busy,
}: {
  row: LocationBindContent;
  /** The location the stock leaves — never a destination. */
  recordCode: string;
  qty: number;
  onQtyChange: (qty: number) => void;
  tab: MoveTab;
  onTabChange: (tab: MoveTab) => void;
  target: MoveTarget | null;
  onTarget: (target: MoveTarget | null) => void;
  /** The tote this phone loaded last (the tote sheet remembers it). */
  lastToteId: number | null;
  busy: boolean;
}) {
  const totes = useOpenTotes(true);
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  /** No camera (plain http): the tote number is keyed, the location code typed. */
  const camera = useScanCameraAvailable();
  const [toteDigits, setToteDigits] = useState('');
  const [locationDraft, setLocationDraft] = useState('');
  const lastTote = lastToteId == null ? null : (totes.data ?? []).find((tote) => tote.id === lastToteId) ?? null;

  const takeTote = async (raw: string) => {
    // A scan in the first moment of the stage waits for the open totes instead of bouncing.
    const list = totes.data ?? (await totes.refetch()).data ?? [];
    const tote = findOpenTote(list, raw);
    if (!tote) {
      vibrateScan('reject');
      setError(`${raw} is not an open tote`);
      return;
    }
    vibrateScan('success');
    setError(null);
    onTabChange('tote');
    onTarget({ kind: 'tote', tote });
  };

  const takeLocation = (raw: string) => {
    setResolving(true);
    setError(null);
    void scanLocation(raw, { typed: true })
      .then(({ record }) => {
        if (record.code.toUpperCase() === recordCode.toUpperCase()) {
          vibrateScan('reject');
          setError('That is this location — scan where it goes');
          return;
        }
        vibrateScan('success');
        onTarget({ kind: 'location', code: record.code, face: record.face });
      })
      .catch((cause: unknown) => {
        vibrateScan('reject');
        setError(cause instanceof Error ? cause.message : `No location ${raw}`);
      })
      .finally(() => setResolving(false));
  };

  /** One reader for both tabs: a tote plate is always a tote, anything else follows the tab. */
  const take = (raw: string) => {
    const value = raw.trim();
    if (!value) return;
    if (routeScan(value)?.type === 'handling-unit' || tab === 'tote') void takeTote(value);
    else takeLocation(value);
  };

  // The hardware scanner's read is this stage's while it is open: claimed
  // synchronously, so the location hub (which decides in a microtask) never
  // walks to a shelf label scanned as the destination.
  useEffect(() => {
    const onWedge = (event: Event) => {
      const raw = (event as CustomEvent<{ value?: string }>).detail?.value?.trim();
      if (!raw || event.defaultPrevented) return;
      event.preventDefault();
      take(raw);
    };
    window.addEventListener('wedge-scan', onWedge);
    return () => window.removeEventListener('wedge-scan', onWedge);
  });

  const switchTab = (next: MoveTab) => {
    if (next === tab) return;
    setError(null);
    onTabChange(next);
    onTarget(null);
    setToteDigits('');
    setLocationDraft('');
  };

  return (
    <div className="grid gap-4" data-testid="stock-move-stage">
      <TouchQtyStepper
        value={qty}
        onChange={onQtyChange}
        min={1}
        max={row.qty}
        unit={['unit', 'units']}
        label="Quantity to move"
        disabled={busy}
        testId="stock-move-qty"
      />

      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Move to">
        <Button
          variant={tab === 'tote' ? 'primary' : 'secondary'}
          size="lg"
          radius="surface"
          icon={<Package />}
          aria-pressed={tab === 'tote'}
          onClick={() => switchTab('tote')}
          disabled={busy}
          data-testid="stock-move-tab-tote"
        >
          Tote
        </Button>
        <Button
          variant={tab === 'location' ? 'primary' : 'secondary'}
          size="lg"
          radius="surface"
          icon={<MapPin />}
          aria-pressed={tab === 'location'}
          onClick={() => switchTab('location')}
          disabled={busy}
          data-testid="stock-move-tab-location"
        >
          Location
        </Button>
      </div>

      {/* One small live camera for both tabs (the tab decides how a read is taken); without one, typing. */}
      <MobileScanViewfinder onDecode={take} testId="stock-move-camera" />
      {!camera && tab === 'tote' ? (
        <MobileDigitPad
          value={toteDigits}
          maxLength={TOTE_DIGITS_MAX}
          label="Tote number"
          disabled={busy}
          onChange={(value) => {
            setToteDigits(value);
            setError(null);
            const tote = value ? (totes.data ?? []).find((candidate) => candidate.id === Number(value)) ?? null : null;
            onTarget(tote ? { kind: 'tote', tote } : null);
          }}
        />
      ) : null}
      {!camera && tab === 'location' ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            take(locationDraft);
          }}
        >
          <TextField
            label="Location code"
            value={locationDraft}
            onChange={(value) => setLocationDraft(value.toUpperCase())}
            mono
            enterKeyHint="go"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            disabled={busy}
            data-testid="stock-move-location-code"
          />
        </form>
      ) : null}

      {tab === 'tote' && lastTote && target?.kind !== 'tote' ? (
        <Button
          variant="secondary"
          size="lg"
          radius="surface"
          icon={<Package />}
          onClick={() => onTarget({ kind: 'tote', tote: lastTote })}
          disabled={busy}
          className="w-full justify-start"
          data-testid="stock-move-last-tote"
        >
          Last tote · {lastTote.code}
        </Button>
      ) : null}

      <div
        className="flex min-h-14 items-center gap-3 rounded-surface border border-mode-rule px-3 py-2"
        aria-live="polite"
        data-testid="stock-move-target"
      >
        {tab === 'tote' ? (
          <Package className={cn('h-6 w-6 shrink-0', target ? 'text-emerald-600' : 'text-text-faint')} />
        ) : (
          <MapPin className={cn('h-6 w-6 shrink-0', target ? 'text-emerald-600' : 'text-text-faint')} />
        )}
        <span className="min-w-0 flex-1">
          <span className={cn('block break-words font-mono text-role-title font-semibold', target ? 'text-text-default' : 'text-text-muted')}>
            {target ? moveTargetFace(target) : tab === 'tote' ? 'No tote yet' : 'No location yet'}
          </span>
          <span className="block text-role-micro text-text-muted">
            {resolving
              ? 'Checking location…'
              : target?.kind === 'tote'
                ? target.tote.physicalLocationName ? `Tote at ${target.tote.physicalLocationName}` : 'Tote · not parked'
                : target
                  ? 'Location'
                  : camera
                    ? tab === 'tote' ? 'Point the camera at the tote label' : 'Point the camera at the shelf label'
                    : tab === 'tote' ? 'Type the number on the tote label' : 'Type the location code, then Go'}
          </span>
        </span>
      </div>

      {error || totes.error ? (
        <p role="alert" className="text-sm font-semibold text-text-danger">
          {error || (totes.error instanceof Error ? totes.error.message : 'Could not load totes')}
        </p>
      ) : null}
    </div>
  );
}
