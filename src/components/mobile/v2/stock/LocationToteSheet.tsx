'use client';

/**
 * The location record's tote sheet — one step at a time:
 *
 *   1. Select items — this shelf's loose stock, photo first; "Auto-add all
 *      items" ticks everything (or "Only park tote" skips to step 2 to park).
 *   2. Tote — scan its label (camera or scanner); the last tote is one tap.
 *   3. Number pad — the fallback when the label will not scan.
 *   → Move, then the done screen walks to the next location.
 *
 * Built for loading a whole room into totes: the last tote, the auto-add
 * switch and the park switch are remembered on the phone.
 */

import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Check, ChevronLeft, Hash, Package, ScanBarcode } from '@/components/Icons';
import { MobileDigitPad } from '@/components/mobile/keypad/MobileDigitPad';
import { locationRecordQueryKey } from '@/components/mobile/scan/location-bind-api';
import type { LocationRecord } from '@/components/mobile/scan/location-bind-types';
import { MobileV2ActionSheet } from '@/components/mobile/v2/MobileV2ActionSheet';
import { MobileScanViewfinder, useScanCameraAvailable } from '@/components/mobile/v2/scan/MobileScanViewfinder';
import { ItemRecordThumb } from '@/design-system/components/item-record/ItemRecordThumb';
import type { DetailDockVerb } from '@/design-system/components/DetailDock';
import { Button } from '@/design-system/primitives';
import { Checkbox } from '@/design-system/primitives/Checkbox';
import { Switch } from '@/design-system/primitives/Switch';
import { stockQtyToneClass } from '@/design-system/tokens/stock-qty';
import { useAuth } from '@/contexts/AuthContext';
import { useLocalStorage } from '@/hooks/_storage';
import { parseToteRef, type StockTote } from '@/lib/inventory/stock-places';
import {
  findOpenTote,
  OPEN_TOTES_QUERY_KEY,
  TOTE_DIGITS_MAX,
  TOTE_PREFS_DEFAULT,
  TOTE_PREFS_KEY,
  useOpenTotes,
  type TotePrefs,
} from './open-totes';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { vibrateScan } from '@/lib/scan-feedback/play';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';

type Mode = 'load' | 'park';
type Step = 'items' | 'tote' | 'pad';
type Verb = 'next' | 'park-only' | 'back' | 'type' | 'move' | 'park' | 'walk' | 'scan-next';

const SWITCH_ON = 'data-[state=checked]:bg-emerald-600';

