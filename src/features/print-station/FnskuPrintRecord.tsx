'use client';

/**
 * One FNSKU on the Print station — read top to bottom as the job:
 *
 *   Label      the sticker exactly as the thermal head draws it
 *   How many   an exact count, 1–99 (one station job; the station prints N)
 *   Print at   every computer in the org — who is at it, online, label printer
 *   Print      "Print 3 labels → Packing bench": this computer prints here;
 *              any other station gets the `fnsku` job and prints silently
 * The aside carries only the label identity, title, and editable condition.
 * Condition edits redraw the preview immediately and persist only on Save.
 */

import { useEffect, useState } from 'react';
import { Check, Minus, Monitor, Plus, Printer, User } from '@/components/Icons';
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
import { Button, IconButton } from '@/design-system/primitives';
import { DeferredQtyInput } from '@/design-system/primitives/DeferredQtyInput';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { RECORD_ID_CLASS } from '@/design-system/tokens/industrial-record';
import { usePrintStations, type PrintStationEntry } from '@/hooks/usePrintStations';
import { useStaffNameMap } from '@/hooks/useStaffNameMap';
import { clampLabelCopies, MAX_LABEL_COPIES } from '@/lib/print/labelCopies';
import type { PrintStationFnskuRow } from '@/lib/print-station/fnsku';
import type { PrintStationFnskuPatch } from '@/lib/print-station/fnsku-client';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { cn } from '@/utils/_cn';
import { FnskuConditionPicker } from './FnskuConditionPicker';

const FACTS_BODY_CLASS = 'flex flex-col px-4 pb-1 [&>*:last-child]:border-b-0';

/** The record body on the triage stage canvas. */
export const FNSKU_RECORD_ROOT_CLASS = 'flex-1 bg-mode-canvas p-4 text-mode-ink';

/** One-tap counts — a sheet of 1, a small bundle, a case. The exact field takes anything else. */
const QUICK_COUNTS = [1, 2, 5, 10, 20] as const;

/** After a station acks, how long until its print log lands (it prints, then logs). */
const LOG_SETTLE_MS = 4_000;

const labels = (n: number) => `${n} ${n === 1 ? 'label' : 'labels'}`;


// ── Print state → motion ──────────────────────────────────────────────────────

type PrintPhase = 'idle' | 'sending' | 'sent' | 'failed';

