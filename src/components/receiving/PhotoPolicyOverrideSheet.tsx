'use client';

/**
 * PhotoPolicyOverrideSheet — the conscious acknowledgement in front of a
 * receiving photo-policy waiver (WS-PHOTO §4).
 *
 * The gate is a SOFT block: an operator may receive a carton the evidence
 * policy blocked, but only by naming WHY from a closed vocabulary, and the
 * override is persisted as a `receiving_exceptions` row plus an audit entry.
 * This sheet is the whole ceremony:
 *
 * - It restates what is being waived (the gate's own blocker strings), so the
 *   operator overrides a specific, readable claim — never an abstract warning.
 * - The confirm action is **disabled until a reason is picked**. Nothing is
 *   pre-selected: a defaulted reason is a reason nobody read, which is exactly
 *   the silent bypass the soft block exists to avoid.
 * - There is **no free-text field**, here or anywhere on this path. The reason
 *   is a `PHOTO_WAIVED_*` code from the system registry; the server validates
 *   against the same list and assembles the persisted prose itself.
 *
 * One shell for both surfaces: `BottomSheet` renders as a floor sheet on the
 * phone and as a centered dialog on the desktop bench, so the Unbox bench and
 * `/m/r/[id]` share this component instead of forking a modal each.
 */

import { useMemo, useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { ReasonChipPicker } from '@/components/ui/ReasonChipPicker';
import { Button } from '@/design-system/primitives';
import { useReasonVocabulary } from '@/hooks/useReasonVocabulary';
import type { PhotoPolicyOverrideCode } from '@/lib/receiving/exception-codes';
import {
  PHOTO_POLICY_OVERRIDE_FLOW_CONTEXT,
  buildPhotoPolicyOverrideOptions,
  type PhotoPolicyOverrideOption,
} from '@/lib/receiving/photo-policy-override-wire';

/**
 * The pickable waiver reasons, tenant labels applied.
 *
 * Composes the house reason-vocabulary read (`useReasonVocabulary`) rather than
 * fetching `reason_codes` again — the same waist the repair failure vocabulary
 * uses. The registry, not the fetch, decides WHICH codes exist: the route
 * validates against `PHOTO_POLICY_OVERRIDE_CODES`, so an unseeded org and a
 * failed fetch both still render exactly the four options the server accepts.
 *
 * Module-local until a second surface genuinely needs the options without the
 * sheet — the knip gate treats a speculative export as new dead code.
 */
function usePhotoPolicyOverrideOptions(): PhotoPolicyOverrideOption[] {
  const rows = useReasonVocabulary(PHOTO_POLICY_OVERRIDE_FLOW_CONTEXT);
  return useMemo(() => buildPhotoPolicyOverrideOptions(rows), [rows]);
}

/** Module-local: no caller types this bag by name, and an unimported exported
 *  props interface is exactly the speculative export the knip gate rejects. */
interface PhotoPolicyOverrideSheetProps {
  open: boolean;
  onClose: () => void;
  /** The gate's blockers — what this waiver is overriding, verbatim. */
  blockers: readonly string[];
  /** Fires with the chosen code; the caller re-runs the receive with it. */
  onConfirm: (code: PhotoPolicyOverrideCode) => void;
  /** Stack above an already-open sheet (the phone's carton sheet). */
  level?: number;
  /** True while the re-run is in flight. */
  busy?: boolean;
}

export function PhotoPolicyOverrideSheet({
  open,
  onClose,
  blockers,
  onConfirm,
  level = 0,
  busy = false,
}: PhotoPolicyOverrideSheetProps) {
  const options = usePhotoPolicyOverrideOptions();
  const [code, setCode] = useState<PhotoPolicyOverrideCode | null>(null);

  const selected = options.find((o) => o.code === code) ?? null;

  const close = () => {
    setCode(null);
    onClose();
  };

  return (
    <BottomSheet
      open={open}
      onClose={close}
      title="Receive without the required photos?"
      dragDisabled
      level={level}
    >
      <div className="stack-section">
        <div className="rounded-xl bg-amber-50 inset-card ring-1 ring-inset ring-amber-200">
          <p className="text-role-eyebrow uppercase tracking-widest text-amber-700">
            Photo policy not met
          </p>
          <ul className="mt-1.5 space-y-1">
            {blockers.length > 0 ? (
              blockers.map((b) => (
                <li key={b} className="text-role-caption font-semibold text-amber-800">
                  {b}
                </li>
              ))
            ) : (
              <li className="text-role-caption font-semibold text-amber-800">
                This carton is missing the photos your org requires at receive.
              </li>
            )}
          </ul>
        </div>

        <div className="stack-tight">
          <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">
            Why are you receiving it anyway?
          </p>
          <ReasonChipPicker
            value={code}
            onChange={(next) => setCode(next as PhotoPolicyOverrideCode)}
            options={options.map((o) => ({ code: o.code, label: o.label, tone: 'warning' as const }))}
            ariaLabel="Photo policy override reason"
            size="touch"
          />
          {/* The description is the claim being made — show it only once the
              operator has chosen, so it reads as confirmation, not as a hint
              they can skim past. */}
          <p className="min-h-8 text-role-caption text-text-muted" aria-live="polite">
            {selected
              ? selected.description
              : 'Pick a reason to continue. It is recorded against this carton and shows on the exception list.'}
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
            {busy ? 'Receiving…' : 'Receive without photos'}
          </Button>
          <Button variant="ghost" size="lg" onClick={close} className="w-full sm:w-auto">
            Cancel
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
