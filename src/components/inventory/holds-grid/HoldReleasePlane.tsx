'use client';

/**
 * Release plane for /inventory/holds — stage-overlay over the table
 * (Center-Lock L2, law Q5). The table stays mounted underneath, so an operator
 * can still read the unit they are about to put back on the floor.
 *
 * Callers: `HeldUnitsTable`, from the `release` row verb
 * (`admin-holds-verbs.ts`).
 *
 * ## Why a plane and not a cell
 *
 * The retired desk's seventh column WAS this form: a `<select
 * name="forceStatus">` beside a raw solid-green `<button>` annotated
 * `ds-raw-button`, submitting `releaseAction` with no confirmation at all. A
 * write whose payload takes a PARAMETER is a verb that opens a plane —
 * `CompoundRowAction` carries a fixed payload, and no family in this repo sets
 * `capabilities.inCellEdit`, so there is no in-cell editor on a compound row to
 * put a `<select>` into. The green button is gone; both controls are
 * `@/design-system/primitives` `Button`.
 *
 * ## Why the `<form>` is the footer
 *
 * The write stays a SERVER ACTION. `releaseAction` re-gates
 * `sku_stock.adjust`, re-resolves the unit against the caller's org and
 * `revalidatePath`s the desk — none of which a client fetch to a new endpoint
 * would inherit, and a second entrypoint for a write that already has one is
 * the fork this port exists to remove. So the RSC page hands the action down as
 * a prop and this form posts to it.
 *
 * It is the footer rather than the body because the submit button must live
 * INSIDE the form that carries the override control: the overlay's `footer` is
 * a sibling of `children`, so a submit in one and a `<select>` in the other
 * could only be joined by `form="id"` — and a button outside its form cannot
 * read {@link useFormStatus}, which is what stops a double release while the
 * action is in flight.
 *
 * The plane asks ONE question, the one the retired cell asked: which lifecycle
 * state this unit goes back to. `releaseAction` also reads a `reason`, and the
 * retired cell never sent one — a release-reason input would be a new feature,
 * so it is not invented here.
 */

import { useFormStatus } from 'react-dom';
import { Button } from '@/design-system/primitives/Button';
import { DeskStageOverlay } from '@/design-system/components/DeskStageOverlay';
import {
  HOLD_RESTORE_OPTIONS,
  holdRestoreStatus,
  type HeldUnitRow,
} from '@/lib/inventory/held-unit-row';

export interface HoldReleasePlaneProps {
  row: HeldUnitRow | null;
  onClose: () => void;
  /** The page's `releaseAction` server action, handed across the RSC boundary. */
  action: (formData: FormData) => void | Promise<void>;
}

/**
 * The form's own controls — a child of the `<form>` so it can read the
 * submission's pending state. A release is not idempotent from the operator's
 * side (the second submit finds nothing on hold and returns silently), but a
 * live button after a click reads as a failed one.
 */
function HoldReleaseControls({ onClose }: { onClose: () => void }) {
  const { pending } = useFormStatus();
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <label
          htmlFor="hold-release-force-status"
          className="block text-xs font-medium text-text-muted"
        >
          Restore to
        </label>
        <select
          id="hold-release-force-status"
          name="forceStatus"
          defaultValue=""
          disabled={pending}
          className="mt-1 rounded border border-border-default px-2 py-1 text-xs"
        >
          {HOLD_RESTORE_OPTIONS.map((status) => (
            <option key={status || 'auto'} value={status}>
              {status || 'auto'}
            </option>
          ))}
        </select>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" size="sm" loading={pending} disabled={pending}>
          {pending ? 'Releasing…' : 'Release unit'}
        </Button>
      </div>
    </div>
  );
}

export function HoldReleasePlane({ row, onClose, action }: HoldReleasePlaneProps) {
  const serial = row ? row.serial_number.trim() || `Unit #${row.id}` : null;
  const restore = row ? holdRestoreStatus(row) : null;
  const reason = row ? (row.hold_reason?.trim() || null) : null;

  return (
    <DeskStageOverlay
      open={row != null}
      onClose={onClose}
      title={serial ? `Release · ${serial}` : 'Release unit'}
      subtitle={row ? [`#${row.id}`, row.sku, reason].filter(Boolean).join(' · ') : undefined}
      testId="hold-release-plane"
      fill="inset"
      footer={
        row ? (
          <form action={action}>
            <input type="hidden" name="serialUnitId" value={row.id} />
            <HoldReleaseControls onClose={onClose} />
          </form>
        ) : null
      }
    >
      <div className="space-y-3 px-4 py-4 text-sm text-text-default">
        <p>
          The unit leaves quarantine and goes back into the flow at{' '}
          <span className="font-mono text-xs">{restore ?? '—'}</span>
          {row?.restore_status
            ? ', the state it was in when it was held.'
            : '. Nothing was recorded on the hold, so this is the default.'}
        </p>
        <p className="text-text-soft">
          Pick a different state under <span className="font-medium">Restore to</span> to override
          that — <span className="font-mono text-xs">auto</span> keeps the recovered one. Releasing
          writes a RELEASED_HOLD event; holding it again is one form away on this page.
        </p>
      </div>
    </DeskStageOverlay>
  );
}
