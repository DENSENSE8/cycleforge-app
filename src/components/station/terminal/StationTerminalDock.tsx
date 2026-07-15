'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { FloatingButton } from '@/design-system/primitives';
import type { TerminalActionVm } from '@/lib/station-terminal';
import { getStaffThemeById, stationThemeColors } from '@/utils/staff-colors';
import { cn } from '@/utils/_cn';

/**
 * Industry-aligned sticky bar sizing (DoorDash / Uber Eats / HIG):
 *   - FloatingButton CTA is `h-12` (48px) — meets 44–48px min tap target
 *   - Dock band stays slim; `disabledReason` is a separate line above the pill
 *   - Safe-area inset handled by FloatingButton (`env(safe-area-inset-bottom)`)
 *   - Host scroll body should reserve clearance (`pb-32` for absolute float)
 */
export const STATION_TERMINAL_SCROLL_CLEARANCE = 'pb-32';

/**
 * Renders a TerminalActionVm as the panel-level FloatingButton dock.
 * Cross-fades (200–250ms) when the VM label / kind swaps on tab change;
 * reduced-motion collapses to an instant swap.
 *
 * When `assignedTechId` is set and the VM has no explicit `toneClasses`,
 * tints the pill with the assigned tech's station theme (unbox receive bar).
 */
export function StationTerminalDock({
  vm,
  assignedTechId,
  className,
}: {
  vm: TerminalActionVm | null;
  assignedTechId?: number | null;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const techTheme =
    assignedTechId != null ? stationThemeColors[getStaffThemeById(assignedTechId)] : null;

  const toneClasses = vm?.toneClasses ?? (techTheme ? { bg: techTheme.bg, hover: techTheme.hover } : undefined);

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
                  'mx-auto w-full text-center text-role-caption font-semibold text-amber-700',
                  vm.maxWidth ?? 'max-w-[720px]',
                )}
              >
                {vm.disabledReason}
              </p>
            </div>
          ) : null}
          <FloatingButton
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
          />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
