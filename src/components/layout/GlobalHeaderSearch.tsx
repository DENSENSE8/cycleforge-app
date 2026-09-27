'use client';

/**
 * Global header search — shown in the header's nav cluster while the sidebar
 * is closed, where the sidebar's search field would sit. It IS that field
 * (`NavFind`) in its everywhere scope: the page's list keeps its own Find in
 * the data-table bar while the sidebar is closed (TriageSelectBar), so the
 * header never mounts a second page-scoped field. Opens the centered
 * {@link CommandBar} palette; the ⌘K chord lives on CommandBar.
 */

import { NavFind } from '@/components/sidebar/contextual/NavFind';

export function GlobalHeaderSearch() {
  return (
    <div className="flex w-56 shrink-0 items-center" data-testid="global-find-field">
      <NavFind />
    </div>
  );
}
