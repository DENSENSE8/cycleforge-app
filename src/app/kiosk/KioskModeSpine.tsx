'use client';

/**
 * Kiosk mode spine — two-state rail for Repair · Buy/Sell · Pickup.
 *
 * Collapsed (~56px): icon-only cells; names live on aria-label + tooltip.
 * Expanded (~256px): Search row + icon-leading named tabs.
 * Width + label/search opacity tween via `motionRole.push.rail` (never a
 * spring, never an x-translate out of the reserved slot, never a 0↔N snap).
 *
 * Region contract: docs/todo/kiosk-pos-modernization-HANDOFF.md.
 */

import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { TextField } from '@/design-system/primitives';
import { motion, motionRole, useMotionRole } from '@/design-system/motion';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { KIOSK_SERVICES, type KioskServiceId } from '@/lib/kiosk/services';
import { cn } from '@/utils/_cn';
import {
  KIOSK_MODE_SPINE_COLLAPSED_W,
  KIOSK_MODE_SPINE_COLLAPSED_W_PX,
  KIOSK_MODE_SPINE_EXPANDED_W,
  KIOSK_MODE_SPINE_EXPANDED_W_PX,
  KIOSK_MODE_SPINE_FACE,
  KIOSK_MODE_SPINE_ICON,
  KIOSK_MODE_SPINE_LABEL,
  KIOSK_MODE_SPINE_ROW,
  KIOSK_MODE_SPINE_ROW_ACTIVE,
  KIOSK_MODE_SPINE_ROW_COLLAPSED,
  KIOSK_MODE_SPINE_ROW_EXPANDED,
  KIOSK_MODE_SPINE_ROW_IDLE,
  KIOSK_MODE_SPINE_SEARCH_ROW,
  kioskSpineShortLabel,
} from './kiosk-chrome';
import { KIOSK_POS_SEARCH_INPUT } from './kiosk-pos-surface';
import { KioskSpineToggle } from './KioskSpineToggle';

export function KioskModeSpine({
  activeMode,
  onModeSwitch,
  expanded,
  onExpandedChange,
  searchValue,
  onSearchChange,
  searchLabel = 'Search',
}: {
  activeMode: KioskServiceId;
  onModeSwitch: (mode: KioskServiceId) => void;
  expanded: boolean;
  onExpandedChange: (next: boolean) => void;
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchLabel?: string;
}) {
  const { transition } = useMotionRole(motionRole.push.rail);
  const width = expanded ? KIOSK_MODE_SPINE_EXPANDED_W_PX : KIOSK_MODE_SPINE_COLLAPSED_W_PX;

  return (
    <motion.aside
      className={cn(KIOSK_MODE_SPINE_FACE, 'shrink-0 overflow-hidden')}
      aria-label="Kiosk services"
      data-testid="kiosk-mode-spine"
      data-spine-expanded={expanded ? 'true' : 'false'}
      data-collapsed-w={KIOSK_MODE_SPINE_COLLAPSED_W}
      data-expanded-w={KIOSK_MODE_SPINE_EXPANDED_W}
      initial={false}
      animate={{ width }}
      transition={transition}
    >
      {expanded ? (
        <motion.div
          className={KIOSK_MODE_SPINE_SEARCH_ROW}
          initial={false}
          animate={{ opacity: 1 }}
          transition={transition}
        >
          <TextField
            label={searchLabel}
            value={searchValue}
            onChange={onSearchChange}
            className="min-w-0 flex-1"
            tone="blue"
            inputClassName={KIOSK_POS_SEARCH_INPUT}
            data-testid="kiosk-spine-search"
          />
          <KioskSpineToggle expanded={expanded} onExpandedChange={onExpandedChange} />
        </motion.div>
      ) : (
        <div className="flex h-14 shrink-0 items-center justify-center">
          <KioskSpineToggle expanded={expanded} onExpandedChange={onExpandedChange} />
        </div>
      )}

      <div
        role="tablist"
        aria-label="Kiosk service mode"
        aria-orientation="vertical"
        className="flex min-h-0 flex-1 flex-col gap-1 p-1.5"
      >
        {KIOSK_SERVICES.map((tab) => {
          const live = tab.status === 'live';
          const active = activeMode === tab.id;
          const Icon = tab.icon;
          const shortLabel = kioskSpineShortLabel(tab.id);
          const tip = expanded
            ? live
              ? tab.blurb
              : `${tab.label} — coming soon`
            : tab.label;

          return (
            <HoverTooltip key={tab.id} label={tip} asChild>
              <button
                type="button"
                role="tab"
                aria-selected={active}
                aria-label={tab.label}
                disabled={!live}
                onClick={() => onModeSwitch(tab.id)}
                className={cn(
                  KIOSK_MODE_SPINE_ROW,
                  expanded ? KIOSK_MODE_SPINE_ROW_EXPANDED : KIOSK_MODE_SPINE_ROW_COLLAPSED,
                  focusRing('control', 'neutral'),
                  active ? KIOSK_MODE_SPINE_ROW_ACTIVE : KIOSK_MODE_SPINE_ROW_IDLE,
                  !live && 'cursor-not-allowed opacity-40',
                )}
              >
                <Icon
                  className={cn(
                    KIOSK_MODE_SPINE_ICON,
                    active ? 'text-text-default' : 'text-text-soft',
                  )}
                />
                {expanded ? (
                  <motion.span
                    className={KIOSK_MODE_SPINE_LABEL}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={transition}
                  >
                    {shortLabel}
                  </motion.span>
                ) : null}
              </button>
            </HoverTooltip>
          );
        })}
      </div>
    </motion.aside>
  );
}
