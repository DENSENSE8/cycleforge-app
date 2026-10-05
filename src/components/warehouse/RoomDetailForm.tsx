'use client';

/** Room list + editor for /inventory/locations?tab=rooms. */

import { useRoomDetailForm } from './room-detail/useRoomDetailForm';
import { EmptyState } from './room-detail/RoomDetailPieces';
import { RoomEditForm } from './room-detail/RoomEditForm';
import { AdminTable, type AdminTableColumn } from '@/design-system/components/AdminTable/AdminTable';
import { ArmedDangerButton } from '@/design-system/components/ArmedDangerButton';
import { Button, IconButton } from '@/design-system/primitives';
import { Pencil, Plus, Trash2 } from '@/components/Icons';
import type { RoomDetailController } from './room-detail/useRoomDetailForm';

type RoomRow = RoomDetailController['roomRows'][number];

export function RoomDetailForm() {
  const c = useRoomDetailForm();

  // ── Empty state — no selection ─────────────────────────────────────────
  if (!c.selectedRoom && !c.creating) {
    if (!c.roomsLoading && c.roomRows.length > 0) {
      const columns: AdminTableColumn<RoomRow>[] = [
        {
          key: 'room',
          header: 'Room',
          cell: (row) => (
            <span className="font-semibold text-text-default">{row.name}</span>
          ),
        },
        {
          key: 'letter',
          header: 'Code',
          cell: (row) => (
            <span className="font-mono font-semibold text-text-muted">{row.zoneLetter || '—'}</span>
          ),
          width: '88px',
        },
        { key: 'locations', header: 'Locations', type: 'number', cell: (row) => row.binCount },
        { key: 'units', header: 'Units', type: 'number', cell: (row) => row.totalQty },
        { key: 'empty', header: 'Empty', type: 'number', cell: (row) => row.emptyCount },
        {
          key: 'attention',
          header: 'Needs attention',
          type: 'number',
          cell: (row) => row.attentionCount,
        },
        {
          key: 'actions',
          header: 'Actions',
          align: 'right',
          cell: (row) => (
            <div className="flex items-center justify-end gap-2" onClick={(event) => event.stopPropagation()}>
              <IconButton
                size="md"
                radius="control"
                icon={<Pencil aria-hidden className="h-3.5 w-3.5" />}
                ariaLabel={`Edit ${row.name}`}
                title={`Edit ${row.name}`}
                onClick={() => c.setParam((params) => {
                  params.set('room', row.name);
                  params.delete('new');
                })}
              />
              <ArmedDangerButton
                size="sm"
                icon={<Trash2 aria-hidden />}
                iconOnlyUntilArmed
                label={`Delete ${row.name}`}
                confirmLabel="Delete room?"
                title={`Delete ${row.name}`}
                loading={c.roomMutating}
                onConfirm={async () => { await c.deleteRoomByName(row.name); }}
              />
            </div>
          ),
          width: '112px',
        },
      ];
      return (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-border-soft px-4 py-3">
            <div>
              <h2 className="text-base font-semibold text-text-default">Rooms</h2>
              <p className="text-role-caption text-text-soft">
                {c.roomRows.length} rooms · select one to rename, re-code, inspect, or delete
              </p>
            </div>
            <Button
              variant="primary"
              size="sm"
              icon={<Plus aria-hidden />}
              onClick={() => c.setParam((params) => {
                params.set('new', 'true');
                params.delete('room');
              })}
            >
              Add room
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-4">
            <AdminTable
              columns={columns}
              rows={c.roomRows}
              rowKey={(row) => row.name}
              onRowClick={(row) => c.setParam((params) => {
                params.set('room', row.name);
                params.delete('new');
              })}
            />
          </div>
        </div>
      );
    }
    return (
      <EmptyState
        loading={c.roomsLoading}
        roomCount={c.allRoomNames.length}
        onCreate={() => c.setParam((p) => p.set('new', 'true'))}
      />
    );
  }

  // ── Edit / Create form ────────────────────────────────────────────────
  return <RoomEditForm c={c} />;
}
