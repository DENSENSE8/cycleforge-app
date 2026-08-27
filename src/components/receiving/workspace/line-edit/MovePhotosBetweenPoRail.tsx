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
 *
 * ## One band, one close (2026-08-21)
 *
 * The rail used to mount {@link MovePhotosBetweenPoPanel} with its default
 * `chrome='modal'`, which paints an icon + "Move photos" title row AND its own
 * `X` — a second dismiss one pixel from the host's singleton `X`, and a second
 * header line under a band the rail did not have. Both are gone: the band is
 * now {@link DeskInspectorIndexShell} in the `standalone` stance (this rail is
 * not routed through any index, so it owes no Back), and the body is mounted
 * with `chrome='display'` — the SAME prop Unbox Displays already passes to
 * strip that header, rather than deleting a header the other host needs.
 *
 * Consequence worth stating: `chrome='display'` also means a successful move
 * resets the form in place instead of self-dismissing. Dismissal is the host's
 * `X` (→ `closeRightPanel` → this registrar's `onClose`), which is the one
 * closer either way.
 */

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
