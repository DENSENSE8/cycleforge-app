'use client';

/**
 * One FNSKU on the Print station — read top to bottom as the job:
 *
 *   Label      the sticker exactly as the thermal head draws it
 *   How many   a snapped common-run slider on the staffer's scale (20 · 30 · 99,
 *              `fnskuCopyRange`) plus always-visible exact entry; directly
 *              under it the Print CTA, "Print 3 labels → Packing bench", with
 *              Test print beside it and the status line below: this computer
 *              prints here; any other station gets the `fnsku` job and prints
 *              silently. "Test print" sends the same run the same way, the
 *              same face, and never logs a reprint.
 *   Print at   the shared `StationPicker`: live stations + the org default, offline behind a disclosure
 * The aside carries only the label identity, title, and editable condition.
 * Condition edits redraw the preview immediately and persist only on Save.
 */

import { useEffect, useState } from 'react';
import { Check, Printer } from '@/components/Icons';
import { DeskRecordLayout, deskRecordBesideList, useDeskRecordView } from '@/design-system/components/DeskRecordPlane';
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
import { RECORD_ID_CLASS } from '@/design-system/tokens/record';
import { usePrintStations } from '@/hooks/usePrintStations';
import { clampLabelCopies } from '@/lib/print/labelCopies';
import { fnskuLabelGlance } from '@/lib/print/fnskuLabelGlance';
import { fnskuConditionMissing, fnskuConditionRequiredMessage, type PrintStationFnskuRow } from '@/lib/print-station/fnsku';
import type { PrintStationFnskuPatch } from '@/lib/print-station/fnsku-client';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { cn } from '@/utils/_cn';
import { QuantityPicker } from './FnskuQuantityPicker';
import { FnskuConditionPicker } from './FnskuConditionPicker';
import { StationPicker, resolvePrintStation, stationBlocked } from './StationPicker';

const FACTS_BODY_CLASS = 'flex flex-col px-4 pb-1 [&>*:last-child]:border-b-0';

/** The record body on the triage stage canvas. */
export const FNSKU_RECORD_ROOT_CLASS = 'flex-1 bg-mode-canvas p-4 text-mode-ink';

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
      .then(({ fnskuLabelPreviewUrl }) =>
        fnskuLabelPreviewUrl({ fnsku: row.fnsku, title: row.title ?? '', condition: row.condition ?? '', mark: row.mark }),
      )
      .then(
        (url) => live && setSrc(url),
        (error: unknown) => live && setFailure(error instanceof Error ? error.message : 'Could not draw the label.'),
      );
    return () => {
      live = false;
    };
  }, [row.fnsku, row.title, row.condition, row.mark]);

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
  const split = deskRecordBesideList(useDeskRecordView());
  const [copies, setCopies] = useState(1);
  const [conditionDraft, setConditionDraft] = useState(row.condition ?? '');
  const [titleDraft, setTitleDraft] = useState(row.title ?? '');
  // null = print the color or series read from the title. A string is the saved corner.
  const [markOverride, setMarkOverride] = useState<string | null>(row.mark ?? null);
  useEffect(() => {
    setMarkOverride(row.mark ?? null);
  }, [row.fnsku, row.mark]);
  // The target for THIS reprint — seeded from the staffer's label station, never written back
  // (sending one sticker to a packer's table must not move the manager's own default).
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [phase, setPhase] = useState<PrintPhase>('idle');
  const [notice, setNotice] = useState('');

  const chosen = resolvePrintStation(stations, chosenId);
  const needsCondition = fnskuConditionMissing(row.condition);
  const blocked = needsCondition
    ? fnskuConditionRequiredMessage(row.fnsku)
    : chosen
      ? stationBlocked(chosen)
      : 'Choose a print station';

  const print = async ({ test = false }: { test?: boolean } = {}) => {
    if (!chosen || blocked || needsCondition) return;
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
    const reason = await stations.sendFnsku(chosen.stationId, row.fnsku, count, { test });
    setPhase(reason ? 'failed' : 'sent');
    setNotice(reason ?? `${chosen.stationName} is printing ${run} of ${row.fnsku}.`);
    // The station prints, then logs; the list re-reads once that log has had time to land.
    if (!reason && !test) window.setTimeout(onPrinted, LOG_SETTLE_MS);
  };

  const printLabel = chosen ? `Print ${labels(copies)} → ${chosen.thisComputer ? 'this computer' : chosen.stationName}` : `Print ${labels(copies)}`;
  const noticeTarget = motionTargetFor(PRINT_NOTICE_MOTION, phase);

  const derivedMark = fnskuLabelGlance(titleDraft);
  const previewRow = { ...row, condition: conditionDraft, title: titleDraft, mark: markOverride };
  const saveTitle = async () => {
    const title = titleDraft.trim();
    if (title === (row.title ?? '')) return;
    try {
      await onSaveLabel({ title: title || null });
    } catch {
      setTitleDraft(row.title ?? '');
    }
  };
  const saveMark = async () => {
    const stored = markOverride == null ? null : markOverride.trim().slice(0, 40) || null;
    if (stored === (row.mark ?? null)) return;
    try {
      await onSaveLabel({ mark: stored });
    } catch {
      setMarkOverride(row.mark ?? null);
    }
  };
  const saveCondition = async () => {
    try {
      await onSaveLabel({ condition: conditionDraft || null });
    } catch {
      setConditionDraft(row.condition ?? '');
    }
  };
  const conditionDirty = conditionDraft !== (row.condition ?? '');
  const details = (
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
          <EvidenceFactRow label="Bottom right" wide>
            <InlineEditableValue
              value={markOverride ?? derivedMark}
              onChange={setMarkOverride}
              onSubmit={() => void saveMark()}
              onCancel={() => setMarkOverride(row.mark ?? null)}
              editable={!labelSaving}
              placeholder="Color or series"
              ariaLabel="Edit label bottom right"
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

  const main = (
    <div className="flex min-w-0 flex-col gap-4">
      <FnskuLabelPreview row={previewRow} />
      {split ? details : null}

      <RecordGroup title="How many" testId="fnsku-record-copies">
        <QuantityPicker copies={copies} onCopies={setCopies} disabled={phase === 'sending'} />
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
          {needsCondition ? <p className="text-right text-role-caption text-text-warning">{fnskuConditionRequiredMessage(row.fnsku)}</p> : null}
          {!needsCondition && blocked ? <p className="text-right text-role-caption text-text-warning">{chosen ? `${chosen.stationName}: ${blocked}.` : `${blocked}.`}</p> : null}
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

      <RecordGroup title="Print at" testId="fnsku-record-stations">
        <StationPicker
          port={stations}
          chosenId={chosen?.stationId ?? null}
          onChoose={(id) => {
            setChosenId(id);
            if (phase !== 'sending') setPhase('idle');
          }}
          disabled={phase === 'sending'}
        />
      </RecordGroup>
    </div>
  );

  return (
    <div className={FNSKU_RECORD_ROOT_CLASS} data-testid="fnsku-print-evidence">
      <DeskRecordLayout main={main} aside={split ? undefined : details} />
    </div>
  );
}
