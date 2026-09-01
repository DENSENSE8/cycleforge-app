'use client';

import { cornerClass } from '@/design-system/tokens/radius';
import { formatDateTimePST } from '@/utils/date';
import { cn } from '@/utils/_cn';
import { TicketNasBackupButton } from '../TicketNasBackupButton';
import { PhotoThumb } from '../PhotoThumb';
import { PhotoEntityGroupHeader } from './PhotoEntityGroupHeader';
import { SelectionMark } from './SelectionMark';
import {
  clickSelectsInstead,
  groupPhotosByTicket,
  photoFileName,
  photoIdentityLine,
  photoPrimaryLabel,
} from './photo-grid-format';
import type { PhotoGridViewProps } from './types';

/** List view — PO/ticket-grouped vertical rosters with space between each link group. */
export function PhotoListView({
  photos,
  scope,
  selectionActive,
  selected,
  onSelectTile,
  onToggleGroupSelection,
  onPhotoContextMenu,
  openAt,
}: PhotoGridViewProps) {
  const groups = groupPhotosByTicket(photos, scope);
  const showGroupHeaders = groups.length > 1 || selectionActive;
  const showNasBackup = scope === 'claims';

  return (
    <div className="space-y-4">
      {groups.map((group) => {
        const groupIds = group.photos.map((p) => p.id);
        const allGroupSelected =
          groupIds.length > 0 && groupIds.every((id) => selected.has(id));
        const someGroupSelected = groupIds.some((id) => selected.has(id));
        const ticketNumber = group.key.startsWith('ticket:')
          ? group.key.slice('ticket:'.length)
          : null;

        return (
          <section key={group.key} className="space-y-1.5">
            {showGroupHeaders || (showNasBackup && ticketNumber) ? (
              <PhotoEntityGroupHeader
                title={group.label}
                count={group.photos.length}
                allSelected={allGroupSelected}
                someSelected={someGroupSelected && !allGroupSelected}
                sticky={false}
                onToggleSelectAll={
                  onToggleGroupSelection
                    ? () => onToggleGroupSelection(groupIds)
                    : undefined
                }
                trailing={
                  showNasBackup && ticketNumber ? (
                    <TicketNasBackupButton
                      ticketNumber={ticketNumber}
                      size="sm"
                      label="Sync to NAS"
                      className="ml-auto"
                    />
                  ) : null
                }
              />
            ) : null}
            <ul
              className={cn(
                'divide-y divide-border-hairline overflow-hidden border border-border bg-card',
                cornerClass('flush'),
              )}
            >
              {group.photos.map((photo) => {
                const isSelected = selected.has(photo.id);
                const takenAt = formatDateTimePST(photo.createdAt);
                const fileName = photoFileName(photo, scope);
                const metaLabel = photoPrimaryLabel(photo, scope);
                const statusLabel = [
                  photo.damageDetected && 'damage',
                  photo.hasAnalysis && !photo.damageDetected && 'analyzed',
                ]
                  .filter(Boolean)
                  .join(' · ');
                // Under group headers the shared PO/ticket ref lives in the
                // header — the row keeps its own SKU · serial identity line.
                const subtitle = showGroupHeaders
                  ? [photoIdentityLine(photo), statusLabel].filter(Boolean).join(' · ')
                  : [metaLabel, statusLabel].filter(Boolean).join(' · ');
                return (
                  <li key={photo.id} className="group relative">
                    <button
                      type="button"
                      // Roving-focus target for grid arrow-key nav (usePhotoGridKeyboardNav).
                      data-photo-tile=""
                      data-photo-id={photo.id}
                      onClick={(e) => {
                        if (clickSelectsInstead(e, selectionActive)) {
                          e.preventDefault();
                          onSelectTile(photo.id, { shift: e.shiftKey });
                        } else {
                          openAt(photo.id);
                        }
                      }}
                      onContextMenu={(e) => onPhotoContextMenu?.(photo, e)}
                      className={cn(
                        'ds-raw-button flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-surface-hover',
                        'focus-visible:bg-surface-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-blue-400', // ds-allow-focus: inset row focus — an offset control ring clips inside the overflow-hidden list group
                        isSelected && 'bg-blue-50/50',
                      )}
                    >
                      <div
                        className={cn(
                          'relative h-12 w-12 shrink-0 border border-border',
                          cornerClass('flush'),
                        )}
                      >
                        <PhotoThumb
                          src={photo.thumbUrl}
                          alt=""
                          damage={Boolean(photo.damageDetected)}
                          className={cornerClass('flush')}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{fileName}</p>
                        {subtitle ? (
                          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
                        ) : null}
                      </div>
                      <time className="shrink-0 text-xs tabular-nums text-muted-foreground">{takenAt}</time>
                    </button>
                    <SelectionMark
                      checked={isSelected}
                      active={selectionActive}
                      onToggle={(mods) => onSelectTile(photo.id, mods)}
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
