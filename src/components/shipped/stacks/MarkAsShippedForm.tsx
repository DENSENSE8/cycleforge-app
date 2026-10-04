'use client';

import { useRef, useState } from 'react';
import { getStaffName } from '@/utils/staff';
import { Button } from '@/design-system/primitives';
import { FILTER_DROPDOWN_LABEL_CLASS } from '@/design-system/components/FilterDropdownSelect';
import { DateTimePickerField } from '@/design-system/components/DateTimePickerField';
import { StaffAvatar } from '@/components/identity';
import { StageStaffAssignPopover } from '@/components/staff-assign/StageStaffAssignPopover';
import type { StaffRecipient } from '@/lib/staff/staff-recipient';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { sendWithBuyerNoteAck } from '@/lib/orders/buyer-note-ack-client';

interface MarkAsShippedFormProps {
  shippingTrackingNumber: string;
  packerOptions: StaffRecipient[];
  onSuccess: () => void;
  onError?: (msg: string) => void;
}

export function MarkAsShippedForm({
  shippingTrackingNumber,
  packerOptions,
  onSuccess,
}: MarkAsShippedFormProps) {
  const [selectedPackerId, setSelectedPackerId] = useState<number | null>(null);
  const [packedAt, setPackedAt] = useState<Date | undefined>(() => new Date());
  const [isMarkingShipped, setIsMarkingShipped] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [packerOpen, setPackerOpen] = useState(false);
  const packerRef = useRef<HTMLButtonElement>(null);

  const handleConfirm = async () => {
    setError(null);
    const trackingNumber = String(shippingTrackingNumber || '').trim();
    if (!trackingNumber) { setError('Tracking number is required before marking as shipped.'); return; }
    if (!selectedPackerId) { setError('Select a packer.'); return; }
    const packedDate = packedAt;
    if (!packedDate || Number.isNaN(packedDate.getTime())) { setError('Provide a valid date and time.'); return; }

    setIsMarkingShipped(true);
    try {
      // Same pack write as the station scan, so the same buyer-note hold.
      const response = await sendWithBuyerNoteAck(() => {
        const idempotencyKey = safeRandomUUID();
        return fetch('/api/packing-logs', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
          },
          body: JSON.stringify({
            trackingNumber,
            photos: [],
            packerId: selectedPackerId,
            timestamp: packedDate.toISOString(),
            packerName: getStaffName(selectedPackerId),
            idempotencyKey,
          }),
        });
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) throw new Error(data?.error || 'Failed to mark order as shipped.');
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark order as shipped.');
    } finally {
      setIsMarkingShipped(false);
    }
  };

  const packerName =
    selectedPackerId != null
      ? packerOptions.find((p) => p.id === selectedPackerId)?.name ?? getStaffName(selectedPackerId)
      : '';

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 space-y-2.5">
      <div>
        <span className={FILTER_DROPDOWN_LABEL_CLASS}>Packer</span>
        <Button
          ref={packerRef}
          type="button"
          variant="secondary"
          size="sm"
          className="w-full justify-start"
          aria-haspopup="listbox"
          aria-expanded={packerOpen}
          ariaLabel="Select packer"
          onClick={() => setPackerOpen(true)}
        >
          {selectedPackerId != null ? (
            <span className="flex min-w-0 items-center gap-2">
              <StaffAvatar staffId={selectedPackerId} name={packerName} size="sm" colorRing alt="" />
              <span className="truncate">{packerName}</span>
            </span>
          ) : packerOptions.length ? (
            'Select a packer…'
          ) : (
            'No staff available'
          )}
        </Button>
        <StageStaffAssignPopover
          open={packerOpen}
          onClose={() => setPackerOpen(false)}
          anchorRef={packerRef}
          label="Select packer"
          role="packer"
          selectedStaffId={selectedPackerId}
          onCommit={(staffId) => setSelectedPackerId(staffId)}
        />
      </div>

      <div>
        <span className={FILTER_DROPDOWN_LABEL_CLASS}>Date &amp; Time</span>
        <DateTimePickerField
          value={packedAt}
          onChange={setPackedAt}
          tone="emerald"
          placeholder="Pick a date & time"
        />
      </div>

      <Button
        type="button"
        variant="primary"
        size="sm"
        onClick={handleConfirm}
        disabled={isMarkingShipped}
        className="w-full bg-emerald-600 hover:bg-emerald-700"
      >
        {isMarkingShipped ? 'Saving...' : 'Confirm Mark As Shipped'}
      </Button>

      {error && <p className="text-role-eyebrow text-text-danger">{error}</p>}
    </div>
  );
}
