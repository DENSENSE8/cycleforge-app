'use client';

/**
 * ReceivingQaFailSheet — naming WHY a carton failed QA, before it is returned.
 *
 * Replaces the ConfirmSheet that used to front this action. That sheet said "use
 * the note field below to capture the reason" and had no note field: the reason
 * was initialised to `''`, never edited, and posted to `mark-received` as `notes`
 * — the operator's ITEM note. So the copy promised a reason nobody could give,
 * and the wiring behind it, had anyone finished it, would have overwritten the
 * desktop operator's note on every line in the carton
 * (`.claude/rules/source-of-truth.md` → Note vs label grain).
 *
 * The reason is now a code from the system registry's QA-fail slice, which:
 *   - lands in `receiving_exceptions` (queryable, OPEN/RESOLVED, reversible),
 *     never in a prose field;
 *   - DECIDES the `qa_status` the receive writes. The old path hardcoded
 *     FAILED_FUNCTIONAL for every fail, so the column built to tell a dead unit
 *     from a damaged one could not.
 *
 * Same ceremony and the same shell as its sibling {@link PhotoPolicyOverrideSheet}:
 * nothing pre-selected (a defaulted reason is a reason nobody read), confirm
 * disabled until the operator picks, no free-text sibling field, and one
 * `BottomSheet` that renders as a floor sheet on the phone and a centered dialog
 * on the desk.
 */

import { useMemo, useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { ReasonChipPicker } from '@/components/ui/ReasonChipPicker';
import { Button } from '@/design-system/primitives';
import { useReasonVocabulary } from '@/hooks/useReasonVocabulary';
import type { QaFailExceptionCode } from '@/lib/receiving/exception-codes';
import {
  QA_FAIL_REASON_FLOW_CONTEXT,
  buildQaFailReasonOptions,
  type QaFailReasonOption,
} from '@/lib/receiving/qa-fail-reason-wire';

/**
 * The pickable fail reasons, tenant labels applied. Module-local until a second
 * surface genuinely needs the options without the sheet — the knip gate treats a
 * speculative export as new dead code.
 */
function useQaFailReasonOptions(): QaFailReasonOption[] {
  const rows = useReasonVocabulary(QA_FAIL_REASON_FLOW_CONTEXT);
  return useMemo(() => buildQaFailReasonOptions(rows), [rows]);
}

/** Module-local: no caller types this bag by name. */
interface ReceivingQaFailSheetProps {
  open: boolean;
  onClose: () => void;
  /** How many lines the verdict covers — the sheet states the blast radius. */
  lineCount: number;
  /** Fires with the chosen code; the caller runs the receive with it. */
  onConfirm: (code: QaFailExceptionCode) => void;
  /** Stack above an already-open sheet (the phone's carton sheet). */
  level?: number;
  /** True while the receive is in flight. */
  busy?: boolean;
}

export function ReceivingQaFailSheet({
  open,
  onClose,
  lineCount,
  onConfirm,
  level = 0,
  busy = false,
}: ReceivingQaFailSheetProps) {
  const options = useQaFailReasonOptions();
  const [code, setCode] = useState<QaFailExceptionCode | null>(null);

  const selected = options.find((o) => o.code === code) ?? null;

  const close = () => {
    setCode(null);
    onClose();
  };

  return (
    <BottomSheet
      open={open}
      onClose={close}
      title={`Mark ${lineCount} line${lineCount === 1 ? '' : 's'} FAILED — return`}
      dragDisabled
      level={level}
    >
      <div className="stack-section">
        <p className="text-role-caption text-text-muted">
          Every line on this carton is marked tested-FAIL with disposition RTV (return to
          vendor). Cannot be undone from this screen.
        </p>

        <div className="stack-tight">
          <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">
            What is wrong with it?
          </p>
          <ReasonChipPicker
            value={code}
            onChange={(next) => setCode(next as QaFailExceptionCode)}
            options={options.map((o) => ({ code: o.code, label: o.label, tone: 'danger' as const }))}
            ariaLabel="QA fail reason"
            size="touch"
          />
          {/* The description is the claim being made — shown only once the
              operator has chosen, so it reads as confirmation rather than a hint
              they can skim past. */}
          <p className="min-h-8 text-role-caption text-text-muted" aria-live="polite">
            {selected
              ? selected.description
              : 'Pick a reason to continue. It is recorded against each line and shows on the exception list.'}
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <Button
            variant="danger"
            size="lg"
            disabled={!code || busy}
            onClick={() => code && onConfirm(code)}
            className="w-full sm:w-auto"
          >
            {busy ? 'Working…' : 'Yes, return all'}
          </Button>
          <Button variant="ghost" size="lg" onClick={close} className="w-full sm:w-auto">
            Cancel
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
