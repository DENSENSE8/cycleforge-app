'use client';

import { AnimatePresence, motion, motionRole, useMotionRole } from '@/design-system/motion';
import { SlicedActionDock } from '@/design-system/primitives';
import { useStationTheme } from '@/hooks/useStationTheme';
import type { TerminalActionVm } from '@/lib/station-terminal';
import { cn } from '@/utils/_cn';

/** Industry-aligned sticky bar sizing (DoorDash / Uber Eats / HIG): */
export const STATION_TERMINAL_SCROLL_CLEARANCE = 'pb-32';

/** Clearance for a dock that carries a PAGER ROW above its shell (Unbox on `unbox-work`; main Unbox notes+Print dock is shorter). */
export const STATION_TERMINAL_PAGER_SCROLL_CLEARANCE = 'pb-56';

/** Renders a TerminalActionVm as the panel-level bottom-edge sliced action dock. */
export function StationTerminalDock({
  vm,
  assignedTechId,
  embedded = false,
  embeddedChrome = 'flush',
  className,
}: {
  vm: TerminalActionVm | null;
  assignedTechId?: number | null;
  embedded?: boolean;
  embeddedChrome?: 'flush' | 'pill';
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
        embeddedChrome={embeddedChrome}
        label={vm.label}
        onClick={() => void vm.onClick()}
        icon={vm.icon}
        disabled={vm.disabled}
        loading={vm.loading}
        title={vm.title}
        hotkey={vm.hotkey}
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
            hotkey={vm.hotkey}
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
