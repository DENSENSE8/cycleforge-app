'use client';

/**
 * One FNSKU on the Print station — read top to bottom as the job:
 *
 *   Label      the sticker exactly as the thermal head draws it
 *   How many   a snapped common-run slider plus always-visible exact entry
 *   Print at   every computer in the org — who is at it, online, label printer
 *   Print      "Print 3 labels → Packing bench": this computer prints here;
 *              any other station gets the `fnsku` job and prints silently.
 *              "Test print" sends the same run the same way, face marked
 *              TEST PRINT, and never logs a reprint.
 * The aside carries only the label identity, title, and editable condition.
 * Condition edits redraw the preview immediately and persist only on Save.
 */

import { useEffect, useMemo, useState } from 'react';
import { Check, Monitor, Printer, User } from '@/components/Icons';
import { AnimatedStat } from '@/design-system/components/AnimatedStat';
import { DeskRecordLayout } from '@/design-system/components/DeskRecordPlane';
import { InlineEditableValue } from '@/design-system/components/InlineEditableValue';
import { EvidenceFactRow } from '@/design-system/components/record-ledger/EvidenceDisclosure';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import {
  AnimatePresence,
  MagneticActionField,
  defineStateMotionContract,
  motion,
  motionContentSwap,
  motionTargetFor,
  useReducedMotion,
} from '@/design-system/motion';
import { Button } from '@/design-system/primitives';
import { DeferredQtyInput } from '@/design-system/primitives/DeferredQtyInput';
import { StopSlider } from '@/design-system/primitives/StopSlider';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { RECORD_ID_CLASS } from '@/design-system/tokens/record';
import { usePrintStations, type PrintStationEntry } from '@/hooks/usePrintStations';
import { useStaffNameMap } from '@/hooks/useStaffNameMap';
import { clampLabelCopies, MAX_LABEL_COPIES } from '@/lib/print/labelCopies';
import { PRINT_STATION_NAME_MAX } from '@/lib/print/print-station';
import { UNNAMED_PRINT_STATION } from '@/lib/print/staff-print-bridge';
import type { PrintStationFnskuRow } from '@/lib/print-station/fnsku';
import type { PrintStationFnskuPatch } from '@/lib/print-station/fnsku-client';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { cn } from '@/utils/_cn';
import { FnskuConditionPicker } from './FnskuConditionPicker';

const FACTS_BODY_CLASS = 'flex flex-col px-4 pb-1 [&>*:last-child]:border-b-0';

/** The record body on the triage stage canvas. */
export const FNSKU_RECORD_ROOT_CLASS = 'flex-1 bg-mode-canvas p-4 text-mode-ink';

/** Useful print-run sizes. Manual entry inserts its exact value into this scale. */
const COPY_STOPS = [1, 2, 5, 10, 20, 30, 40, 50, 75, MAX_LABEL_COPIES] as const;

/** After a station acks, how long until its print log lands (it prints, then logs). */
const LOG_SETTLE_MS = 4_000;

const labels = (n: number) => `${n} ${n === 1 ? 'label' : 'labels'}`;

// ── Print state → motion ──────────────────────────────────────────────────────

type PrintPhase = 'idle' | 'sending' | 'sent' | 'cancelled' | 'failed';

/** Product state is the phase; the notice's travel is only its projection. */
const PRINT_NOTICE_MOTION = defineStateMotionContract<PrintPhase, { opacity: number; y: number }>({
  targets: {
    idle: { opacity: 0, y: 4 },
    sending: { opacity: 1, y: 0 },
    sent: { opacity: 1, y: 0 },
    cancelled: { opacity: 1, y: 0 },
    failed: { opacity: 1, y: 0 },
  },
  transition: motionContentSwap.enter,
  reducedTransition: { duration: 0 },
});

// ── Label preview ─────────────────────────────────────────────────────────────

