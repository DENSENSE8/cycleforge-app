'use client';

import { AnimatePresence, motion, motionRole, useMotionRole } from '@/design-system/motion';
import { SlicedActionDock } from '@/design-system/primitives';
import { useStationTheme } from '@/hooks/useStationTheme';
import type { TerminalActionVm } from '@/lib/station-terminal';
import { cn } from '@/utils/_cn';

/**
 * Industry-aligned sticky bar sizing (DoorDash / Uber Eats / HIG):
 *   - SlicedActionDock CTA is `h-12` (48px) — meets 44–48px min tap target
 *   - Dock band stays slim; `disabledReason` is a separate line above the track
 *   - Safe-area inset handled by SlicedActionDock (`env(safe-area-inset-bottom)`)
 *   - Host scroll body should reserve clearance (`pb-32` for absolute bottom slice)
 */
export const STATION_TERMINAL_SCROLL_CLEARANCE = 'pb-32';

/**
 * Clearance for a dock that carries a PAGER ROW above its shell (Unbox on
 * `unbox-work`; main Unbox notes+Print dock is shorter).
 *
 * The dock floats over the scroll canvas, so the body's bottom padding is the
 * only thing keeping content out from under it — and that padding is a constant
 * tuned to the dock's height. Add a row to the dock without adding it here and
 * the deck's last card slides under the new chrome.
 *
 * A named variant rather than a bumped shared constant: the four stations
 * without a pager must not pay dead canvas for one that has one. Same shape as
 * `reserveIdentityClearance`'s `'stacked'`.
 *
 * Main Unbox float ≈ dogfood Print·Receive strip (h-11) + Band 1 (h-11) +
 * Band 2 pager (h-8) ≈ 120px; `pb-56` (224px) clears that plus disabled-reason /
 * receive-feedback lines and notes expand — the safe direction.
 */
export const STATION_TERMINAL_PAGER_SCROLL_CLEARANCE = 'pb-56';

/**
 * Renders a TerminalActionVm as the panel-level bottom-edge sliced action dock.
 * Scan-cadence swap (`motionRole.swap.scan`) — exit is instant so Receive ↔ Save
 * never leaves an empty dock band between verbs.
 *
 * When `assignedTechId` is set and the VM has no explicit `toneClasses`,
 * tints the track via {@link useStationTheme} — same scan-theme path as the
 * station scan bar (operator accent CSS vars for self; staff palette otherwise).
 *
 * `embedded` renders ONLY the flush-square track — no band, no `disabledReason`
 * line, no crossfade — for mounting inside another control's chrome (Unbox
 * dogfood strip above the floor). The host owns placement and the
 * disabled-reason line; the VM→dock mapping stays here so the registry remains
 * the single terminal path.
 */
export function StationTerminalDock({
  vm,
  assignedTechId,
  embedded = false,
  className,
}: {
  vm: TerminalActionVm | null;
  assignedTechId?: number | null;
  embedded?: boolean;
  className?: string;
}) {
  const { presence, transition } = useMotionRole(motionRole.swap.scan);
  // Same SoT as ThemedStationScanBar — self → dynamic accent; other staff → palette.
  const { colors: scanColors } = useStationTheme({ staffId: assignedTechId });
  const toneClasses =
    vm?.toneClasses ??
    (assignedTechId != null
      ? { bg: scanColors.bg, hover: scanColors.hover }
      : undefined);

  if (embedded) {
    if (!vm) return null;
    return (
      <SlicedActionDock
        embedded
        label={vm.label}
        onClick={() => void vm.onClick()}
        icon={vm.icon}
        disabled={vm.disabled}
        loading={vm.loading}
        title={vm.title}
        tone={vm.tone ?? 'accent'}
        toneClasses={toneClasses}
        menu={vm.menu}
        menuLabel={vm.menuLabel}
        menuTitle={vm.menuTitle}
        fullWidth={vm.fullWidth}
        className={className}
      />
    );
  }

  // Key on label + docked so Receive ↔ Save swaps animate; secondary menu
  // changes alone should not re-trigger the enter animation.
  const presenceKey = vm ? `${vm.label}|${vm.docked ? 'd' : 'f'}|${vm.tone ?? 'accent'}` : 'hidden';

  return (
    <AnimatePresence mode="wait" initial={false}>
      {vm ? (
        <motion.div
          key={presenceKey}
          initial={presence.initial}
          animate={presence.animate}
          exit={presence.exit}
          transition={transition}
          className={cn('flex shrink-0 flex-col', className)}
        >
          {vm.disabled && vm.disabledReason ? (
            <div className="shrink-0 px-4 sm:px-6">
              <p
                role="status"
                className={cn(
                  'mx-auto w-full text-role-caption font-semibold text-amber-700',
                  vm.align === 'end' ? 'text-right' : 'text-center',
                  vm.maxWidth ?? 'max-w-[720px]',
                )}
              >
                {vm.disabledReason}
              </p>
            </div>
          ) : null}
          <SlicedActionDock
            edge="bottom"
            label={vm.label}
            onClick={() => void vm.onClick()}
            icon={vm.icon}
            disabled={vm.disabled}
            loading={vm.loading}
            title={vm.title}
            tone={vm.tone ?? 'accent'}
            toneClasses={toneClasses}
            menu={vm.menu}
            menuLabel={vm.menuLabel}
            menuTitle={vm.menuTitle}
            maxWidth={vm.maxWidth ?? 'max-w-[720px]'}
            fullWidth={vm.fullWidth ?? true}
            docked={vm.docked ?? false}
            align={vm.align ?? 'center'}
          />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
