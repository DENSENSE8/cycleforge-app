'use client';

/**
 * Shared sidebar surface for the Labels and Racks printers. Renders the
 * room list driven by the shared RoomFinderContext — the actual search
 * input lives in the sidebar header band (WarehouseSidebarPanel) so each
 * surface only has one search affordance.
 */

import { useMemo } from 'react';
import { SkeletonCardGrid } from '@/components/ui/SkeletonCard';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { useRoomFinder } from '@/components/warehouse/roomFinderContext';
import { LABEL_BUILDER_SELECTED } from './label-builder-layout';
import { ZONE_LETTER_UNASSIGNED_HINT } from './ZoneLetterTile';

interface LabelRoomSidebarProps {
  rooms: string[];
  zoneMap: Record<string, string>;
  loading: boolean;
  selectedRoom?: string;
  zoneLetter?: string;
  onSelect: (room: string) => void;
  /** Override the subtitle when no room is selected. */
  emptySubtitle?: string;
}

export function LabelRoomSidebar({
  rooms,
  zoneMap,
  loading,
  selectedRoom,
  onSelect,
  emptySubtitle = 'Then build the label on the right.',
}: LabelRoomSidebarProps) {
  const { query } = useRoomFinder();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rooms;
    return rooms.filter((room) => {
      const letter = zoneMap[room] ?? '';
      return (
        room.toLowerCase().includes(q) ||
        letter.toLowerCase().includes(q)
      );
    });
  }, [rooms, zoneMap, query]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border-hairline px-3 pb-2.5 pt-3">
        <h2 className="text-sm font-semibold tracking-tight text-text-default">
          Pick a room
        </h2>
        <p className="mt-0.5 truncate text-role-caption text-text-soft">
          {selectedRoom ?? emptySubtitle}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2 scrollbar-hide">
        {loading ? (
          <SkeletonCardGrid count={4} className="h-10" />
        ) : rooms.length === 0 ? (
          <EmptyRooms />
        ) : filtered.length === 0 ? (
          <NoMatches query={query} />
        ) : (
          <div className="flex flex-col gap-0.5">
            {filtered.map((room) => {
              const letter = zoneMap[room];
              const isSelected = selectedRoom === room;
              return (
                <button
                  key={room}
                  type="button"
                  onClick={() => onSelect(room)}
                  className={`ds-raw-button flex items-center gap-2.5 rounded-lg border px-2 py-1.5 text-left transition-colors ${
                    isSelected
                      ? LABEL_BUILDER_SELECTED.soft
                      : 'border-transparent bg-transparent hover:bg-surface-hover'
                  }`}
                >
                  <ZoneLetterTile letter={letter} active={isSelected} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium leading-snug text-text-default">
                      {room}
                    </p>
                    {!letter && (
                      <p className="mt-0.5 text-role-micro font-medium uppercase tracking-wider text-amber-600">
                        No zone letter
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyRooms() {
  return (
    <div className="rounded-xl border border-dashed border-border-soft px-4 py-8 text-center">
      <p className="text-sm font-semibold text-text-muted">No rooms yet</p>
      <p className="mt-1 text-role-caption text-text-soft">
        Open the <span className="font-semibold">Rooms</span> tab and add one — it&apos;ll show up here.
      </p>
    </div>
  );
}

function NoMatches({ query }: { query: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border-soft px-4 py-8 text-center">
      <p className="text-sm font-semibold text-text-muted">
        No rooms match “{query.trim()}”
      </p>
      <p className="mt-1 text-role-caption text-text-soft">
        Try a different name or zone letter.
      </p>
    </div>
  );
}

/**
 * The sidebar's own smaller, selectable tile — a different instrument from
 * {@link ZoneLetterTile} (h-8, `active`), sharing only the sentence.
 */
function ZoneLetterTile({ letter, active }: { letter: string | undefined; active: boolean }) {
  if (letter) {
    return (
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-mono text-sm font-semibold ring-1 transition-colors ${
          active
            ? 'bg-blue-600 text-white ring-blue-700/20'
            : 'bg-blue-50 text-blue-700 ring-blue-200'
        }`}
      >
        {letter}
      </div>
    );
  }
  return (
    <HoverTooltip label={ZONE_LETTER_UNASSIGNED_HINT} asChild focusable={false}>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 font-mono text-sm font-semibold text-amber-700 ring-1 ring-amber-200">
        ?
      </div>
    </HoverTooltip>
  );
}
