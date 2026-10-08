'use client';

import { WorkspaceCard, StickyActionBar } from '@/design-system/components';
import { DangerZone } from '@/design-system/components/danger-zone/DangerZone';
import { Button } from '@/design-system/primitives';
import { FILTER_DROPDOWN_SELECT_CLASS } from '@/design-system/components/FilterDropdownSelect';
import { Check, ChevronDown, ChevronLeft, Plus, Trash2, X } from '@/components/Icons';
import { LETTERS } from './room-detail-shared';
import { RoomStatsCard } from './RoomStatsCard';
import type { RoomDetailController } from './useRoomDetailForm';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
/** The room edit / create form body (shown when `?room=` or `?new=true`). */
export function RoomEditForm({ c }: { c: RoomDetailController }) {
  const {
    creating, selectedRoom, form, setForm,
    stats, usedLetters, trimmedName, trimmedLetter,
    nameTaken, renameTaken, canSave, isDirty, saveDisabledReason, roomMutating,
    setParam, goToBins, handleSave, handleDelete, handleDiscard,
  } = c;

  const title = creating ? 'Add a new room' : selectedRoom;
  const subtitle = creating
    ? 'Give it a friendly name and a zone letter (A–Z). The letter prints on every label and inside the QR code.'
    : 'Update the friendly name or zone letter. Renames cascade through bins and rekey their barcodes.';

  return (
    <div className="flex flex-col pb-28">
      <div className="border-b border-border-soft px-4 py-3">
        <Button
          variant="secondary"
          size="sm"
          icon={<ChevronLeft className="h-3.5 w-3.5" />}
          onClick={() => setParam((p) => { p.delete('room'); p.delete('new'); })}
        >
          Rooms
        </Button>
        <div className="mt-3 flex min-w-0 items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-role-eyebrow text-text-soft">
              {creating ? 'New room' : 'Editing room'}
            </p>
            <h1 className="truncate text-lg font-semibold text-text-default" title={trimmedName || title || undefined}>
              {trimmedName || title || 'Untitled room'}
            </h1>
            <p className="mt-1 max-w-[60ch] text-role-caption leading-snug text-text-soft">
              {subtitle}
            </p>
          </div>
          <label className="shrink-0">
            <span className="mb-1 block text-role-eyebrow text-text-soft">Zone</span>
            <span className="relative block">
              <select
                aria-label="Zone letter"
                value={trimmedLetter}
                onChange={(event) => setForm((current) => ({ ...current, letter: event.target.value }))}
                className={cn(FILTER_DROPDOWN_SELECT_CLASS, 'w-[5.25rem] font-mono text-base')}
              >
                <option value="">—</option>
                {LETTERS.map((letter) => (
                  <option
                    key={letter}
                    value={letter}
                    disabled={usedLetters.has(letter) && trimmedLetter !== letter}
                  >
                    {letter}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-faint" />
            </span>
          </label>
        </div>
      </div>

      <div className="flex flex-col gap-4 px-4 py-4">
        {/* Stats card (only when editing an existing room with data) */}
        {!creating && stats && (
          <RoomStatsCard stats={stats} selectedRoom={selectedRoom} onOpenBins={goToBins} />
        )}

      {/* Name field */}
      <WorkspaceCard label="Room name">
        <p className="mb-2 text-role-caption text-text-soft">
          The friendly label your team sees in pickers, scanners, and reports.
        </p>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="e.g. Zone 1 – New"
          autoComplete="off"
          className={`h-12 w-full rounded-2xl border bg-surface-canvas px-4 text-base font-semibold text-text-default outline-none transition-colors focus:bg-surface-card ${
            (nameTaken || renameTaken)
              ? cn('border-red-300', focusRing('field', 'danger'))
              : cn('border-border-soft', focusRing('field', 'accent'))
          }`}
        />
        {(nameTaken || renameTaken) && (
          <p className="mt-1.5 text-role-caption font-medium text-red-600">
            A room named “{trimmedName}” already exists.
          </p>
        )}
      </WorkspaceCard>

      {/* Description */}
      <WorkspaceCard label="Notes (optional)">
        <p className="mb-2 text-role-caption text-text-soft">
          Anything pickers should know — e.g. “fragile only” or “overflow cage.”
        </p>
        <textarea
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          rows={3}
          placeholder="Add a short note…"
          className={cn("w-full resize-none rounded-2xl border border-border-soft bg-surface-canvas px-4 py-3 text-role-body text-text-default transition-colors focus:bg-surface-card", focusRing('field', 'accent'))}
        />
      </WorkspaceCard>

      {/* Destructive zone: the delete paints in full; its square confirmation opens beside it. */}
      {!creating && selectedRoom && (
        <DangerZone
          testId="room-edit"
          items={[
            {
              id: 'delete',
              label: 'Delete room',
              icon: <Trash2 />,
              disabled: roomMutating,
              disabledReason: 'Saving the room…',
              confirmDetail:
                'Soft delete — bins stay in history. Recreate the room by printing labels under that name again.',
              run: handleDelete,
            },
          ]}
        />
      )}

      <StickyActionBar
        primary={{
          label: roomMutating
            ? 'Saving…'
            : creating
              ? 'Create room'
              : 'Save changes',
          onClick: handleSave,
          isLoading: roomMutating,
          disabled: !canSave || (!creating && !isDirty),
          title: saveDisabledReason,
          tone: 'blue',
          icon: creating ? <Plus className="h-4 w-4" /> : <Check className="h-4 w-4" />,
          // Hotkeys on hover, never inline (owner 2026-10-03): ⏎ is taught in the CTA's tooltip.
          shortcut: '⏎',
        }}
        secondary={
          isDirty
            ? {
                label: creating ? 'Cancel' : 'Discard',
                onClick: handleDiscard,
                icon: <X className="h-4 w-4" />,
              }
            : undefined
        }
      />
      </div>
    </div>
  );
}
