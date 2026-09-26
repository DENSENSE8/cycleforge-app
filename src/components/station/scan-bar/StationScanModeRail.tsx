'use client';

import type { ComponentType, SVGProps } from 'react';
import { Check, Layers } from '@/components/Icons';
import { cn } from '@/utils/_cn';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/design-system/primitives/DropdownMenu';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import {
  STATION_SCAN_BAR_MODE_BTN,
  STATION_SCAN_BAR_MODE_BTN_ARMED,
  STATION_SCAN_BAR_MODE_BTN_COMPACT,
  STATION_SCAN_BAR_MODE_BTN_INACTIVE,
  STATION_SCAN_BAR_MODE_GLYPH_CLASS,
} from './tokens';

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

export interface StationScanModeDefinition<T extends string> {
  mode: T;
  label: string;
  Icon: IconComponent;
  /** Icon/text hue when armed — no bg-* (segment shell owns the solid card plane). */
  armedClass: string;
}

interface StationScanModeRailProps<T extends string> {
  modes: readonly StationScanModeDefinition<T>[];
  armedMode: T | null;
  onToggleMode?: (mode: T) => void;
  size?: 'default' | 'compact';
  getAriaLabel?: (mode: StationScanModeDefinition<T>, armed: boolean) => string;
  getTitle?: (mode: StationScanModeDefinition<T>, armed: boolean) => string;
  /** Offer Auto as a menu row (selected when `armedMode === null`). Default on. */
  showAuto?: boolean;
}

const TRIGGER_BY_SIZE = {
  default: STATION_SCAN_BAR_MODE_BTN,
  compact: STATION_SCAN_BAR_MODE_BTN_COMPACT,
} as const;

/** Auto is a real selected state — faint/neutral, not a loud type hue. */
const AUTO_ARMED_CLASS = 'text-text-soft';

/** Scan TYPE picker — one full-height flush dropdown at the bar's trailing edge. */
export function StationScanModeRail<T extends string>({
  modes,
  armedMode,
  onToggleMode,
  size = 'default',
  getAriaLabel,
  getTitle,
  showAuto = true,
}: StationScanModeRailProps<T>) {
  const triggerShell = TRIGGER_BY_SIZE[size];
  const autoArmed = armedMode === null;
  const active = armedMode ? modes.find((m) => m.mode === armedMode) ?? null : null;

  const release = () => {
    if (armedMode == null) return;
    onToggleMode?.(armedMode);
  };

  const faceLabel = active?.label ?? 'Auto';
  const triggerTitle = active
    ? (getTitle?.(active, true) ?? `${active.label} armed — next Enter/scan. Open to change type.`)
    : `Auto — next scan picks the type. Open to force a type.`;

  return (
    <div className="relative z-dropdown isolate flex h-full items-stretch gap-0">
      <DropdownMenu>
        <HoverTooltip label={triggerTitle} asChild>
          <DropdownMenuTrigger asChild>
            {/* ds-raw-button: scan-station full-height flush segment (armed/inactive
                via STATION_SCAN_BAR_MODE_* tokens) — intentionally not a Button. */}
            <button
              type="button"
              aria-label={`Scan type: ${faceLabel}. Open to change.`}
              className={cn(
                'ds-raw-button',
                triggerShell,
                active
                  ? cn(STATION_SCAN_BAR_MODE_BTN_ARMED, active.armedClass)
                  : cn(STATION_SCAN_BAR_MODE_BTN_INACTIVE, autoArmed ? AUTO_ARMED_CLASS : null),
              )}
            >
              {active ? (
                <active.Icon className={STATION_SCAN_BAR_MODE_GLYPH_CLASS} />
              ) : (
                <Layers className={STATION_SCAN_BAR_MODE_GLYPH_CLASS} />
              )}
            </button>
          </DropdownMenuTrigger>
        </HoverTooltip>

        <DropdownMenuContent align="end" sideOffset={4} className="min-w-[11rem]">
          {showAuto ? (
            <>
              <DropdownMenuItem
                onSelect={release}
                role="menuitemradio"
                aria-checked={autoArmed}
                className="justify-between"
              >
                <span className="flex items-center gap-2">
                  <Layers className="size-4 text-text-soft" />
                  <span className="text-role-caption font-semibold">Auto</span>
                </span>
                {autoArmed ? <Check className="size-4 text-text-soft" /> : null}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          ) : null}

          {modes.map((mode) => {
            const armed = armedMode === mode.mode;
            const ariaLabel =
              getAriaLabel?.(mode, armed) ??
              (armed
                ? `${mode.label} armed for next scan. Pick again to cancel.`
                : `Arm ${mode.label}: next Enter/scan searches ${mode.label}.`);

            return (
              <DropdownMenuItem
                key={mode.mode}
                onSelect={() => onToggleMode?.(mode.mode)}
                role="menuitemradio"
                aria-checked={armed}
                aria-label={ariaLabel}
                className="justify-between"
              >
                <span className="flex items-center gap-2">
                  <mode.Icon className={cn('size-4', armed ? mode.armedClass : 'text-text-soft')} />
                  <span className="text-role-caption font-semibold">{mode.label}</span>
                </span>
                {armed ? <Check className="size-4 text-text-soft" /> : null}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
