'use client';

import type { ComponentType, SVGProps } from 'react';
import { Sparkles } from '@/components/Icons';
import { cn } from '@/utils/_cn';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { railHint } from './scan-type-keybinds';
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
  /** Visible Auto chip (selected when `armedMode === null`). Default on. */
  showAuto?: boolean;
}

const BTN_BY_SIZE = {
  default: STATION_SCAN_BAR_MODE_BTN,
  compact: STATION_SCAN_BAR_MODE_BTN_COMPACT,
} as const;

/** Auto is a real selected state — faint/neutral, not a loud type hue. */
const AUTO_ARMED_CLASS = 'text-text-soft';

/**
 * Full-height flush mode segments. Auto is first; type chips follow.
 * Armed = solid `surface-card`. Click Auto while a type is armed → release.
 * Click Auto while already Auto → no-op. Click armed type → release to Auto.
 */
export function StationScanModeRail<T extends string>({
  modes,
  armedMode,
  onToggleMode,
  size = 'default',
  getAriaLabel,
  getTitle,
  showAuto = true,
}: StationScanModeRailProps<T>) {
  const btnShell = BTN_BY_SIZE[size];
  const autoArmed = armedMode === null;

  return (
    <div
      className="relative z-dropdown isolate flex h-full items-stretch gap-0"
      role="group"
      aria-label={`Scan type. ${railHint(modes.length)}`}
    >
      {showAuto ? (
        <HoverTooltip
          label={
            autoArmed
              ? `Auto — next scan picks the type. ${railHint(modes.length)}`
              : `Auto — release the armed type. ${railHint(modes.length)}`
          }
          asChild
        >
          <button
            type="button"
            onClick={() => {
              if (armedMode == null) return;
              onToggleMode?.(armedMode);
            }}
            aria-pressed={autoArmed}
            aria-label={
              autoArmed
                ? 'Auto armed. Next scan auto-detects type.'
                : 'Release to Auto'
            }
            className={cn(
              'ds-raw-button',
              btnShell,
              autoArmed
                ? cn(STATION_SCAN_BAR_MODE_BTN_ARMED, AUTO_ARMED_CLASS)
                : STATION_SCAN_BAR_MODE_BTN_INACTIVE,
            )}
          >
            <Sparkles className={STATION_SCAN_BAR_MODE_GLYPH_CLASS} />
          </button>
        </HoverTooltip>
      ) : null}
      {modes.map((mode) => {
        const armed = armedMode === mode.mode;
        const ariaLabel =
          getAriaLabel?.(mode, armed) ??
          (armed
            ? `${mode.label} armed for next scan. Click again to cancel.`
            : `Arm ${mode.label}: next Enter/scan searches ${mode.label}.`);
        const title =
          getTitle?.(mode, armed) ??
          (armed
            ? `${mode.label} armed — next Enter/scan. Click again to cancel.`
            : `${mode.label} (next Enter/scan; or search now if the field has text)`);

        return (
          <HoverTooltip key={mode.mode} label={title} asChild>
            {/* ds-raw-button: scan-station full-height mode segment (armed/inactive via STATION_SCAN_BAR_MODE_* tokens) — intentionally not a Button/IconButton primitive */}
            <button
              type="button"
              onClick={() => onToggleMode?.(mode.mode)}
              aria-pressed={armed}
              aria-label={ariaLabel}
              className={cn(
                'ds-raw-button',
                btnShell,
                armed
                  ? cn(STATION_SCAN_BAR_MODE_BTN_ARMED, mode.armedClass)
                  : STATION_SCAN_BAR_MODE_BTN_INACTIVE,
              )}
            >
              <mode.Icon className={STATION_SCAN_BAR_MODE_GLYPH_CLASS} />
            </button>
          </HoverTooltip>
        );
      })}
    </div>
  );
}

