'use client';

/** Overlay wrapper around {@link CatalogManagerList} — the CRUD manager for the org platform / type catalog, opened from the pencil next to… */

import { RightPaneOverlay } from '@/components/ui/RightPaneOverlay';
import { IconButton } from '@/design-system/primitives';
import { X } from '@/components/Icons';
import { microBadge } from '@/design-system/tokens/typography/presets';
import { CatalogManagerList, type CatalogKind } from './CatalogManagerList';
import { PlatformAccountsManager } from './PlatformAccountsManager';

export type { CatalogKind } from './CatalogManagerList';

const TITLE: Record<CatalogKind, string> = {
  platform: 'Edit platforms',
  type: 'Manage types',
  priority: 'Manage priorities',
};

export function CatalogManagerPopover({
  open,
  kind,
  onClose,
  focusAdd = false,
}: {
  open: boolean;
  kind: CatalogKind;
  onClose: () => void;
  /** Autofocus the add field (Add platform / Add type from carton pills). */
  focusAdd?: boolean;
}) {
  return (
    <RightPaneOverlay
      open={open}
      onClose={onClose}
      align="center"
      anchor="viewport"
      aria-label={TITLE[kind]}
      className="w-[min(94%,32rem)] rounded-2xl border-0 shadow-2xl ring-1 ring-border-soft"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-border-hairline px-5 py-3">
        <span className={`${microBadge} text-text-muted`}>{TITLE[kind]}</span>
        <IconButton
          onClick={onClose}
          ariaLabel="Close"
          icon={<X className="h-4 w-4" />}
          className="rounded-lg p-1.5 transition-colors hover:bg-surface-sunken"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <CatalogManagerList
          kind={kind}
          enabled={open}
          autoFocusAdd={focusAdd}
          // The pill's Edit is where an operator lands after hitting a
          // constraint at the bench, so the rules that caused it are editable
          // here too — not only in Settings.
          enablePlatformRules
        />
        {kind === 'platform' ? (
          <section aria-label="Connections" className="mt-5 border-t border-border-hairline pt-4">
            <p className={`${microBadge} mb-2 text-text-muted`}>Connections</p>
            <PlatformAccountsManager />
          </section>
        ) : null}
      </div>
    </RightPaneOverlay>
  );
}