export function LocationToteSheet({
  open,
  onOpenChange,
  record,
  verificationToken,
  next,
  onScanNext,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: LocationRecord;
  verificationToken: string | null;
  /** The room walk's next location, when there is one. */
  next: { face: string; open: () => void } | null;
  /** Back to the camera for the next location label. */
  onScanNext: () => void;
}) {
  const queryClient = useQueryClient();
  const { has } = useAuth();
  const canLoad = has('bin.adjust');
  const canPark = has('handling_unit.manage');
  const [prefs, setPrefs] = useLocalStorage<TotePrefs>(TOTE_PREFS_KEY, TOTE_PREFS_DEFAULT);
  const loose = useMemo(() => record.contents.filter((row) => row.qty > 0), [record.contents]);
  const canMove = canLoad && loose.length > 0;

  const [step, setStep] = useState<Step>('items');
  const [modeChoice, setMode] = useState<Mode>('load');
  // A shelf with nothing loose (or no stock permission) can only park.
  const mode: Mode = canMove ? modeChoice : 'park';
  /** The tote number scanned or keyed; empty = the remembered tote. */
  const [digits, setDigits] = useState('');
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ units: number; skus: number; code: string; parked: boolean } | null>(null);

  // Every opening starts at step 1 with the last tote and nothing hand-picked.
  // Keyed on the visit only — the shelf emptying after a Move must not wipe the done screen.
  useEffect(() => {
    if (!open) return;
    setStep('items');
    setMode('load');
    setDigits('');
    setPicked(new Set());
    setError(null);
    setDone(null);
  }, [open, record.code]);

  const totes = useOpenTotes(open);
  const toteId = digits ? Number(digits) : prefs.toteId;
  const selectedTote = toteId == null ? null : (totes.data ?? []).find((tote) => tote.id === toteId) ?? null;
  const totePlace = (tote: StockTote) => tote.physicalLocationId === record.id
    ? 'Parked here'
    : tote.physicalLocationName
      ? `At ${tote.physicalLocationName}`
      : 'Not parked';
  // Step 1 is skipped when there is nothing to choose; without a camera (plain
  // http) the tote is typed — the number pad is the tote step, never an empty feed.
  const camera = useScanCameraAvailable();
  const flowStep: Step = mode === 'park' && step === 'items' ? 'tote' : step;
  const activeStep: Step = flowStep === 'tote' && !camera ? 'pad' : flowStep;

  /** A tote label read by the camera, the scanner or typed: `H-12`, `12`, or an external code. */
  const takeTote = (raw: string) => {
    const tote = findOpenTote(totes.data ?? [], raw);
    if (!tote) {
      vibrateScan('reject');
      setError(totes.isLoading ? 'Totes are still loading — scan again' : `${raw} is not an open tote`);
      return;
    }
    vibrateScan('success');
    setDigits(String(tote.id));
    setError(null);
  };

  // The hardware scanner reads a tote label on the tote steps; elsewhere it is not ours.
  const scanning = open && !done && activeStep !== 'items';
  useEffect(() => {
    if (!scanning) return;
    const onWedge = (event: Event) => {
      const raw = (event as CustomEvent<{ value?: string }>).detail?.value?.trim();
      if (!raw || !parseToteRef(raw)) return;
      event.preventDefault();
      takeTote(raw);
    };
    window.addEventListener('wedge-scan', onWedge);
    return () => window.removeEventListener('wedge-scan', onWedge);
  });

  const chosen = prefs.autoAll ? loose : loose.filter((row) => picked.has(row.sku));
  const chosenUnits = chosen.reduce((sum, row) => sum + row.qty, 0);
  const allChosen = chosen.length === loose.length;

  const toggleSku = (sku: string, on: boolean) => {
    // Unticking under auto-add hands the list to the operator with everything else still ticked.
    const base = prefs.autoAll ? new Set(loose.map((row) => row.sku)) : new Set(picked);
    if (on) base.add(sku);
    else base.delete(sku);
    if (prefs.autoAll) setPrefs((prev) => ({ ...prev, autoAll: false }));
    setPicked(base);
  };

  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: locationRecordQueryKey(record.code) }),
    queryClient.invalidateQueries({ queryKey: OPEN_TOTES_QUERY_KEY }),
  ]);

  const load = async () => {
    if (!selectedTote || chosen.length === 0 || busy) return;
    const park = canPark && prefs.parkOnLoad;
    setBusy(true);
    setError(null);
    try {
      const commandId = safeRandomUUID();
      const response = await fetch(`/api/handling-units/${selectedTote.id}/load`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': commandId },
        body: JSON.stringify({
          locationCode: record.code,
          lines: chosen.map((row) => ({ sku: row.sku, qty: row.qty })),
          park,
          idempotencyKey: commandId,
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
        units?: number;
        moved?: unknown[];
        parked?: boolean;
      } | null;
      if (!response.ok || !body?.success) {
        // A short line means the shelf changed under the operator: back to the fresh counts.
        if (response.status === 409) {
          void refresh();
          setStep('items');
        }
        throw new Error(body?.error || 'Could not move the items');
      }
      vibrateScan('success');
      // The tote that just took stock is the one the next location starts on.
      setPrefs((prev) => ({ ...prev, toteId: selectedTote.id }));
      await refresh();
      setDone({
        units: Number(body.units) || chosenUnits,
        skus: body.moved?.length ?? chosen.length,
        code: selectedTote.code,
        parked: body.parked === true,
      });
    } catch (cause) {
      vibrateScan('reject');
      setError(cause instanceof Error ? cause.message : 'Could not move the items');
    } finally {
      setBusy(false);
    }
  };

  const parkOnly = async () => {
    if (!selectedTote || busy) return;
    setBusy(true);
    setError(null);
    try {
      const commandId = safeRandomUUID();
      const response = await fetch(`/api/handling-units/${selectedTote.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': commandId },
        body: JSON.stringify({
          action: 'move',
          locationCode: record.code,
          locationVerificationToken: verificationToken,
          placementMethod: verificationToken ? 'scan' : 'manual',
          clientEventId: commandId,
        }),
      });
      const body = (await response.json().catch(() => null)) as { success?: boolean; error?: string; unchanged?: boolean } | null;
      if (!response.ok || !body?.success) throw new Error(body?.error || 'Could not park the tote');
      setPrefs((prev) => ({ ...prev, toteId: selectedTote.id }));
      await refresh();
      toast.success(body.unchanged ? 'Tote is already here' : `${selectedTote.code} parked at ${record.face}`);
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not park the tote');
    } finally {
      setBusy(false);
    }
  };

  const close = () => { if (!busy) onOpenChange(false); };
  const noTote = digits ? `No open tote H-${digits}` : 'Scan a tote';

  /** The tote steps' one commit: Move (or Park) into the tote shown. */
  const commitVerb: DetailDockVerb<Verb> = mode === 'load'
    ? {
        id: 'move',
        label: selectedTote ? `Move ${chosenUnits} unit${chosenUnits === 1 ? '' : 's'} into ${selectedTote.code}` : noTote,
        icon: <Package />,
        primary: true,
        disabled: !selectedTote || chosen.length === 0,
        loading: busy,
        testId: 'location-tote-move',
      }
    : {
        id: 'park',
        label: selectedTote ? `Park ${selectedTote.code} at ${record.face}` : noTote,
        icon: <Package />,
        primary: true,
        disabled: !selectedTote || !canPark,
        loading: busy,
        testId: 'location-park-tote-submit',
      };
  // Back from the tote step returns to the items only when the visit started there.
  const back: DetailDockVerb<Verb>[] = activeStep === 'pad' || canMove
    ? [{ id: 'back', label: 'Back', icon: <ChevronLeft />, disabled: busy }]
    : [];

  const verbs: DetailDockVerb<Verb>[] = done
    ? [
        ...(next ? [{ id: 'scan-next' as const, label: 'Scan location', icon: <ScanBarcode /> }] : []),
        next
          ? { id: 'walk' as const, label: `Next · ${next.face}`, icon: <ArrowRight />, iconPosition: 'trailing' as const, primary: true, testId: 'location-tote-next' }
          : { id: 'scan-next' as const, label: 'Scan next location', icon: <ScanBarcode />, primary: true },
      ]
    : activeStep === 'items'
      ? [
          ...(canPark ? [{ id: 'park-only' as const, label: 'Only park tote', icon: <Package />, testId: 'location-tote-mode-park' }] : []),
          {
            id: 'next',
            label: chosen.length > 0 ? `Next · ${chosenUnits} unit${chosenUnits === 1 ? '' : 's'}` : 'Choose items to move',
            icon: <ArrowRight />,
            iconPosition: 'trailing',
            primary: true,
            disabled: chosen.length === 0,
            testId: 'location-tote-items-next',
          },
        ]
      : activeStep === 'tote'
        ? [...back, { id: 'type', label: 'Type number', icon: <Hash />, disabled: busy, testId: 'location-tote-type-number' }, commitVerb]
        : [...back, commitVerb];

  const onVerb = (verb: Verb) => {
    setError(null);
    if (verb === 'move') return load();
    if (verb === 'park') return parkOnly();
    if (verb === 'next') { setMode('load'); setStep('tote'); return; }
    if (verb === 'park-only') { setMode('park'); setStep('tote'); return; }
    if (verb === 'type') { setStep('pad'); return; }
    if (verb === 'back') {
      if (activeStep === 'pad' && camera) setStep('tote');
      else { setMode('load'); setStep('items'); }
      return;
    }
    onOpenChange(false);
    if (verb === 'walk') next?.open();
    else onScanNext();
  };

  if (done) {
    return (
      <MobileV2ActionSheet
        open={open}
        onClose={close}
        eyebrow={record.face}
        title={`Moved ${done.units} unit${done.units === 1 ? '' : 's'} into ${done.code}`}
        description={`${done.skus} item${done.skus === 1 ? '' : 's'}${done.parked ? ` · ${done.code} parked here` : ''}`}
        verbs={verbs}
        onVerb={onVerb}
        dockLabel="Next location actions"
        testId="location-tote-done"
      >
        <div className="flex items-center gap-3 px-4 py-5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-600 text-white">
            <Check className="h-5 w-5" />
          </span>
          <p className="text-sm text-text-muted">
            {next ? `Keep loading ${done.code}: go to ${next.face} or scan another location.` : `Scan the next location to keep loading ${done.code}.`}
          </p>
        </div>
      </MobileV2ActionSheet>
    );
  }

  const errorLine = error || totes.error ? (
    <p role="alert" className="px-4 text-sm font-semibold text-text-danger">
      {error || (totes.error instanceof Error ? totes.error.message : 'Could not load totes')}
    </p>
  ) : null;

  // The tote the commit will use, under the thumb on both tote steps.
  const readout = (
    <div className="flex min-h-16 items-center gap-3 border-t border-mode-rule bg-mode-panel px-4 py-2" aria-live="polite" data-testid="location-tote-readout">
      <Package className={cn('h-7 w-7 shrink-0', selectedTote ? 'text-emerald-600' : 'text-text-faint')} />
      <span className="min-w-0 flex-1">
        <span className={cn('block font-mono text-role-title font-semibold tabular-nums', selectedTote ? 'text-text-default' : 'text-text-muted')}>
          {selectedTote?.code ?? (digits ? `H-${digits}` : 'No tote yet')}
        </span>
        <span className={cn('block text-role-micro', digits && !selectedTote && !totes.isLoading ? 'font-semibold text-text-danger' : 'text-text-muted')}>
          {totes.isLoading
            ? 'Loading open totes…'
            : selectedTote
              ? `${digits ? '' : 'Last tote · '}${totePlace(selectedTote)}`
              : noTote}
        </span>
      </span>
    </div>
  );

  // Where the tote ends up, on whichever tote step is showing (camera or number pad).
  const placement = (
    <>
      {mode === 'load' && canPark ? (
        <label className="flex min-h-12 items-center gap-3 px-4">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-text-default">Also park tote here</span>
            <span className="block text-role-micro text-text-muted">Off while one tote collects from many locations</span>
          </span>
          <Switch
            checked={prefs.parkOnLoad}
            onCheckedChange={(on) => setPrefs((prev) => ({ ...prev, parkOnLoad: on }))}
            checkedClassName={SWITCH_ON}
            aria-label="Also park tote here"
          />
        </label>
      ) : null}
      {mode === 'park' ? (
        <p className="px-4 text-xs text-text-muted">
          {!canPark
            ? 'You cannot park totes.'
            : verificationToken ? 'Placement is backed by this location scan.' : 'Manual placement is recorded in inventory history.'}
        </p>
      ) : null}
    </>
  );

  if (activeStep === 'items') {
    return (
      <MobileV2ActionSheet
        open={open}
        onClose={close}
        eyebrow={`${record.face} · Step 1 of 2`}
        title="Select items"
        description={`${loose.length} item${loose.length === 1 ? '' : 's'} · ${loose.reduce((sum, row) => sum + row.qty, 0)} units on this location`}
        verbs={verbs}
        onVerb={onVerb}
        dockLabel="Select items actions"
        testId="location-tote-sheet"
      >
        <label className="flex min-h-14 items-center gap-3 border-b border-border-soft px-4 py-2">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-text-default">Auto-add all items</span>
            <span className="block text-role-micro text-text-muted">Every item on each location goes into the tote</span>
          </span>
          <Switch
            checked={prefs.autoAll}
            onCheckedChange={(on) => {
              setPrefs((prev) => ({ ...prev, autoAll: on }));
              if (!on) setPicked(new Set(loose.map((row) => row.sku)));
            }}
            checkedClassName={SWITCH_ON}
            aria-label="Auto-add all items"
            data-testid="location-tote-auto-all"
          />
        </label>
        {errorLine ? <div className="pt-3">{errorLine}</div> : null}
        <div role="group" aria-label="Items to move">
          <div className="flex min-h-10 items-center justify-between px-4 text-role-micro font-semibold text-text-muted">
            <span>{chosen.length} of {loose.length} selected</span>
            {!prefs.autoAll ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPicked(allChosen ? new Set() : new Set(loose.map((row) => row.sku)))}
              >
                {allChosen ? 'Clear' : 'Select all'}
              </Button>
            ) : null}
          </div>
          {loose.map((row) => {
            const on = prefs.autoAll || picked.has(row.sku);
            const title = row.productTitle?.trim() || row.sku;
            return (
              // The photo leads: it is what the operator matches against the shelf.
              <label
                key={row.sku}
                className={cn(
                  'grid min-h-28 cursor-pointer grid-cols-[6rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-border-soft px-4 py-3 transition-opacity',
                  on ? 'opacity-100' : 'opacity-50',
                )}
                data-testid="location-tote-item"
              >
                <span className="relative">
                  <ItemRecordThumb imageUrl={row.imageUrl} plainEmpty className="h-24 min-h-24 w-24 rounded-xl" iconClassName="h-8 w-8" />
                  <Checkbox
                    checked={on}
                    onCheckedChange={(value) => toggleSku(row.sku, value === true)}
                    aria-label={`Move ${title}`}
                    className="absolute left-1 top-1 h-6 w-6 bg-surface-card data-[state=checked]:border-emerald-600 data-[state=checked]:bg-emerald-600"
                  />
                </span>
                <span className="min-w-0">
                  <span className="block break-words text-base font-semibold leading-5 text-text-default">{title}</span>
                  <span className="mt-1 block break-words font-mono text-role-micro text-text-muted">{row.sku}</span>
                </span>
                <span className={cn('text-right font-mono text-role-title font-bold tabular-nums', stockQtyToneClass(row.qty))}>
                  ×{row.qty}
                </span>
              </label>
            );
          })}
        </div>
      </MobileV2ActionSheet>
    );
  }

  if (activeStep === 'pad') {
    return (
      <MobileV2ActionSheet
        open={open}
        onClose={close}
        eyebrow={camera ? `${record.face} · Type tote number` : mode === 'load' ? `${record.face} · Step 2 of 2` : record.face}
        title={mode === 'load' ? `Move ${chosenUnits} unit${chosenUnits === 1 ? '' : 's'} into…` : 'Park tote'}
        description="Tap the number on the tote label"
        verbs={verbs}
        onVerb={onVerb}
        dockLabel="Tote number actions"
        testId="location-tote-pad"
        pinned={(
          <>
            {readout}
            <MobileDigitPad
              value={digits}
              maxLength={TOTE_DIGITS_MAX}
              label="Tote number"
              disabled={busy}
              onChange={(value) => {
                setDigits(value);
                setError(null);
              }}
            />
          </>
        )}
      >
        <div className="grid gap-3 py-3">
          {errorLine}
          {placement}
        </div>
      </MobileV2ActionSheet>
    );
  }

  return (
    <MobileV2ActionSheet
      open={open}
      onClose={close}
      eyebrow={mode === 'load' ? `${record.face} · Step 2 of 2` : record.face}
      title={mode === 'load' ? 'Scan the tote' : 'Park tote'}
      description={mode === 'load'
        ? `${chosen.length} item${chosen.length === 1 ? '' : 's'} · ${chosenUnits} unit${chosenUnits === 1 ? '' : 's'} going in`
        : `Attach an open tote to ${record.face}`}
      verbs={verbs}
      onVerb={onVerb}
      dockLabel="Tote actions"
      testId="location-tote-scan"
      pinned={readout}
    >
      <div className="grid gap-3 py-3">
        <div className="px-4">
          <MobileScanViewfinder onDecode={takeTote} testId="location-tote-camera" />
        </div>
        {errorLine}
        {placement}
      </div>
    </MobileV2ActionSheet>
  );
}
