'use client';

import type { ReactNode } from 'react';
import { Button } from '@/design-system/primitives';

export interface DetailDockVerb<Id extends string = string> {
  id: Id;
  label: string;
  icon: ReactNode;
  /** The one ink-filled verb. At most one per dock. */
  primary?: boolean;
  disabled?: boolean;
}

/**
 * The verb dock of a mobile entity hub (the exoskeleton, operator 2026-09-24):
 * at most three verbs, one primary, in the thumb zone on every scroll position.
 * The header carries identity only and the summary card is read-only, so this
 * is the ONE surface on a hub that changes the entity.
 *
 * `sticky bottom-0` at the end of the route's flex column, not `fixed`: the
 * shell's scroll container pins it to the viewport bottom while the dock keeps
 * its own box in flow, so the last door is never hidden under it. The
 * safe-area inset rides on the bottom padding.
 */
export function DetailDock<Id extends string>({
  label,
  verbs,
  onVerb,
  size = 'default',
}: {
  /** Accessible name of the dock (`Repair actions`, `SKU exception actions`). */
  label: string;
  verbs: readonly DetailDockVerb<Id>[];
  onVerb: (id: Id) => void;
  /**
   * `glove` — 56px cells for a screen worked one-handed with gloves at the
   * shelf (the directed picker). Icon and label stay on ONE row; the label
   * steps down to caption type so a three-word verb (`Out of Stock`) fits a
   * third of a phone without wrapping. Default follows the mode's CTA hit.
   */
  size?: 'default' | 'glove';
}) {
  const cell =
    size === 'glove'
      ? 'min-h-14 w-full gap-1 whitespace-nowrap rounded-mode px-1 text-role-caption'
      : 'min-h-mode-hit-cta w-full rounded-mode px-2';
  const columns = verbs.length >= 3 ? 'grid-cols-3' : verbs.length === 2 ? 'grid-cols-2' : 'grid-cols-1';
  return (
    <nav
      aria-label={label}
      className="sticky bottom-0 z-sticky border-t border-mode-rule bg-mode-bar px-mode-page pt-2"
      style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom, 0px))' }}
    >
      <div className={`grid gap-2 ${columns}`}>
        {verbs.slice(0, 3).map((verb) => (
          <Button
            key={verb.id}
            variant={verb.primary ? 'primary' : 'secondary'}
            size="lg"
            className={cell}
            icon={verb.icon}
            disabled={verb.disabled}
            onClick={() => onVerb(verb.id)}
          >
            {verb.label}
          </Button>
        ))}
      </div>
    </nav>
  );
}
