'use client';

/**
 * Unbox Displays → Photos topic — gallery by default, nested Move · Send verbs.
 *
 * Strip cell is "Photos"; this host owns the verb switcher. URL:
 * `?display=photos&photoAction=move|send` (absent / legacy `browse` = gallery).
 *
 * Nested verb tabs twin Units · Linkage: underline `TabDisplay` with icon +
 * label. Gallery is the default body (neither Move nor Send selected).
 * Re-clicking the active verb returns to the gallery. Move / Send mount
 * `chrome="display"` — no per-tool gray title / X. Strip + tabs name the
 * verb; column `→|` owns dismiss (same contract as Ticket→Claim).
 */

import { ArrowLeftRight, Send } from '@/components/Icons';
import { TabDisplay } from '@/design-system/components';
import { MovePhotosBetweenPoPanel } from './MovePhotosBetweenPoPanel';
import { SendPhotoNotePanel } from '../SendPhotoNotePanel';
import { ClaimPhotoPicker } from '../claim/components/ClaimPhotoPicker';
import { useClaimPhotos } from '../claim/hooks/useClaimPhotos';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import type { UnboxPhotoAction } from './unbox-side-tabs';

/** Icon + label — same face as Units · Linkage nested child tabs. */
const PHOTO_TABS = [
  { id: 'move', label: 'Move', icon: ArrowLeftRight },
  { id: 'send', label: 'Send', icon: Send },
] as const;

function PhotosGalleryBody({ receivingId }: { receivingId: number | null }) {
  const photos = useClaimPhotos(true, receivingId);
  if (receivingId == null) {
    return (
      <p className="px-4 py-6 text-center text-role-caption text-text-soft">
        Scan or open a carton to view its photos.
      </p>
    );
  }
  return (
    <ClaimPhotoPicker photos={photos} receivingId={receivingId} mode="view" />
  );
}

export function PhotosDisplayHost({
  row,
  action,
  onActionChange,
}: {
  row: ReceivingLineRow;
  action: UnboxPhotoAction;
  onActionChange: (action: UnboxPhotoAction) => void;
}) {
  const verbActive = action === 'move' || action === 'send' ? action : '';

  return (
    <div className="flex h-full min-h-0 flex-col gap-0" data-testid="unbox-photos-display">
      <div className="shrink-0">
        <TabDisplay
          tabs={[...PHOTO_TABS]}
          activeTab={verbActive}
          onTabChange={(id) => {
            const next = id as 'move' | 'send';
            // Re-click active verb → gallery (default body).
            onActionChange(action === next ? 'browse' : next);
          }}
          density="nested"
          fit="fill"
          appearance="underline"
          aria-label="Photo actions"
        />
      </div>
      {/* Flush bodies — no shared host inset (Macro footers pin to column bottom). */}
      <div className="min-h-0 flex-1">
        {action === 'browse' ? (
          <PhotosGalleryBody receivingId={row.receiving_id ?? null} />
        ) : null}
        {action === 'move' ? (
          <MovePhotosBetweenPoPanel
            key={`move-${row.receiving_id ?? row.id}`}
            open
            receivingId={row.receiving_id}
            onClose={() => onActionChange('browse')}
            chrome="display"
          />
        ) : null}
        {action === 'send' ? (
          <SendPhotoNotePanel
            key={`note-${row.id}`}
            open
            row={row}
            onClose={() => onActionChange('browse')}
            chrome="display"
          />
        ) : null}
      </div>
    </div>
  );
}
