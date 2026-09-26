'use client';

/** Bidirectional photo move between POs — opened from More Actions → Photos / gallery "Move to another PO" on non-Unbox hosts (Testing,… */

import { DetailStackRailRegistrar } from '@/components/right-rail/DetailStackRailRegistrar';
import { DeskInspectorIndexShell } from '@/components/right-rail/DeskInspectorIndexShell';
import { MovePhotosBetweenPoPanel } from './MovePhotosBetweenPoPanel';

export function MovePhotosBetweenPoRail({
  open,
  receivingId,
  onClose,
  onMoved,
}: {
  open: boolean;
  receivingId: number | null;
  onClose: () => void;
  onMoved?: () => void;
}) {
  if (!open) return null;

  return (
    <DetailStackRailRegistrar
      id="detail:move-photos"
      // Station edge:
      push={false}
      onClose={onClose}
      modal={false}
      ariaLabel="Move photos between purchase orders"
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <DeskInspectorIndexShell
          // No index above this rail — it opens straight from a gallery action,
          // so there is nothing to go Back to and it says so rather than
          // painting a dead chevron.
          stance="standalone"
          title="Move photos"
          ariaLabel="Move photos between purchase orders"
          testId="move-photos-rail"
          body={
            <MovePhotosBetweenPoPanel
              open
              receivingId={receivingId}
              onClose={onClose}
              onMoved={onMoved}
              // Header + close come from the band above / the host, not the body.
              chrome="display"
            />
          }
        />
      </div>
    </DetailStackRailRegistrar>
  );
}
