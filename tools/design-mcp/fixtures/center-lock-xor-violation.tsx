'use client';

/** Planted Center Lock violation — new DeskRecordWalkHost mount. */
import { DeskRecordWalkHost } from '@/design-system/components/DeskRecordWalkHost';

export function CenterLockXorViolation() {
  return (
    <DeskRecordWalkHost railLabel="Queue" rail={<div />}>
      <div />
    </DeskRecordWalkHost>
  );
}
