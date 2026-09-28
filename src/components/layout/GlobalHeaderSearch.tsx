'use client';

/**
 * Global header search — shown in the header's nav cluster while the sidebar
 * is closed, where the sidebar's search field would sit. It IS that field
 * (`NavFind`) with the same scope the sidebar gives it: on a page with its own
 * list it is that list's Find (typing narrows the list on screen, a pasted
 * list of numbers locates them); elsewhere it is the palette's everywhere face.
 * One field per page — the data-table bar never paints a second (owner
 * 2026-09-28).
 */

import { NavFind } from '@/components/sidebar/contextual/NavFind';
import { useCurrentNavPath, useNavContext } from '@/components/sidebar/contextual/useNavContext';

export function GlobalHeaderSearch() {
  const nav = useNavContext(useCurrentNavPath()).data;
  // Same rule as the sidebar: only a page's own contextual panel scopes the field.
  const pageSearch = nav?.rollout === 'contextual' && nav.scope === 'section' ? nav.search : undefined;
  return (
    <div className="flex w-56 shrink-0 items-center" data-testid="global-find-field">
      <NavFind search={pageSearch} />
    </div>
  );
}
