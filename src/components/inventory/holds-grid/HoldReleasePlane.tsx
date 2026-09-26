'use client';

/** Release plane for /inventory/holds — stage-overlay over the table (Center-Lock L2, law Q5). */

import { useFormStatus } from 'react-dom';
import { Button } from '@/design-system/primitives/Button';
import { DeskStageOverlay } from '@/design-system/components/DeskStageOverlay';
import {
  HOLD_RESTORE_OPTIONS,
  holdRestoreStatus,
  type HeldUnitRow,
} from '@/lib/inventory/held-unit-row';

interface HoldReleasePlaneProps {
  row: HeldUnitRow | null;
  onClose: () => void;
  /** The page's `releaseAction` server action, handed across the RSC boundary. */
  action: (formData: FormData) => void | Promise<void>;
}

/** The form's own controls — a child of the `<form>` so it can read the submission's pending state. */
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