/** The sticker as the thermal head draws it. bwip-js loads on demand — never in the page bundle. */
function FnskuLabelPreview({ row }: { row: PrintStationFnskuRow }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    import('@/lib/print/fnskuLabel')
      .then(({ fnskuLabelPreviewUrl }) => fnskuLabelPreviewUrl({ fnsku: row.fnsku, title: row.title ?? '', condition: row.condition ?? '' }))
      .then(
        (url) => live && setSrc(url),
        (error: unknown) => live && setFailure(error instanceof Error ? error.message : 'Could not draw the label.'),
      );
    return () => {
      live = false;
    };
  }, [row.fnsku, row.title, row.condition]);

  return (
    <div className="flex items-center justify-center bg-white" data-testid="fnsku-label-preview">
      {/* Same 2×1 face, without a decorative frame. Browser scaling stays smooth for label text. */}
      <div className="relative flex aspect-[2/1] w-full max-w-sm items-center justify-center overflow-hidden bg-white">
        <AnimatePresence initial={false}>
          {src ? (
            <motion.img
              key={src}
              src={src}
              alt={`FBA label ${row.fnsku}`}
              className="h-full w-full object-contain"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={motionContentSwap.enter}
            />
          ) : (
            <span className="text-role-caption text-text-muted">{failure ?? 'Drawing the label…'}</span>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── Quantity ──────────────────────────────────────────────────────────────────

function QuantityPicker({ copies, onCopies, disabled }: { copies: number; onCopies: (next: number) => void; disabled: boolean }) {
  const set = (next: number) => onCopies(clampLabelCopies(next));
  const stops = useMemo<readonly number[]>(() => {
    if (COPY_STOPS.includes(copies as (typeof COPY_STOPS)[number])) return COPY_STOPS;
    return [...COPY_STOPS, copies].sort((a, b) => a - b);
  }, [copies]);

  return (
    <div className="flex flex-col gap-3 px-4 pb-4 pt-1">
      <div className="flex items-end justify-between gap-4">
        <div className="flex items-baseline gap-2" aria-live="polite">
          <AnimatedStat value={copies} profile="scanQuantity" className="text-4xl font-semibold text-text-default" />
          <span className="text-role-caption text-text-muted">{copies === 1 ? 'label' : 'labels'}</span>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-role-caption text-text-muted">
          Exact
          <DeferredQtyInput
            value={copies}
            onChange={set}
            min={1}
            max={MAX_LABEL_COPIES}
            disabled={disabled}
            aria-label="Exact number of labels"
            className={cn(
              'h-9 w-20 rounded-mode-control border border-border-hairline bg-surface-card px-2 text-right text-role-data tabular-nums text-text-default',
              focusRing('control'),
            )}
          />
        </label>
      </div>

      <StopSlider
        stops={stops}
        value={copies}
        onChange={set}
        disabled={disabled}
        ariaLabel="Label quantity"
        formatValue={labels}
        data-testid="fnsku-copies-slider"
      />
    </div>
  );
}

// ── Stations ──────────────────────────────────────────────────────────────────

/**
 * Why this station cannot print a label right now; null when it can. The page
 * requires `print.label`, the same grant that publishes to any org station.
 */
function stationBlocked(station: PrintStationEntry): string | null {
  if (station.thisComputer) return null;
  if (!station.live) return 'Offline';
  if (!station.label.ready) return 'No label printer set up';
  return null;
}

function StationPicker({
  stations,
  chosenId,
  onChoose,
  disabled,
  canRename,
  onRename,
}: {
  stations: readonly PrintStationEntry[];
  chosenId: string | null;
  onChoose: (id: string) => void;
  disabled: boolean;
  canRename: (station: PrintStationEntry) => boolean;
  onRename: (stationId: string, name: string) => Promise<void>;
}) {
  const reduce = useReducedMotion();
  if (stations.length === 0) {
    return <p className="px-4 pb-4 text-role-caption text-text-muted">Looking for print stations…</p>;
  }
  return (
    <ul role="radiogroup" aria-label="Print at" className="flex flex-col gap-1 px-2 pb-2" data-testid="fnsku-stations">
      {stations.map((station, index) => (
        <motion.li
          key={station.stationId}
          className="relative"
          initial={reduce ? false : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduce ? { duration: 0 } : { ...motionContentSwap.enter, delay: Math.min(index, 8) * 0.025 }}
        >
          <StationRow
            station={station}
            chosen={station.stationId === chosenId}
            onChoose={() => onChoose(station.stationId)}
            disabled={disabled}
            canRename={canRename(station)}
            onRename={onRename}
          />
        </motion.li>
      ))}
    </ul>
  );
}

/** How long "Name saved" stays in the row's meta line. */
const NAME_SAVED_MS = 2_500;

/**
 * One station. The whole row is the radio (a stretched button under the
 * content); on the chosen row the NAME itself is the editor: click it, type,
 * Enter or click away saves for the whole org, Esc puts it back. The meta line
 * reports saving / saved / the refusal, in place.
 */
function StationRow({
  station,
  chosen,
  onChoose,
  disabled,
  canRename,
  onRename,
}: {
  station: PrintStationEntry;
  chosen: boolean;
  onChoose: () => void;
  disabled: boolean;
  canRename: boolean;
  onRename: (stationId: string, name: string) => Promise<void>;
}) {
  const { getStaffName } = useStaffNameMap();
  const reduce = useReducedMotion();
  const blocked = stationBlocked(station);
  const who = station.lastSeenStaffId ? getStaffName(station.lastSeenStaffId) : null;
  // Unnamed opens blank, never pre-filled with the "Unnamed computer" filler.
  const saved = station.stationName === UNNAMED_PRINT_STATION ? '' : station.stationName;
  // null = untouched: the row follows the registry (a rename from another computer lands here too).
  const [draft, setDraft] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const name = (draft ?? saved).trim().slice(0, PRINT_STATION_NAME_MAX);
    if (draft === null || name === saved) {
      setDraft(null);
      return;
    }
    setRenaming('saving');
    setError(null);
    try {
      await onRename(station.stationId, name);
      setRenaming('saved');
      window.setTimeout(() => setRenaming((now) => (now === 'saved' ? 'idle' : now)), NAME_SAVED_MS);
    } catch (failure) {
      setRenaming('idle');
      setError(failure instanceof Error ? failure.message : 'The station name was not saved.');
    } finally {
      setDraft(null);
    }
  };

  const meta =
    error != null
      ? { text: error, tone: 'text-text-danger' }
      : renaming === 'saving'
        ? { text: 'Saving name…', tone: 'text-text-muted' }
        : renaming === 'saved'
          ? { text: 'Name saved for everyone', tone: 'text-text-success' }
          : blocked
            ? { text: blocked, tone: 'text-text-warning' }
            : { text: station.label.printer ?? (station.thisComputer ? 'Prints here' : 'Label printer ready'), tone: '' };

  return (
    <>
      <button
        type="button"
        role="radio"
        aria-checked={chosen}
        aria-label={`${station.stationName}${station.thisComputer ? ' (this computer)' : ''}`}
        disabled={disabled || blocked != null}
        onClick={onChoose}
        className={cn(
          'absolute inset-0 rounded-mode-control transition-colors',
          blocked ? 'cursor-not-allowed' : chosen ? '' : 'hover:bg-surface-sunken',
          focusRing('control'),
        )}
        data-testid="fnsku-station"
        data-station-id={station.stationId}
      >
        {chosen ? (
          <motion.span
            layoutId="fnsku-station-plate"
            className="absolute inset-0 rounded-mode-control bg-surface-sunken ring-2 ring-inset ring-fill-info"
            transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 460, damping: 36 }}
          />
        ) : null}
      </button>
      {/* Content rides above the radio and lets clicks fall through — except the name editor. */}
      <div className={cn('pointer-events-none relative flex min-w-0 items-center gap-3 px-3 py-2.5', blocked && 'opacity-60')}>
        <span className="relative flex size-8 shrink-0 items-center justify-center rounded-mode-control bg-surface-card ring-1 ring-inset ring-border-hairline">
          <Monitor className="size-4 text-text-muted" />
          {/* Live dot: the station's heartbeat, not decoration. */}
          <span
            aria-hidden
            className={cn('absolute -right-0.5 -top-0.5 size-2.5 rounded-full ring-2 ring-surface-card', station.live ? 'bg-fill-success' : 'bg-text-faint')}
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            {chosen && canRename ? (
              <InlineEditableValue
                value={draft ?? saved}
                placeholder={UNNAMED_PRINT_STATION}
                onChange={(next) => {
                  setDraft(next);
                  setError(null);
                }}
                onSubmit={() => void save()}
                onCancel={() => setDraft(null)}
                editable={!disabled && renaming !== 'saving'}
                ariaLabel="Rename print station"
                className="pointer-events-auto min-w-0"
                inputClassName="h-6 min-w-48"
              />
            ) : (
              <span className="truncate text-sm font-semibold text-text-default">{station.stationName}</span>
            )}
            {station.thisComputer ? (
              <span className="shrink-0 rounded-mode-control bg-surface-card px-1.5 text-[11px] font-medium text-text-muted ring-1 ring-inset ring-border-hairline">This computer</span>
            ) : null}
          </span>
          <span className="flex min-w-0 items-center gap-1.5 text-role-caption text-text-muted">
            {who ? (
              <>
                <User className="size-3 shrink-0" />
                <span className="truncate">{who}</span>
                <span aria-hidden>·</span>
              </>
            ) : null}
            <span className={cn('flex min-w-0 items-center gap-1 truncate', meta.tone)} role={error ? 'alert' : undefined}>
              {renaming === 'saved' ? <Check className="size-3 shrink-0" /> : null}
              <span className="truncate">{meta.text}</span>
            </span>
          </span>
        </span>
        {chosen ? <Check className="size-4 shrink-0 text-text-info" /> : null}
      </div>
    </>
  );
}

