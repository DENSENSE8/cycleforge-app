'use client';

/**
 * Scan-station preview of a resolved identifier — the FIND column, not
 * EntityStationPane / ActiveOrderWorkspace Displays.
 *
 * Callers: TechRightPane shipping preview overlay.
 * User: continue to the next phase (Phase 5 scan preview embed).
 */

import { Button } from '@/design-system/primitives';
import { SearchDossier } from '@/components/search/dossier/SearchDossier';
import type { SearchSelection } from '@/lib/search/search-selection';

export function SearchFindPreviewEmbed({
  sel,
  onClose,
}: {
  sel: SearchSelection;
  onClose: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-surface-card">
      <div className="shrink-0 border-b border-border-hairline px-3 py-2">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>
      <SearchDossier sel={sel} hasQuery={false} onExit={onClose} />
    </div>
  );
}
