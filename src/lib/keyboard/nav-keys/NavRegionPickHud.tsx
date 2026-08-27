'use client';

/**
 * Region-pick HUD — after `⌘;`, briefly reveals `l` / `m` / `r` so region
 * pick is discoverable (not silent). Spec:
 * `docs/todo/nav-keys-selection-keyboard-HANDOFF.md` §1.
 */

import { useSyncExternalStore } from 'react';
import { elevationClass } from '@/design-system/tokens/shadows';
import { cn } from '@/utils/_cn';
import { NAV_KEY_HINT_CLASS } from './nav-key-face';
import { NAV_REGIONS } from './nav-regions';
import {
  getNavMode,
  getServerNavMode,
  subscribeNavMode,
} from './nav-leader-store';

export function NavRegionPickHud() {
  const mode = useSyncExternalStore(
    subscribeNavMode,
    getNavMode,
    getServerNavMode,
  );

  if (mode.phase !== 'pick') return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="nav-region-pick-hud"
      className="pointer-events-none fixed inset-x-0 bottom-16 z-fab flex justify-center px-4"
    >
      <div
        className={cn(
          'flex items-center gap-3 border border-border-hairline bg-surface-card/95 px-3 py-2 backdrop-blur-sm',
          elevationClass('overlay'),
        )}
      >
        <span className="text-role-micro font-semibold uppercase tracking-widest text-text-muted">
          Jump to
        </span>
        {NAV_REGIONS.map((r) => (
          <span
            key={r.id}
            className="inline-flex items-center gap-1.5 text-role-caption text-text-default"
          >
            <span className={NAV_KEY_HINT_CLASS}>{r.key}</span>
            <span className="text-text-muted">{r.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
