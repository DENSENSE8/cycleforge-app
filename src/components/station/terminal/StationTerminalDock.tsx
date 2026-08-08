'use client';

import { AnimatePresence, motion, useReducedMotion } from '@/design-system/motion';
import { SlicedActionDock } from '@/design-system/primitives';
import type { TerminalActionVm } from '@/lib/station-terminal';
import { getStaffThemeById, stationThemeColors } from '@/utils/staff-colors';
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
 * Main Unbox: Print·Receive mounts in UnboxDockHost trailing on settle only
 * (not an under-dock row). This clearance still over-reserves for the notes
 * composer when expanded — the safe direction.
 */
export const STATION_TERMINAL_PAGER_SCROLL_CLEARANCE = 'pb-48';


/** VM tone, tinted with the assigned tech's station theme when unset. */
function resolveDockToneClasses(
  vm: TerminalActionVm | null,
  assignedTechId?: number | null,
): { bg: string; hover: string } | undefined {
  if (vm?.toneClasses) return vm.toneClasses;
  if (assignedTechId == null) return undefined;
  const theme = stationThemeColors[getStaffThemeById(assignedTechId)];
  return theme ? { bg: theme.bg, hover: theme.hover } : undefined;
}

/**
 * Renders a TerminalActionVm as the panel-level bottom-edge sliced action dock.
 * Cross-fades (200–250ms) when the VM label / kind swaps on tab change;
 * reduced-motion collapses to an instant swap.
 *
 * When `assignedTechId` is set and the VM has no explicit `toneClasses`,
 * tints the track with the assigned tech's station theme (unbox receive bar).
 *
 * `embedded` renders ONLY the pill track — no band, no `disabledReason` line,
 * no crossfade — for mounting inside another control's chrome (Unbox mounts it
 * at the trailing edge of its one-row dock `Panel`, across from the active
 * step's CTA). The host owns placement and the disabled-reason line; the
 * VM→dock mapping stays here so the registry remains the single terminal path.
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
  const reduceMotion = useReducedMotion();
  const toneClasses = resolveDockToneClasses(vm, assignedTechId);

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
          initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 4 }}
          transition={
            reduceMotion
              ? { duration: 0.001 }
              : { duration: 0.22, ease: [0.22, 1, 0.36, 1] }
          }
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
