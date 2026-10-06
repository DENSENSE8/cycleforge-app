'use client';

/**
 * Add tracking numbers to the order — as many as it has boxes: scan (or type
 * and Enter) one at a time through the V2 scan root, `MobileV2ScanInput`, or
 * paste a whole list (newlines, commas or spaces) and Add them all. The sheet
 * stays open for the next box; Done closes it.
 */

import { useState } from 'react';
import { Check, ClipboardPaste } from '@/components/Icons';
import { MobileV2ActionSheet } from '@/components/mobile/v2/MobileV2ActionSheet';
import { MobileV2ScanInput } from '@/components/mobile/v2/scan/MobileV2ScanInput';
import { TextField } from '@/design-system/primitives';
import { splitPastedList } from '@/lib/inbound/inbound-order-compose';

type TrackingVerb = 'paste' | 'done';

export function MobileV2InboundTrackingSheet({
  open,
  count,
  onAdd,
  onClose,
}: {
  open: boolean;
  /** Tracking numbers on the order so far. */
  count: number;
  onAdd: (numbers: string[]) => void;
  onClose: () => void;
}) {
  const [pasted, setPasted] = useState('');
  const listed = splitPastedList(pasted);
  return (
    <MobileV2ActionSheet
      open={open}
      onClose={onClose}
      eyebrow={count ? `${count} on the order` : undefined}
      title="Add tracking"
      description="Scan each box’s label, or paste the whole list."
      verbs={[
        {
          id: 'paste',
          label: listed.length > 1 ? `Add ${listed.length}` : 'Add pasted',
          icon: <ClipboardPaste />,
          disabled: listed.length === 0,
          testId: 'm-inbound-tracking-add-pasted',
        },
        { id: 'done', label: 'Done', icon: <Check />, primary: true, testId: 'm-inbound-tracking-done' },
      ]}
      onVerb={(verb: TrackingVerb) => {
        if (verb === 'done') return onClose();
        onAdd(listed);
        setPasted('');
      }}
      dockLabel="Tracking actions"
      testId="m-inbound-tracking-sheet"
    >
      <div className="flex flex-col gap-3 px-mode-page py-3">
        <MobileV2ScanInput
          compact
          autoFocus
          prominentCamera
          cameraSuspended={!open}
          placeholder="Tracking number"
          onDecode={(value) => onAdd(splitPastedList(value))}
        />
        <TextField
          label="Or paste many tracking numbers"
          value={pasted}
          multiline
          rows={4}
          mono
          onChange={setPasted}
          data-testid="m-inbound-tracking-paste"
        />
      </div>
    </MobileV2ActionSheet>
  );
}
