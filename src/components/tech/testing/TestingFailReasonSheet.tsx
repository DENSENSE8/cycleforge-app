'use client';

/**
 * @domain-job Name WHAT IS WRONG with a unit before its TESTING_FAILED verdict
 *   is recorded at the Testing bench.
 * @hardware-target Station
 * @density floor
 * @justification The direct sibling of `ReceivingQaFailSheet` — same ceremony
 *   (nothing pre-selected, confirm disabled until picked, no free-text sibling,
 *   one `BottomSheet` that is a floor sheet on the phone and a dialog on the
 *   desk) and the same shared picker underneath. It is a SIBLING and not a reuse
 *   because the vocabularies are genuinely different jobs: Unbox's QA fail picks
 *   a `reason_codes` exception that decides the carton's `qa_status`; a bench
 *   fail picks a `failure_modes` row that lands in `unit_failure_tags`, carries
 *   severity / repairability / a grade cap, is reversible, and feeds
 *   `recomputeUnitQuality`. Merging them would force one vocabulary to answer
 *   two questions.
 *
 * Until 2026-08-19 a bench fail asked for nothing at all: the verdict wrote
 * free-text `notes` and an `entity_signals` row with no code, so the column
 * built to tell a dead unit from a scratched one could not — the exact defect
 * `ReceivingQaFailSheet` was written to fix on the Unbox side.
 */

import { useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { ReasonChipPicker } from '@/components/ui/ReasonChipPicker';
import { Button } from '@/design-system/primitives';
import { useFailureModes, failureModeTone } from '@/hooks/useFailureModes';

interface TestingFailReasonSheetProps {
  open: boolean;
  onClose: () => void;
  /** Serial of the unit being failed — states the blast radius. */
  unitLabel: string;
  /** Fires with the chosen failure-mode id; the caller records the verdict. */
  onConfirm: (failureModeId: number) => void;
  busy?: boolean;
}

export function TestingFailReasonSheet({
  open,
  onClose,
  unitLabel,
  onConfirm,
  busy = false,
}: TestingFailReasonSheetProps) {
  const modes = useFailureModes();
  const [modeId, setModeId] = useState<number | null>(null);

  const options = (modes ?? []).map((m) => ({
    code: String(m.id),
    label: m.label,
    tone: failureModeTone(m.severity),
  }));
  const selected = (modes ?? []).find((m) => m.id === modeId) ?? null;

  const close = () => {
    setModeId(null);
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={close} title={`Fail ${unitLabel}`} dragDisabled>
      <div className="stack-section">
        <p className="text-role-caption text-text-muted">
          The unit goes ON HOLD and the fault is tagged against it. A later PASS on
          the same fault resolves the tag, so this is reversible.
        </p>

        <div className="stack-tight">
          <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">
            What is wrong with it?
          </p>
          {modes != null && options.length === 0 ? (
            <p className="text-role-caption font-semibold text-amber-700">
              No failure modes are set up for this workspace yet — an admin adds them
              under Admin → Failure modes.
            </p>
          ) : (
            <ReasonChipPicker
              value={modeId == null ? null : String(modeId)}
              onChange={(next) => setModeId(Number(next))}
              options={options}
              ariaLabel="Failure mode"
              size="touch"
            />
          )}
          {/* Shown only once chosen, so it reads as confirmation of the claim
              being made rather than a hint the operator skims past. */}
          <p className="min-h-8 text-role-caption text-text-muted" aria-live="polite">
            {selected
              ? `${selected.severity}${selected.category ? ` · ${selected.category}` : ''}${
                  selected.is_repairable === false ? ' · not repairable' : ''
                }`
              : 'Pick a fault to continue. It is tagged on the unit and shows on its quality record.'}
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <Button
            variant="danger"
            size="lg"
            disabled={modeId == null || busy}
            onClick={() => modeId != null && onConfirm(modeId)}
            className="w-full sm:w-auto"
          >
            {busy ? 'Working…' : 'Fail this unit'}
          </Button>
          <Button variant="ghost" size="lg" onClick={close} className="w-full sm:w-auto">
            Cancel
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
