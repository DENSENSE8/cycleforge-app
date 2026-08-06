'use client';

/**
 * Unbox Displays → Photos topic — nested Browse · Move · Send on one carton.
 *
 * Strip cell is "Photos"; this host owns the verb switcher. URL:
 * `?display=photos&photoAction=browse|move|send`.
 *
 * Move / Send mount `chrome="display"` — no per-tool gray title / X. Strip +
 * tabs name the verb; column `→|` owns dismiss (same contract as Ticket→Claim).
 */

import { ArrowLeftRight, Images, Send } from '@/components/Icons';
import { TabDisplay } from '@/design-system/components';
import { DISPLAYS_BODY_INSET } from '@/design-system/shells/detail-stack';
import { MovePhotosBetweenPoPanel } from './MovePhotosBetweenPoPanel';
import { SendPhotoNotePanel } from '../SendPhotoNotePanel';
import { ClaimPhotoPicker } from '../claim/components/ClaimPhotoPicker';
import { useClaimPhotos } from '../claim/hooks/useClaimPhotos';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import type { UnboxPhotoAction } from './unbox-side-tabs';

const PHOTO_TABS = [
  { id: 'browse', label: 'Browse', icon: Images },
  { id: 'move', label: 'Move', icon: ArrowLeftRight },
  { id: 'send', label: 'Send', icon: Send },
] as const;

function PhotosBrowseBody({ receivingId }: { receivingId: number | null }) {
  const photos = useClaimPhotos(true, receivingId);
  if (receivingId == null) {
    return (
      <p className="px-1 py-6 text-center text-role-caption text-text-soft">
        Scan or open a carton to browse its photos.
      </p>
    );
  }
  return <ClaimPhotoPicker photos={photos} receivingId={receivingId} />;
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
  return (
    <div className="flex h-full min-h-0 flex-col gap-0" data-testid="unbox-photos-display">
      <div className="shrink-0">
        <TabDisplay
          tabs={[...PHOTO_TABS]}
          activeTab={action}
          onTabChange={(id) => onActionChange(id as UnboxPhotoAction)}
          density="nested"
          fit="fill"
          appearance="underline"
          aria-label="Photo actions"
        />
      </div>
      {/* Browse keeps a readable gutter; Move / Send are self-contained flush
          panels that own their claim-grammar row gutters — mount flush, no
          shared host pt-3 (Macro footer must pin to the true column bottom). */}
      <div className="min-h-0 flex-1">
        {action === 'browse' ? (
          <div className={DISPLAYS_BODY_INSET}>
            <PhotosBrowseBody receivingId={row.receiving_id ?? null} />
          </div>
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
