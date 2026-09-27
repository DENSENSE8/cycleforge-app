'use client';

/**
 * Global header search — shown in the header's nav cluster while the sidebar
 * is closed, where the sidebar's own ⌘K face would sit. It IS that face
 * (`NavGlobalSearch`): the same sunken well, gray words that turn black on
 * hover / focus, ⌘K keycaps and the paste key disclosed on hover. Opens the
 * centered {@link CommandBar} palette; the ⌘K chord lives on CommandBar.
 */

import { NavGlobalSearch } from '@/components/sidebar/contextual/NavFind';

export function GlobalHeaderSearch() {
  return (
    <div className="flex w-56 shrink-0 items-center" data-testid="global-find-field">
      <NavGlobalSearch />
    </div>
  );
}
