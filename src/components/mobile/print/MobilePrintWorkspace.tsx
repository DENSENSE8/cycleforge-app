'use client';

/**
 * Mobile bulk-print procedure — `/m/print`.
 *
 * One step per full page, one column, Continue. Phone sends a job over this
 * staff ID's print bridge to the ONE picked print station, which prints USB.
 *
 * Callers: src/app/m/(shell)/print/page.tsx.
 * User: "There must be a back button top left… Continue sticky… see-through.
 * No background… not below the top nav hamburger button."
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/design-system/primitives';
import { MobileTopBar } from '@/components/mobile/redesign/MobileTopBar';
import { NumericStep } from '@/components/barcode/bin-label-printer/NumericStep';
import { LABEL_BUILDER_SELECTED } from '@/components/barcode/label-builder-layout';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import { useAuth } from '@/contexts/AuthContext';
import { useLocations } from '@/hooks/useLocations';
import { useOrgGs1 } from '@/hooks/useOrgGs1';
import { useStaffPrintBridgeClient } from '@/hooks/useStaffPrintBridgeClient';
import { toast } from '@/lib/toast';
import {
  MOBILE_PRINT_DRAFT_KEY,
  mobilePrintHref,
  nextMobilePrintStep,
  parseMobilePrintStep,
  prevMobilePrintStep,
  type MobilePrintJobKind,
  type MobilePrintStep,
} from '@/lib/print/mobile-print-flow';
import {
  baysMatchingParity,
  expandRaggedBayLevelsPrintRun,
  type BayParity,
} from '@/lib/print/expand-print-run';
import {
  DEFAULT_TOTE_COPIES_PER_SIDE,
  MAX_TOTE_PRINT_RUN,
  clampCopiesPerSide,
  clampToteCount,
  toteRunPlateCount,
} from '@/lib/print/labelCopies';
import { staffPrintBlockedReason, type StaffPrintRole } from '@/lib/print/staff-print-bridge';
import { DEFAULT_CONFIG, loadConfig } from '@/components/barcode/rack-printer/rack-printer-config';
import { MobilePrintPrinterStep, MobilePrintOptionsDropdown } from '@/components/mobile/print/MobilePrintPrinterStep';
import { StaffPrintStationPicker } from '@/components/mobile/print/StaffPrintStationPicker';
import type { StaffPrintPatch } from '@/hooks/useStaffPrintBridgeClient';
import { type TotePrintMode } from '@/components/mobile/print/TotePrintRunFields';
import {
  MobilePrintPreviewStep,
  MobileTotePreviewStep,
} from '@/components/mobile/print/MobilePrintPreviewStep';
import {
  MobilePrintBaysStep,
  MobilePrintLevelsStep,
  MobilePrintRoomStep,
  type MobilePrintRoomOption,
} from '@/components/mobile/print/MobilePrintLocationSteps';

/**
 * Quick-pick chips on the tote count step. A cart holds a dozen or two, so the
 * chips cover the everyday run and `Custom count` carries the rest up to
 * {@link MAX_TOTE_PRINT_RUN}.
 */
const TOTE_COUNT_CHIPS = 24;

type Draft = {
  kind: MobilePrintJobKind | null;
  roomName: string;
  zoneLetter: string;
  aisle: number | null;
  bayParity: BayParity;
  selectedBays: number[];
  bayLevels: Record<number, number>;
  toteCount: number;
  toteMode: TotePrintMode;
  copiesPerSide: number;
  reprintCode: string;
  role: StaffPrintRole;
};

const EMPTY_DRAFT: Draft = {
  kind: null,
  roomName: '',
  zoneLetter: '',
  aisle: null,
  bayParity: 'all',
  selectedBays: [],
  bayLevels: {},
  toteCount: 10,
  toteMode: 'new',
  copiesPerSide: DEFAULT_TOTE_COPIES_PER_SIDE,
  reprintCode: '',
  role: 'label',
};

