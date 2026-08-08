'use client';

/**
 * Top-of-strip mini scan cell for the parked left-dock.
 *
 * Height matches the open-rail scan band / StationContextBar top row (`h-10`).
 * Idle: Plus face with staff-themed hover wash.
 * Focused: same bottom-up {@link ScanBandGlowHost} chromatic glow as the
 * open-rail band + visible caret (no placeholder text in the w-8 strip).
 *
 * Session comes from {@link usePublishCollapseScan} (primary StationScanBar).
 */

import {
  useCallback,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
} from 'react';
import { Plus } from '@/components/Icons';
import { PRIMARY_CHROME_ROW_FACE } from '@/components/layout/header-shell';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import type { CollapseStripScan } from '@/components/sidebar/context-panel-collapse-context';
import { ScanBandGlowHost } from '@/components/station/scan-bar/ScanBandGlowHost';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { useRegisterScanTarget } from '@/lib/scan-hotkey/useScanHotkey';
import { cn } from '@/utils/_cn';

/** Match left-dock collapse/expand glyph box — never a bare `h-4` twin. */
const SCAN_CELL_ICON_CLASS = 'h-3.5 w-3.5';

/** Open-rail scan band / StationContextBar top row — never a shorter pin twin. */
const SCAN_CELL_HEIGHT_CLASS = PRIMARY_CHROME_ROW_FACE;

export function CollapseStripScanCell({ scan }: { scan: CollapseStripScan }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [focused, setFocused] = useState(false);

  // Most-recent target wins — parks above the inert open-rail StationScanBar.
  useRegisterScanTarget(inputRef, true);

  const arm = useCallback((e?: MouseEvent) => {
    e?.stopPropagation();
    setFocused(true);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      // Place caret; do not select-all so the cursor stays visible as a blink.
      const len = el.value.length;
      el.setSelectionRange(len, len);
    });
  }, []);

  const onSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      e.stopPropagation();
      scan.onSubmit();
    },
    [scan],
  );

  return (
    <div
      className={cn(
        'relative flex w-full shrink-0 items-center justify-center',
        SCAN_CELL_HEIGHT_CLASS,
      )}
      data-collapse-strip-scan=""
      data-focused={focused ? 'true' : undefined}
      onClick={(e) => e.stopPropagation()}
    >
      {!focused ? (
        <HoverTooltip label="New scan" asChild>
          <button
            type="button"
            aria-label="New scan"
            data-collapse-strip-scan-idle=""
            // Full-bleed h-10 hit target — matches scan band / carton context
            // top row; not an IconButton size token (those top out at h-9).
            className={cn(
              'ds-raw-button ds-allow-control-size',
              'flex w-full items-center justify-center border-0 border-b-2 border-b-transparent',
              'text-text-faint transition-colors',
              SCAN_CELL_HEIGHT_CLASS,
              focusRing('control', 'neutral'),
              scan.hoverClass,
            )}
            onClick={arm}
          >
            <Plus className={SCAN_CELL_ICON_CLASS} aria-hidden />
          </button>
        </HoverTooltip>
      ) : null}

      {/* Keep the input mounted while idle so the focus-scan hotkey can land
          here. Focused face = bottom-up station glow + blinking caret. */}
      <ScanBandGlowHost
        themeColor={scan.theme}
        className={cn(
          'w-full',
          SCAN_CELL_HEIGHT_CLASS,
          focused ? 'relative' : 'pointer-events-none absolute inset-0 opacity-0',
        )}
      >
        <form
          onSubmit={onSubmit}
          className={cn('relative w-full', SCAN_CELL_HEIGHT_CLASS)}
          aria-hidden={focused ? undefined : true}
        >
          <input
            ref={inputRef}
            type="text"
            data-collapse-strip-scan-input=""
            value={scan.value}
            onChange={(e) => scan.onChange(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            // No placeholder in the strip — glow + caret are the focus signal.
            placeholder=""
            aria-label={scan.placeholder || 'Scan'}
            className={cn(
              'box-border w-full bg-transparent px-0 text-center text-role-micro font-semibold text-text-default outline-none',
              SCAN_CELL_HEIGHT_CLASS,
              scan.bottomRuleClass,
            )}
          />
        </form>
      </ScanBandGlowHost>
    </div>
  );
}
