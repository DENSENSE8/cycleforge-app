'use client';

import { Check } from '@/components/Icons';
import { DetailNav } from '@/components/mobile/detail/DetailParts';
import { EmptyState } from '@/design-system/primitives/EmptyState';
import { ZoneLetterTile } from './ZoneLetterTile';

/** The zone step: every room as one full-width row (zone letter · name), in room order. Rooms are added on the desk's Rooms tab. */
export function RoomPicker({
  rooms,
  zoneMap,
  loading,
  selectedRoom,
  onSelect,
}: {
  rooms: readonly string[];
  zoneMap: Readonly<Record<string, string>>;
  loading: boolean;
  selectedRoom?: string;
  onSelect: (room: string) => void;
}) {
  if (loading) {
    return <p className="px-mode-page py-8 text-center text-role-caption text-text-muted">Loading rooms…</p>;
  }
  if (rooms.length === 0) {
    return <EmptyState title="No rooms yet" description="Add one at Inventory › Locations › Rooms." />;
  }
  return (
    <div data-testid="label-room-picker">
      <DetailNav
        label="Room"
        rows={rooms.map((room) => {
          const letter = zoneMap[room];
          return {
            id: room,
            title: room,
            icon: selectedRoom === room ? <Check /> : <ZoneLetterTile letter={letter} />,
            meta: letter ? `Zone ${letter}` : 'No zone letter',
            onSelect: () => onSelect(room),
          };
        })}
      />
    </div>
  );
}
