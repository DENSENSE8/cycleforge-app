'use client';

/** Right-pane room form for /warehouse?tab=rooms. */

import { useRoomDetailForm } from './room-detail/useRoomDetailForm';
import { EmptyState } from './room-detail/RoomDetailPieces';
import { RoomEditForm } from './room-detail/RoomEditForm';

export function RoomDetailForm() {
  const c = useRoomDetailForm();

  // ── Empty state — no selection ─────────────────────────────────────────
  if (!c.selectedRoom && !c.creating) {
    return (
      <EmptyState
        loading={c.roomsLoading}
        roomCount={c.allRoomNames.length}
        onCreate={() => c.setParam((p) => p.set('new', '1'))}
      />
    );
  }

  // ── Edit / Create form ────────────────────────────────────────────────
  return <RoomEditForm c={c} />;
}
