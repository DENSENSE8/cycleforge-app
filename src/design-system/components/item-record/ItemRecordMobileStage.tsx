'use client';

import { StaffAvatar } from '@/components/identity/StaffAvatar';
import { cornerClass } from '@/design-system/tokens/radius';
import {
  ITEM_RECORD_MOBILE_STAGE,
  ITEM_RECORD_MOBILE_STAGE_VERBS,
} from '@/design-system/tokens/item-record-mobile';
import { cn } from '@/utils/_cn';

type ItemRecordMobileStageSlot = {
  staffId: number | null;
  name: string | null;
  /** Assigned `staff.color_hex`. Fill is the identity channel — never a photo. */
  colorHex: string | null;
};

function StageMark({
  slot,
  verb,
  testId,
}: {
  slot: ItemRecordMobileStageSlot;
  verb: string;
  testId: string;
}) {
  const assigned = slot.staffId != null || Boolean(slot.name);
  return (
    <span
      data-testid={testId}
      className={ITEM_RECORD_MOBILE_STAGE.mark}
      aria-label={assigned && slot.name ? `${verb} ${slot.name}` : `${verb} unassigned`}
    >
      {assigned ? (
        <StaffAvatar
          staffId={slot.staffId}
          name={slot.name}
          colorHex={slot.colorHex}
          avatarPhotoId={null}
          size="xs"
          alt={slot.name ?? undefined}
        />
      ) : (
        <span aria-hidden className={cn(ITEM_RECORD_MOBILE_STAGE.empty, cornerClass('pill'))} />
      )}
      <span className={ITEM_RECORD_MOBILE_STAGE.verb}>{verb}</span>
    </span>
  );
}

/**
 * Phone Pick / Packed marks — staff colour + catalog verb. The person's name
 * belongs on the order sheet, not this row.
 */
function ItemRecordMobileStage({
  pick,
  packed,
  className,
}: {
  pick: ItemRecordMobileStageSlot;
  packed: ItemRecordMobileStageSlot;
  className?: string;
}) {
  return (
    <div
      data-item-record-mobile-stage
      className={cn(ITEM_RECORD_MOBILE_STAGE.cluster, className)}
      aria-label={[
        pick.name ? `Pick ${pick.name}` : 'Pick unassigned',
        packed.name ? `Packed ${packed.name}` : 'Packed unassigned',
      ].join(', ')}
    >
      <StageMark
        slot={pick}
        verb={ITEM_RECORD_MOBILE_STAGE_VERBS.pick}
        testId="to-ship-picker"
      />
      <StageMark
        slot={packed}
        verb={ITEM_RECORD_MOBILE_STAGE_VERBS.packed}
        testId="to-ship-packer"
      />
    </div>
  );
}
