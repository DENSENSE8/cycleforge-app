'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from '@/design-system/motion';
import { Settings, X } from '@/components/Icons';
import { AnchoredLayer } from '@/design-system/primitives/AnchoredLayer';
import { IconButton } from '@/design-system/primitives';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { FOCUS_SCAN_HOTKEY_RE } from '@/lib/schemas/staff-preferences';
import { useScanHotkey } from '@/lib/scan-hotkey/useScanHotkey';
import { cn } from '@/utils/_cn';

interface ScanHotkeyControlProps {
  /** The bar's contextual left icon (scan glyph / mode indicator) shown at rest. */
  children: ReactNode;
}

/**
 * The shared focus-scan hotkey affordance that lives in EVERY StationScanBar's
 * left icon slot.
 *
 * At rest the bar's contextual icon shows. On bar hover the icon cross-fades to
 * a gear in the same 17px slot (opacity only — no slide, no padding push). The
 * current hotkey lives in the reassign dropdown, not beside the gear. Slot
 * geometry comes from `STATION_SCAN_BAR_ICON_SLOT_CLASS` /
 * `SIDEBAR_RAIL_DOT_TRACK` — do not add per-caller `-ml-1` or hover `pl-*`.
 */
export function ScanHotkeyControl({ children }: ScanHotkeyControlProps) {
  const { hotkey, setHotkey, setCapturing } = useScanHotkey();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const gearRef = useRef<HTMLButtonElement>(null);

  // Close + blur the gear. Capturing a key flips the button into :focus-visible
  // (it's keyboard focus now), which would otherwise pin the gear visible via
  // focus-visible:opacity-100 even after the mouse leaves. Blurring clears that.
  const close = useCallback(() => {
    setOpen(false);
    gearRef.current?.blur();
  }, []);

  // While the popover is open we're in capture mode: stand the global listener
  // down and grab the next keystroke (capture phase, so we beat every handler).
  useEffect(() => {
    if (!open) return;
    setCapturing(true);
    setError(null);
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        close();
        return;
      }
      if (FOCUS_SCAN_HOTKEY_RE.test(e.key)) {
        setHotkey(e.key);
        close();
      } else {
        setError('Pick Insert, ScrollLock, or F1–F12');
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      setCapturing(false);
    };
  }, [open, setHotkey, setCapturing, close]);

  return (
    <span className="relative inline-flex size-[17px] items-center justify-center leading-none">
      {/* Contextual icon — fades out on hover / while configuring. In-flow so
          the slot keeps the same box as a direct icon child; inline-flex
          avoids inline-SVG baseline drift. */}
      <span
        className={cn(
          'inline-flex size-[17px] items-center justify-center leading-none transition-opacity duration-150',
          open ? 'opacity-0' : 'opacity-100 group-hover:opacity-0',
        )}
        aria-hidden={open}
      >
        {children}
      </span>

      {/* Gear — same box as the resting icon; opacity cross-fade only. Hotkey
          chip lives in the dropdown below so the input never shifts. */}
      <HoverTooltip label={`Focus scan — press ${hotkey}. Click to change.`} asChild>
        <button
          ref={gearRef}
          type="button"
          onClick={() => (open ? close() : setOpen(true))}
          aria-label={`Focus-scan hotkey is ${hotkey}. Click to reassign.`}
          className={cn(
            'ds-raw-button',
            'absolute inset-0 inline-flex items-center justify-center rounded-md text-text-soft transition-opacity duration-150 hover:text-blue-600 focus-visible:opacity-100 focus-visible:outline-none',
            open
              ? 'pointer-events-auto opacity-100 text-blue-600'
              : 'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100',
          )}
        >
          <Settings className="block size-[17px]" />
        </button>
      </HoverTooltip>

      <AnchoredLayer
        open={open}
        onClose={close}
        anchorRef={gearRef}
        placement="bottom-start"
        gap={10}
      >
        <motion.div
          initial={{ opacity: 0, y: 6, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 420, damping: 30 }}
          className="w-60 overflow-hidden rounded-2xl border border-white/40 bg-surface-card/95 p-3 shadow-[0_20px_40px_-12px_rgba(0,0,0,0.22)] ring-1 ring-black/[0.08] backdrop-blur-xl"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-role-eyebrow uppercase tracking-wider text-text-soft">
              Focus-scan hotkey
            </span>
            <IconButton
              icon={<X className="h-3 w-3" />}
              onClick={close}
              ariaLabel="Cancel reassign"
              className="inline-flex h-5 w-5 items-center justify-center rounded-full hover:bg-surface-sunken"
            />
          </div>

          <div className="mt-2 flex items-center gap-2">
            <kbd className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 font-mono text-xs font-semibold text-blue-700">
              {hotkey}
            </kbd>
            <span className="text-xs font-semibold text-text-muted">
              Press a key…
            </span>
          </div>

          <p
            className={cn(
              'mt-1.5 text-role-caption font-medium',
              error ? 'text-rose-600' : 'text-text-faint',
            )}
          >
            {error ?? 'Insert · ScrollLock · F1–F12 · Esc to cancel'}
          </p>
        </motion.div>
      </AnchoredLayer>
    </span>
  );
}