function readDraft(): Draft {
  if (typeof window === 'undefined') return EMPTY_DRAFT;
  try {
    const raw = sessionStorage.getItem(MOBILE_PRINT_DRAFT_KEY);
    if (!raw) return EMPTY_DRAFT;
    const parsed = JSON.parse(raw) as Partial<Draft> & { kind?: string };
    const kind =
      parsed.kind === 'rack' || parsed.kind === 'bin' || parsed.kind === 'tote'
        ? parsed.kind
        : null;
    return {
      ...EMPTY_DRAFT,
      ...parsed,
      kind,
      selectedBays: parsed.selectedBays ?? [],
      toteCount: clampToteCount(parsed.toteCount ?? EMPTY_DRAFT.toteCount),
      toteMode: parsed.toteMode === 'reprint' ? 'reprint' : 'new',
      copiesPerSide: clampCopiesPerSide(parsed.copiesPerSide ?? EMPTY_DRAFT.copiesPerSide),
      reprintCode: typeof parsed.reprintCode === 'string' ? parsed.reprintCode : '',
    };
  } catch {
    return EMPTY_DRAFT;
  }
}

function chipClass(on: boolean) {
  return cn(
    'h-11 border px-3 text-sm font-semibold',
    on ? LABEL_BUILDER_SELECTED.solid : 'border-border-soft bg-surface-card text-text-default',
  );
}

