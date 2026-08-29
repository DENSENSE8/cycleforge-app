'use client';

/**
 * Kiosk command spine — two-state rail for Repair · Retail · Buyback · Pickup.
 *
 * Collapsed (~56px): icon-only cells; names live on aria-label + tooltip.
 * Expanded (~256px): Search row + icon-leading named commands.
 * Width + label/search opacity tween via `motionRole.push.rail`.
 *
 * Commands swap the center work surface only — they never clear the cart.
 * Flush footer Exit returns staff preview to ops chrome (`/`).
 * Region contract: docs/todo/kiosk-pos-modernization-HANDOFF.md.
 */

import { useRouter } from 'next/navigation';
import { X } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { SearchField } from '@/design-system/primitives/SearchField';
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
  const router = useRouter();
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
          {/* One house find bar everywhere — same SoT as MasterNav / Band-3 / To Ship. */}
          <SearchField
            placeholder={searchLabel}
            value={searchValue}
            onChange={onSearchChange}
            className="min-w-0 flex-1"
            rightElement={
              <KioskSpineToggle expanded={expanded} onExpandedChange={onExpandedChange} />
            }
            data-testid="kiosk-spine-search"
        />
        </motion.div>
      ) : (
        <div className="flex h-14 shrink-0 items-center justify-center">
          <KioskSpineToggle expanded={expanded} onExpandedChange={onExpandedChange} />
        </div>
      )}

      <div
        role="tablist"
        aria-label="Kiosk commands"
        aria-orientation="vertical"
        className="flex min-h-0 flex-1 flex-col gap-0 p-0"
      >
        {KIOSK_SERVICES.map((tab) => {
          const live = tab.status === 'live';
          const active = activeMode === tab.id;
          const Icon = tab.icon;
          const shortLabel = tab.commandLabel ?? kioskSpineShortLabel(tab.id);
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

      {/* Flush bottom-left Exit — staff preview leave-mode (not device unpair). */}
      <HoverTooltip label="Exit kiosk" asChild>
        <button
          type="button"
          aria-label="Exit kiosk"
          data-testid="kiosk-spine-exit"
          onClick={() => router.push('/')}
          className={cn(
            KIOSK_MODE_SPINE_ROW,
            'border-t border-border-soft',
            expanded ? KIOSK_MODE_SPINE_ROW_EXPANDED : KIOSK_MODE_SPINE_ROW_COLLAPSED,
            focusRing('control', 'neutral'),
            KIOSK_MODE_SPINE_ROW_IDLE,
          )}
        >
          <X className={cn(KIOSK_MODE_SPINE_ICON, 'text-text-soft')} />
          {expanded ? (
            <motion.span
              className={KIOSK_MODE_SPINE_LABEL}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={transition}
            >
              Exit
            </motion.span>
          ) : null}
        </button>
      </HoverTooltip>
    </motion.aside>
  );
}
