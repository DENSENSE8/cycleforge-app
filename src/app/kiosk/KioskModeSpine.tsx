'use client';

/**
 * Kiosk mode spine — far-left push column for Repair · Buy/Sell · Pickup.
 *
 * MasterNav *geometry* (flex sibling, snap width, push not overlay, no motion
 * tween) without mounting staff `MasterNav`. Icon column is always visible;
 * expand shows labels and pushes Catalog/Detail right.
 *
 * Open/close lives in the Catalog (or Pickup detail) pane header — this
 * column is destinations only.
 *
 * Region contract: `.claude/rules/display/kiosk-shell.md`.
 */

import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { KIOSK_SERVICES, type KioskServiceId } from '@/lib/kiosk/services';
import { cn } from '@/utils/_cn';
import {
  KIOSK_MODE_SPINE_EXPANDED_W,
  KIOSK_MODE_SPINE_EXPANDED_W_PX,
  KIOSK_MODE_SPINE_FACE,
  KIOSK_MODE_SPINE_ICON_W_PX,
  KIOSK_MODE_SPINE_ROW,
  KIOSK_MODE_SPINE_ROW_ACTIVE,
  KIOSK_MODE_SPINE_ROW_IDLE,
} from './kiosk-chrome';

export function KioskModeSpine({
  activeMode,
  expanded,
  onModeSwitch,
}: {
  activeMode: KioskServiceId;
  expanded: boolean;
  onModeSwitch: (mode: KioskServiceId) => void;
}) {
  const widthPx = expanded ? KIOSK_MODE_SPINE_EXPANDED_W_PX : KIOSK_MODE_SPINE_ICON_W_PX;

  return (
    <div
      className="relative h-full shrink-0 overflow-hidden"
      style={{ width: widthPx }}
      data-testid="kiosk-mode-spine"
    >
      <aside
        className={cn(KIOSK_MODE_SPINE_FACE, KIOSK_MODE_SPINE_EXPANDED_W, 'absolute inset-y-0 left-0')}
        aria-label="Kiosk services"
      >
        <div
          role="tablist"
          aria-label="Kiosk service mode"
          aria-orientation="vertical"
          className="flex min-h-0 flex-1 flex-col gap-0 p-0"
        >
          {KIOSK_SERVICES.map((tab) => {
            const live = tab.status === 'live';
            const active = activeMode === tab.id;
            const Icon = tab.icon;
            const shortLabel =
              tab.id === 'repair' ? 'Repair' : tab.id === 'sales' ? 'Buy / Sell' : 'Pickup';
            const tip = live ? tab.blurb : `${tab.label} — coming soon`;

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
                    focusRing('control', 'neutral'),
                    active ? KIOSK_MODE_SPINE_ROW_ACTIVE : KIOSK_MODE_SPINE_ROW_IDLE,
                    !live && 'cursor-not-allowed opacity-40',
                    !expanded && 'justify-center px-0',
                  )}
                >
                  <Icon
                    className={cn(
                      'h-6 w-6 shrink-0',
                      active ? 'text-text-default' : 'text-text-soft',
                    )}
                  />
                  {expanded ? (
                    <span className="min-w-0 flex-1 truncate text-role-body font-semibold">
                      {shortLabel}
                    </span>
                  ) : null}
                </button>
              </HoverTooltip>
            );
          })}
        </div>
      </aside>
    </div>
  );
}