// ── Record ────────────────────────────────────────────────────────────────────

export function FnskuPrintRecord({
  row,
  onPrinted,
  onSaveLabel,
  labelSaving,
}: {
  row: PrintStationFnskuRow;
  onPrinted: () => void;
  onSaveLabel: (patch: PrintStationFnskuPatch) => Promise<void>;
  labelSaving: boolean;
}) {
  const stations = usePrintStations();
  const reduce = useReducedMotion();
  const [copies, setCopies] = useState(1);
  const [conditionDraft, setConditionDraft] = useState(row.condition ?? '');
  const [titleDraft, setTitleDraft] = useState(row.title ?? '');
  // The target for THIS reprint — seeded from the staffer's label station, never written back
  // (sending one sticker to a packer's table must not move the manager's own default).
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [phase, setPhase] = useState<PrintPhase>('idle');
  const [notice, setNotice] = useState('');

  // The pick, while that computer is still in the roster; a station that stops heartbeating drops out,
  // and the target falls back to the staffer's label station (else the first) instead of vanishing.
  const byId = (id: string | null) => (id ? (stations.stations.find((s) => s.stationId === id) ?? null) : null);
  const chosen = byId(chosenId) ?? byId(stations.target.label?.stationId ?? null) ?? stations.stations[0] ?? null;
  const blocked = chosen ? stationBlocked(chosen) : 'Choose a print station';

  const print = async ({ test = false }: { test?: boolean } = {}) => {
    if (!chosen || blocked) return;
    const count = clampLabelCopies(copies);
    const run = test ? `a test print of ${labels(count)}` : labels(count);
    setPhase('sending');
    setNotice(chosen.thisComputer ? `Printing ${run} here…` : `Sending ${run} to ${chosen.stationName}…`);
    if (chosen.thisComputer) {
      // This computer: the same station-side job, run here (prints silently when set up, else the dialog; logs a reprint unless it is a test).
      const { printFnskuStationJob } = await import('@/lib/print/printFnskuStationJob');
      const job = test ? { fnsku: row.fnsku, copies: count, test: true as const } : { fnsku: row.fnsku, copies: count };
      const outcome = await printFnskuStationJob(job, safeRandomUUID()).catch((error: unknown) => ({
        printed: 0,
        cancelled: false,
        failure: error instanceof Error ? error.message : 'The label did not print.',
      }));
      if (outcome.cancelled) {
        setPhase('cancelled');
        setNotice(`Cancelled — ${outcome.printed} of ${labels(count)} printed here.`);
      } else {
        setPhase(outcome.failure ? 'failed' : 'sent');
        setNotice(outcome.failure ?? (test ? `Test printed ${labels(count)} here — nothing logged.` : `Printed ${labels(count)} of ${row.fnsku} here.`));
      }
      // A test print logs nothing, so the list has nothing new to read.
      if (!test && outcome.printed > 0) onPrinted();
      return;
    }
    const acked = await stations.sendFnsku(chosen.stationId, row.fnsku, count, { test });
    setPhase(acked ? 'sent' : 'failed');
    setNotice(
      acked
        ? `${chosen.stationName} is printing ${run} of ${row.fnsku}.`
        : `${chosen.stationName} did not answer — is CycleForge open there? Nothing was printed.`,
    );
    // The station prints, then logs; the list re-reads once that log has had time to land.
    if (acked && !test) window.setTimeout(onPrinted, LOG_SETTLE_MS);
  };

  const printLabel = chosen ? `Print ${labels(copies)} → ${chosen.thisComputer ? 'this computer' : chosen.stationName}` : `Print ${labels(copies)}`;
  const noticeTarget = motionTargetFor(PRINT_NOTICE_MOTION, phase);

  const previewRow =
    conditionDraft === (row.condition ?? '') && titleDraft === (row.title ?? '')
      ? row
      : { ...row, condition: conditionDraft, title: titleDraft };
  const saveTitle = async () => {
    const title = titleDraft.trim();
    if (title === (row.title ?? '')) return;
    try {
      await onSaveLabel({ title: title || null });
    } catch {
      setTitleDraft(row.title ?? '');
    }
  };
  const saveCondition = async () => {
    try {
      await onSaveLabel({ condition: conditionDraft || null });
    } catch {
      setConditionDraft(row.condition ?? '');
    }
  };
  const main = (
    <div className="flex min-w-0 flex-col gap-4">
      <FnskuLabelPreview row={previewRow} />

      <RecordGroup title="How many" testId="fnsku-record-copies">
        <QuantityPicker copies={copies} onCopies={setCopies} disabled={phase === 'sending'} />
      </RecordGroup>

      <RecordGroup title="Print at" testId="fnsku-record-stations">
        <StationPicker
          stations={stations.stations}
          chosenId={chosen?.stationId ?? null}
          onChoose={(id) => {
            setChosenId(id);
            if (phase !== 'sending') setPhase('idle');
          }}
          disabled={phase === 'sending'}
          canRename={(station) => station.thisComputer || stations.canRenameOthers}
          onRename={stations.rename}
        />
        <div className="flex flex-col items-end gap-2 border-t border-border-hairline px-4 py-3">
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              size="lg"
              radius="control"
              disabled={Boolean(blocked) || phase === 'sending'}
              onClick={() => void print({ test: true })}
              data-testid="fnsku-test-print"
            >
              Test print
            </Button>
            <MagneticActionField fieldClassName="self-end" disabled={Boolean(blocked) || phase === 'sending'} maxOffset={6} pull={0.12}>
              <Button
                variant="primary"
                size="lg"
                radius="control"
                icon={<Printer />}
                loading={phase === 'sending'}
                disabled={Boolean(blocked)}
                onClick={() => void print()}
                data-testid="fnsku-print"
              >
                {/* Content swap: the face never cross-fades two labels. */}
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={printLabel}
                    initial={reduce ? false : { opacity: 0, y: 3 }}
                    animate={{ opacity: 1, y: 0, transition: motionContentSwap.enter }}
                    exit={reduce ? { opacity: 0 } : { opacity: 0, y: -3, transition: motionContentSwap.exit }}
                    className="inline-block"
                  >
                    {printLabel}
                  </motion.span>
                </AnimatePresence>
              </Button>
            </MagneticActionField>
          </div>
          {blocked ? <p className="text-right text-role-caption text-text-warning">{chosen ? `${chosen.stationName}: ${blocked}.` : `${blocked}.`}</p> : null}
          <AnimatePresence initial={false}>
            {phase !== 'idle' ? (
              <motion.p
                key={phase}
                role="status"
                initial={reduce ? false : motionTargetFor(PRINT_NOTICE_MOTION, 'idle')}
                animate={noticeTarget}
                exit={reduce ? { opacity: 0 } : { opacity: 0, transition: motionContentSwap.exit }}
                transition={reduce ? PRINT_NOTICE_MOTION.reducedTransition : PRINT_NOTICE_MOTION.transition}
                className={cn(
                  'flex items-center justify-end gap-1.5 text-right text-role-caption',
                  phase === 'sent' ? 'text-text-success' : phase === 'failed' ? 'text-text-danger' : 'text-text-muted',
                )}
                data-testid="fnsku-print-notice"
              >
                {phase === 'sent' ? <Check className="size-3.5 shrink-0" /> : null}
                {notice}
              </motion.p>
            ) : null}
          </AnimatePresence>
        </div>
      </RecordGroup>
    </div>
  );

  const conditionDirty = conditionDraft !== (row.condition ?? '');
  const aside = (
    <div className="flex min-w-0 flex-col gap-4">
      <RecordGroup title="Label details" testId="fnsku-record-catalog">
        <div className={FACTS_BODY_CLASS}>
          <EvidenceFactRow label="FNSKU">
            <span className={RECORD_ID_CLASS}>{row.fnsku}</span>
          </EvidenceFactRow>
          <EvidenceFactRow label="Label" wide>
            <InlineEditableValue
              value={titleDraft}
              onChange={setTitleDraft}
              onSubmit={() => void saveTitle()}
              onCancel={() => setTitleDraft(row.title ?? '')}
              editable={!labelSaving}
              placeholder="No label in the catalog"
              ariaLabel="Edit FNSKU label"
              showEditIcon
            />
          </EvidenceFactRow>
          <EvidenceFactRow label="Condition" wide>
            <div className="flex flex-wrap items-center gap-2">
              <FnskuConditionPicker
                value={conditionDraft || null}
                onChange={setConditionDraft}
                disabled={labelSaving}
                testId="fnsku-record-condition"
              />
              <Button
                variant="primary"
                size="sm"
                radius="control"
                loading={labelSaving}
                disabled={!conditionDraft || !conditionDirty}
                onClick={() => void saveCondition()}
                data-testid="fnsku-condition-save"
              >
                Save
              </Button>
            </div>
          </EvidenceFactRow>
        </div>
      </RecordGroup>
    </div>
  );

  return (
    <div className={FNSKU_RECORD_ROOT_CLASS} data-testid="fnsku-print-evidence">
      <DeskRecordLayout main={main} aside={aside} />
    </div>
  );
}
