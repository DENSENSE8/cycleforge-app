'use client';

/** Media Library desk inspector — the n = 1 face of the selection plane. */

import { DetailStackRailRegistrar } from '@/components/right-rail/DetailStackRailRegistrar';
import { DeskRailChromeRow } from '@/components/right-rail/DeskRailChromeRow';
import { PaneHeaderLabel } from '@/components/ui/pane-header';
import { formatDateTimePST } from '@/utils/date';
import type { PhotoLibrarySourceScope } from '@/lib/photos/library-filter-state';
import type { LibraryPhoto } from '../photo-library-types';
import { photoIdentityLine, photoPrimaryLabel } from '../photo-library-grid/photo-grid-format';

interface PhotoInspectorPanelProps {
  /** The one selected photo. */
  photo: LibraryPhoto;
  /** Source scope — drives the PO# vs ticket# identity label. */
  scope: PhotoLibrarySourceScope;
  onClose: () => void;
}

export function PhotoInspectorPanel({
  photo,
  scope,
  onClose,
}: PhotoInspectorPanelProps) {
  const primaryLabel = photoPrimaryLabel(photo, scope);
  const identityLine = photoIdentityLine(photo);

  return (
    <DetailStackRailRegistrar
      id="detail:photo"
      onClose={onClose}
      modal={false}
      ariaLabel={`Photo ${primaryLabel} details`}
    >
      <div
        className="flex h-full min-h-0 flex-col overflow-hidden"
        data-testid="photo-inspector-panel"
      >
        <div className="shrink-0 border-b border-border-hairline bg-surface-card/90 backdrop-blur-xl">
          <DeskRailChromeRow onClose={onClose} />
        </div>

        {/* Deliberately one identity line. */}
        <div className="min-h-0 flex-1 overflow-y-auto inset-field">
          <PaneHeaderLabel
            eyebrow="Photo"
            value={primaryLabel}
            valueTitle={primaryLabel}
          />
          <p className="mt-1 truncate text-role-micro text-text-soft">
            {identityLine ? `${identityLine} · ` : ''}
            {formatDateTimePST(photo.createdAt)}
          </p>
        </div>
      </div>
    </DetailStackRailRegistrar>
  );
}