export function MobilePrintWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const step = parseMobilePrintStep(searchParams.get('step'));
  const { user } = useAuth();
  const { rooms, loading: roomsLoading } = useLocations();
  const { identity } = useOrgGs1();
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [hydrated, setHydrated] = useState(false);
  const bridge = useStaffPrintBridgeClient({ active: step === 'options' || step === 'print' });
  const { target, now, patchStation, sendJob } = bridge;

  useEffect(() => {
    setDraft(readDraft());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      sessionStorage.setItem(MOBILE_PRINT_DRAFT_KEY, JSON.stringify(draft));
    } catch {
      /* private mode */
    }
  }, [draft, hydrated]);

  const config = useMemo(() => {
    if (typeof window === 'undefined') return DEFAULT_CONFIG;
    return loadConfig();
  }, [hydrated]);

  const kind = draft.kind;
  const next = nextMobilePrintStep(step, kind);
  const prev = prevMobilePrintStep(step, kind);

  // The room step needs only name + zone letter; rows with no name cannot be
  // picked or printed, so they never reach the list.
  const roomOptions = useMemo<MobilePrintRoomOption[]>(
    () =>
      rooms
        .map((room) => ({
          id: room.id,
          name: (room.room || room.name || '').trim(),
          letter: (room.zone_letter || '').toUpperCase(),
        }))
        .filter((room) => room.name.length > 0),
    [rooms],
  );

  const effectiveBays = useMemo(
    () => baysMatchingParity(draft.selectedBays, draft.bayParity),
    [draft.selectedBays, draft.bayParity],
  );

  const segments = useMemo(() => {
    if (kind !== 'rack' && kind !== 'bin') return [];
    if (!draft.zoneLetter || draft.aisle == null) return [];
    return expandRaggedBayLevelsPrintRun({
      zone: draft.zoneLetter,
      aisle: draft.aisle,
      selectedBays: effectiveBays,
      bayLevels: draft.bayLevels,
      grain: kind,
    });
  }, [kind, draft.zoneLetter, draft.aisle, draft.bayLevels, effectiveBays]);

  const role: StaffPrintRole = 'label';
  const printBlocked = staffPrintBlockedReason(target, role, now);

  const go = useCallback(
    (to: MobilePrintStep) => {
      router.replace(mobilePrintHref(to));
    },
    [router],
  );

  const isTote = kind === 'tote';
  const toteTotes = draft.toteMode === 'reprint' ? 1 : clampToteCount(draft.toteCount);
  const toteTotal = toteRunPlateCount(toteTotes, draft.copiesPerSide);
  const runCount = isTote ? toteTotal : segments.length;

  const canContinue = useMemo(() => {
    if (step === 'job') return kind != null;
    if (step === 'count') {
      if (draft.toteMode === 'reprint') return draft.reprintCode.trim().length > 0;
      return draft.toteCount >= 1 && draft.toteCount <= MAX_TOTE_PRINT_RUN;
    }
    if (step === 'room') return !!draft.roomName && /^[A-Z]$/.test(draft.zoneLetter);
    if (step === 'aisle') return draft.aisle != null && draft.aisle >= 1;
    if (step === 'bays') return effectiveBays.length > 0;
    if (step === 'levels') return effectiveBays.every((b) => (draft.bayLevels[b] ?? 0) >= 1);
    if (step === 'preview') return runCount > 0;
    if (step === 'ack') return runCount > 0;
    if (step === 'options') return true;
    if (step === 'print') return runCount > 0 && printBlocked == null;
    return false;
  }, [step, kind, draft, effectiveBays, runCount, printBlocked]);

  const onBack = useCallback(() => {
    if (prev) go(prev);
    else router.push('/m/work');
  }, [prev, go, router]);

  const onContinue = useCallback(() => {
    if (!canContinue || !next) return;
    if (kind && (step === 'job' || step === 'options')) {
      setDraft((d) => ({ ...d, role: 'label' }));
    }
    go(next);
  }, [canContinue, next, go, kind, step]);

  const patchOptions = useCallback(
    async (patch: StaffPrintPatch) => {
      if (!(await patchStation(patch))) toast.error('Could not reach the printer');
    },
    [patchStation],
  );

  const firePrint = useCallback(async () => {
    const stationName = target?.status.stationName ?? 'The printer';
    const acked = await sendJob(
      isTote
        ? {
            grain: 'tote',
            role: 'label',
            tote:
              draft.toteMode === 'reprint'
                ? { copiesPerSide: draft.copiesPerSide, code: draft.reprintCode.trim() }
                : { count: draft.toteCount, copiesPerSide: draft.copiesPerSide },
          }
        : {
            grain: kind === 'bin' ? 'bin' : 'rack',
            role: 'label',
            location: {
              roomName: draft.roomName,
              gln: identity.gln,
              orgSlug: user?.organizationSlug ?? null,
              segments,
            },
          },
    );
    if (acked) toast.success(`Sent to ${stationName}.`);
    else toast.error(`${stationName} didn't respond. Try again.`);
  }, [
    sendJob,
    target,
    kind,
    isTote,
    draft.toteMode,
    draft.copiesPerSide,
    draft.reprintCode,
    draft.toteCount,
    draft.roomName,
    identity.gln,
    user?.organizationSlug,
    segments,
  ]);

  const pickRoom = (name: string, letter: string) => {
    setDraft((d) => ({
      ...d,
      roomName: name,
      zoneLetter: letter,
      aisle: null,
      selectedBays: [],
      bayLevels: {},
    }));
  };

  const toggleBay = (n: number) => {
    setDraft((d) => {
      const has = d.selectedBays.includes(n);
      const selectedBays = has ? d.selectedBays.filter((b) => b !== n) : [...d.selectedBays, n].sort((a, b) => a - b);
      const bayLevels = { ...d.bayLevels };
      if (has) delete bayLevels[n];
      else if (!bayLevels[n]) bayLevels[n] = config.maxLevels;
      return { ...d, selectedBays, bayLevels };
    });
  };

  const primaryLabel =
    step === 'print'
      ? isTote
        ? `Print ${runCount} tote${runCount === 1 ? '' : 's'}`
        : `Print ${runCount} label${runCount === 1 ? '' : 's'}`
      : next
        ? 'Continue'
        : 'Done';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <MobileTopBar onBack={onBack} />
      <div className="relative mx-auto min-h-0 w-full max-w-md flex-1">
        <div className="h-full overflow-y-auto px-4 pb-24 pt-4">
          <div className="flex flex-col gap-3">
          {step === 'job' && (
            <>
              {(
                [
                  ['rack', 'Bay labels'],
                  ['bin', 'Bin labels'],
                  ['tote', 'Tote labels'],
                ] as const
              ).map(([id, label]) => (
                <Button
                  key={id}
                  type="button"
                  variant="secondary"
                  radius="surface"
                  className={cn('h-14 w-full', chipClass(kind === id))}
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      kind: id,
                      role: 'label',
                    }))
                  }
                >
                  {label}
                </Button>
              ))}
            </>
          )}

          {step === 'count' && (
            <NumericStep
              title="How many totes"
              count={TOTE_COUNT_CHIPS}
              selected={draft.toteCount}
              onPick={(n) =>
                setDraft((d) => ({ ...d, toteCount: Math.min(n, MAX_TOTE_PRINT_RUN) }))
              }
              customLabel="Custom count"
            />
          )}

          {step === 'room' && (
            <MobilePrintRoomStep
              rooms={roomOptions}
              loading={roomsLoading}
              selectedRoom={draft.roomName}
              chipClass={chipClass}
              onPick={pickRoom}
            />
          )}

          {step === 'aisle' && (
            <NumericStep
              title="Pick an aisle"
              count={config.maxAisles}
              selected={draft.aisle ?? undefined}
              onPick={(n) => setDraft((d) => ({ ...d, aisle: n }))}
              customLabel="Custom aisle #"
            />
          )}

          {step === 'bays' && (
            <MobilePrintBaysStep
              parity={draft.bayParity}
              selectedBays={draft.selectedBays}
              chipClass={chipClass}
              onParity={(bayParity) => setDraft((d) => ({ ...d, bayParity }))}
              onToggleBay={toggleBay}
            />
          )}

          {step === 'levels' && (
            <MobilePrintLevelsStep
              bays={effectiveBays}
              bayLevels={draft.bayLevels}
              maxLevels={config.maxLevels}
              onLevel={(bay, level) =>
                setDraft((d) => ({ ...d, bayLevels: { ...d.bayLevels, [bay]: level } }))
              }
            />
          )}

          {step === 'preview' &&
            (isTote ? (
              <MobileTotePreviewStep count={runCount} />
            ) : (
              <MobilePrintPreviewStep
                segments={segments}
                roomName={draft.roomName}
                gln={identity.gln}
              />
            ))}

          {step === 'ack' && (
            <div className={cn('border border-border-soft bg-surface-card p-4', cornerClass('card'))}>
              <p className="font-mono text-lg font-semibold text-text-default">
                {isTote
                  ? `${runCount} tote${runCount === 1 ? '' : 's'}`
                  : `${draft.zoneLetter}-${String(draft.aisle ?? '').padStart(2, '0')}`}
              </p>
              <p className="mt-2 text-role-caption text-text-muted">
                {isTote ? (
                  'New boxes are created at Print — each plate is its own H- code.'
                ) : (
                  <>
                    {draft.roomName} · {effectiveBays.length} bay
                    {effectiveBays.length === 1 ? '' : 's'} · {runCount} label
                    {runCount === 1 ? '' : 's'}
                  </>
                )}
              </p>
            </div>
          )}

          {step === 'options' && (
            <MobilePrintPrinterStep
              stations={bridge.stations}
              target={target}
              now={now}
              role={role}
              onPick={bridge.pickStation}
              onPatch={patchOptions}
              onRefresh={() => void bridge.requestStatus()}
            />
          )}

          {step === 'print' && (
            <div className={cn('border border-border-soft bg-surface-card p-4', cornerClass('card'))}>
              <p className="text-sm font-semibold text-text-default">
                {isTote
                  ? `${runCount} tote plate${runCount === 1 ? '' : 's'}`
                  : `${runCount} labels · ${draft.zoneLetter}-${String(draft.aisle ?? '').padStart(2, '0')}`}
              </p>
              <div className="mt-3 flex flex-col gap-3">
                <StaffPrintStationPicker
                  stations={bridge.stations}
                  target={target}
                  now={now}
                  role={role}
                  onPick={bridge.pickStation}
                />
                {target ? (
                  <MobilePrintOptionsDropdown status={target.status} role={role} onPatch={patchOptions} />
                ) : null}
              </div>
              {bridge.progress && (
                <p className="mt-2 font-mono text-role-caption text-text-soft">
                  Printing {bridge.progress.done}/{bridge.progress.total}
                </p>
              )}
              {target && printBlocked ? (
                <p className="mt-2 text-role-caption text-text-warning">{printBlocked}</p>
              ) : null}
              {bridge.state === 'timed_out' && (
                <p className="mt-2 text-role-caption text-text-danger">
                  {target?.status.stationName ?? 'The printer'} didn&apos;t respond. Try again.
                </p>
              )}
            </div>
          )}
          </div>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-transparent px-4 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]">
          <Button
            type="button"
            variant={step === 'print' ? 'success' : 'primary'}
            radius="surface"
            className="pointer-events-auto h-14 w-full"
            disabled={step === 'print' ? !canContinue || bridge.pending : !canContinue || !next}
            loading={step === 'print' ? bridge.pending : false}
            onClick={() => {
              if (step === 'print') void firePrint();
              else onContinue();
            }}
          >
            {primaryLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