/** Product state is the phase; the notice's travel is only its projection. */
const PRINT_NOTICE_MOTION = defineStateMotionContract<PrintPhase, { opacity: number; y: number }>({
  targets: {
    idle: { opacity: 0, y: 4 },
    sending: { opacity: 1, y: 0 },
    sent: { opacity: 1, y: 0 },
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
  return (
    <div className="flex flex-col gap-3 px-4 pb-4 pt-1">
      <div className="flex items-center gap-3">
        <IconButton
          icon={<Minus className="size-4" />}
          ariaLabel="One fewer label"
          size="md"
          radius="control"
          disabled={disabled || copies <= 1}
          onClick={() => set(copies - 1)}
          data-testid="fnsku-copies-minus"
        />
        <div className="flex min-w-24 flex-col items-center" aria-live="polite">
          <AnimatedStat value={copies} profile="scanQuantity" className="text-4xl font-semibold text-text-default" />
          <span className="text-role-caption text-text-muted">{copies === 1 ? 'label' : 'labels'}</span>
        </div>
        <IconButton
          icon={<Plus className="size-4" />}
          ariaLabel="One more label"
          size="md"
          radius="control"
          disabled={disabled || copies >= MAX_LABEL_COPIES}
          onClick={() => set(copies + 1)}
          data-testid="fnsku-copies-plus"
        />
        <label className="ml-auto flex items-center gap-2 text-role-caption text-text-muted">
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
      <div role="group" aria-label="Quick counts" className="flex flex-wrap gap-1.5">
        {QUICK_COUNTS.map((n) => {
          const on = n === copies;
          return (
            <button
              key={n}
              type="button"
              disabled={disabled}
              aria-pressed={on}
              onClick={() => set(n)}
              className={cn(
                'relative h-8 min-w-10 rounded-mode-control px-3 text-sm font-semibold tabular-nums transition-colors',
                on ? 'text-text-default' : 'text-text-muted hover:bg-surface-sunken',
                focusRing('control'),
              )}
              data-testid={`fnsku-copies-quick-${n}`}
            >
              {/* One lit plate glides between counts — the choice, not five buttons, moves. */}
              {on ? <motion.span layoutId="fnsku-quick-count" className="absolute inset-0 rounded-mode-control bg-surface-sunken ring-1 ring-inset ring-border-strong" transition={{ type: 'spring', stiffness: 520, damping: 38 }} /> : null}
              <span className="relative">{n}</span>
            </button>
          );
        })}
      </div>
      <p className="text-role-caption text-text-muted">Up to {MAX_LABEL_COPIES} in one job.</p>
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
}: {
  stations: readonly PrintStationEntry[];
  chosenId: string | null;
  onChoose: (id: string) => void;
  disabled: boolean;
}) {
  const { getStaffName } = useStaffNameMap();
  const reduce = useReducedMotion();
  if (stations.length === 0) {
    return <p className="px-4 pb-4 text-role-caption text-text-muted">Looking for print stations…</p>;
  }
  return (
    <ul role="radiogroup" aria-label="Print at" className="flex flex-col gap-1 px-2 pb-2" data-testid="fnsku-stations">
      {stations.map((station, index) => {
        const blocked = stationBlocked(station);
        const chosen = station.stationId === chosenId;
        const who = station.lastSeenStaffId ? getStaffName(station.lastSeenStaffId) : null;
        return (
          <motion.li
            key={station.stationId}
            initial={reduce ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduce ? { duration: 0 } : { ...motionContentSwap.enter, delay: Math.min(index, 8) * 0.025 }}
          >
            <button
              type="button"
              role="radio"
              aria-checked={chosen}
              disabled={disabled || blocked != null}
              onClick={() => onChoose(station.stationId)}
              className={cn(
                'relative flex w-full min-w-0 items-center gap-3 rounded-mode-control px-3 py-2.5 text-left transition-colors',
                blocked ? 'cursor-not-allowed opacity-60' : chosen ? '' : 'hover:bg-surface-sunken',
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
              <span className="relative flex size-8 shrink-0 items-center justify-center rounded-mode-control bg-surface-card ring-1 ring-inset ring-border-hairline">
                <Monitor className="size-4 text-text-muted" />
                {/* Live dot: the station's heartbeat, not decoration. */}
                <span
                  aria-hidden
                  className={cn('absolute -right-0.5 -top-0.5 size-2.5 rounded-full ring-2 ring-surface-card', station.live ? 'bg-fill-success' : 'bg-text-faint')}
                />
              </span>
              <span className="relative min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-semibold text-text-default">{station.stationName}</span>
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
                  <span className={cn('truncate', blocked && 'text-text-warning')}>
                    {blocked ?? (station.label.printer ? station.label.printer : station.thisComputer ? 'Prints here' : 'Label printer ready')}
                  </span>
                </span>
              </span>
              {chosen ? <Check className="relative size-4 shrink-0 text-text-info" /> : null}
            </button>
          </motion.li>
        );
      })}
    </ul>
  );
}

function SelectedStationName({
  station,
  canRename,
  disabled,
  onRename,
}: {
  station: PrintStationEntry;
  canRename: boolean;
  disabled: boolean;
  onRename: (stationId: string, name: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(station.stationName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    const name = draft.trim();
    if (saving || name === station.stationName) return;
    setSaving(true);
    setError(null);
    try {
      await onRename(station.stationId, name);
    } catch (failure) {
      setDraft(station.stationName);
      setError(failure instanceof Error ? failure.message : 'The station name was not saved.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="border-t border-border-hairline px-4 py-3" data-testid="fnsku-selected-station-name">
      <p className="mode-label mb-1 text-mode-muted">Station name</p>
      <InlineEditableValue
        value={draft}
        onChange={setDraft}
        onSubmit={() => void save()}
        editable={canRename && !disabled && !saving}
        ariaLabel="Edit print station name"
      />
      {error ? <p className="mt-1 text-role-caption text-text-danger">{error}</p> : null}
    </div>
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

  const print = async () => {
    if (!chosen || blocked) return;
    const count = clampLabelCopies(copies);
    setPhase('sending');
    setNotice(chosen.thisComputer ? `Printing ${labels(count)} here…` : `Sending ${labels(count)} to ${chosen.stationName}…`);
    if (chosen.thisComputer) {
      // This computer: the same station-side job, run here (prints silently when set up, else the dialog; logs the reprint).
      const { printFnskuStationJob } = await import('@/lib/print/printFnskuStationJob');
      const failure = await printFnskuStationJob({ fnsku: row.fnsku, copies: count }, safeRandomUUID()).catch((error: unknown) =>
        error instanceof Error ? error.message : 'The label did not print.',
      );
      setPhase(failure ? 'failed' : 'sent');
      setNotice(failure ?? `Printed ${labels(count)} of ${row.fnsku} here.`);
      if (!failure) onPrinted();
      return;
    }
    const acked = await stations.sendFnsku(chosen.stationId, row.fnsku, count);
    setPhase(acked ? 'sent' : 'failed');
    setNotice(
      acked
        ? `${chosen.stationName} is printing ${labels(count)} of ${row.fnsku}.`
        : `${chosen.stationName} did not answer — is CycleForge open there? Nothing was printed.`,
    );
    // The station prints, then logs; the list re-reads once that log has had time to land.
    if (acked) window.setTimeout(onPrinted, LOG_SETTLE_MS);
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
        />
        {chosen ? (
          <SelectedStationName
            key={chosen.stationId}
            station={chosen}
            canRename={chosen.thisComputer || stations.canRenameOthers}
            disabled={phase === 'sending'}
            onRename={stations.rename}
          />
        ) : null}
        <div className="flex flex-col items-end gap-2 border-t border-border-hairline px-4 py-3">
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
    <div className={FNSKU_RECORD_ROOT_CLASS} data-testid="fnsku-print-evidence" data-record-presentation="fnsku">
      <DeskRecordLayout main={main} aside={aside} />
    </div>
  );
}
