'use client';

/**
 * Bidirectional photo move between POs — opened from More Actions → Photos /
 * gallery "Move to another PO" on non-Unbox hosts (Testing, Triage, the photo
 * gallery, the peek fan). A NON-MODAL `RightRailHost` occupant
 * (`detail:move-photos`), not the centered `RightPaneOverlay` it used to be:
 * choosing the destination PO is done while looking at the photos, and a scrim
 * covered them.
 *
 * Unbox mounts the same body in Displays Photos→Move.
 */

import { DetailStackRailRegistrar } from '@/components/right-rail/DetailStackRailRegistrar';
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
      // Station edge: /unbox, /triage and /testing already push this edge with
      // `StationDisplaysPushColumn`, and two push mechanisms on one edge is exactly what
      // the right-rail store exists to prevent. Stays a float pending the
      // right-edge ownership ruling.
      push={false}
      onClose={onClose}
      modal={false}
      ariaLabel="Move photos between purchase orders"
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <MovePhotosBetweenPoPanel
          open
          receivingId={receivingId}
          onClose={onClose}
          onMoved={onMoved}
        />
      </div>
    </DetailStackRailRegistrar>
  );
}
