'use client';

/** Scan-station preview of a resolved identifier — the FIND column, not a station pane / ActiveOrderWorkspace Displays. */

import { Button } from '@/design-system/primitives';
import { SearchDossier } from '@/components/search/dossier/SearchDossier';
import type { SearchSelection } from '@/lib/search/search-selection';
import { FindDensityProvider } from '@/components/search/find-density-context';

export function SearchFindPreviewEmbed({
  sel,
  onClose,
}: {
  sel: SearchSelection;
  onClose: () => void;
}) {
  return (
    <FindDensityProvider density="compact">
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-surface-card">
        <div className="shrink-0 px-3 py-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
        <SearchDossier sel={sel} hasQuery={false} onExit={onClose} />
      </div>
    </FindDensityProvider>
  );
}
