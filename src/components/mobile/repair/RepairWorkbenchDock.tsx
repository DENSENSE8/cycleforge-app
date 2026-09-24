'use client';

import { Button } from '@/design-system/primitives';
import { Activity, PackageCheck, Wrench } from '@/components/Icons';

export type RepairDockVerb = 'status' | 'log' | 'pickup';

/**
 * The mobile repair workbench's ONE verb surface — Status · Log work · Pickup
 * in the thumb zone, the same on every scroll position. The header carries
 * identity only; no other control on the page changes the repair.
 *
 * `sticky bottom-0` at the end of the route's flex column, not `fixed`: the
 * shell's scroll container pins it to the bottom of the viewport while the
 * dock keeps its own box in flow, so the last section is never hidden under
 * it and no spacer has to guess its height. Safe-area inset rides on the
 * bottom padding, same as `ConfirmDock`.
 */
export function RepairWorkbenchDock({
  pickupEnabled,
  onOpen,
}: {
  /** Pickup is live only for eligible statuses (`canStartRepairPickup`). */
  pickupEnabled: boolean;
  onOpen: (verb: RepairDockVerb) => void;
}) {
  const cell = 'min-h-mode-hit-cta w-full rounded-mode px-2';
  return (
    <nav
      aria-label="Repair actions"
      className="sticky bottom-0 z-sticky border-t border-mode-rule bg-mode-bar px-mode-page pt-2"
      style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom, 0px))' }}
    >
      <div className="grid grid-cols-3 gap-2">
        <Button variant="secondary" size="lg" className={cell} icon={<Activity />} onClick={() => onOpen('status')}>
          Status
        </Button>
        <Button variant="primary" size="lg" className={cell} icon={<Wrench />} onClick={() => onOpen('log')}>
          Log work
        </Button>
        <Button
          variant="secondary"
          size="lg"
          className={cell}
          icon={<PackageCheck />}
          disabled={!pickupEnabled}
          onClick={() => onOpen('pickup')}
        >
          Pickup
        </Button>
      </div>
    </nav>
  );
}
