'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from '@/design-system/motion';
import { Settings, X } from '@/components/Icons';
import { AnchoredLayer } from '@/design-system/primitives/AnchoredLayer';
import { IconButton } from '@/design-system/primitives';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { isBindableFocusScanHotkey } from '@/lib/schemas/staff-preferences';
import {
  NEXT_SCAN_CHORD_LABEL,
  requestScanFocus,
  requestScanNext,
} from '@/lib/scan-hotkey/store';
import { useScanHotkey } from '@/lib/scan-hotkey/useScanHotkey';
import { cn } from '@/utils/_cn';
import { focusRing } from '@/design-system/tokens/focus-ring';


interface ScanHotkeyControlProps {
  /** The bar's contextual left icon (scan glyph / mode indicator) shown at rest. */
  children: ReactNode;
}

/**
 * The shared scan-bar hotkey affordance that lives in EVERY StationScanBar's
 * left icon slot (Ticket · Tracking · PO ingestion).
 *
 * At rest the bar's contextual icon shows. On bar hover the icon cross-fades to
 * a gear in the same 17px slot (opacity only — no slide, no padding push).
 *
 * Popover:
 *   - Click ⌘. → arm next scan (clear + focus) — does NOT enter rebind
 *   - Click reclaim chip → focus scan bar — does NOT enter rebind
 *   - Explicit “Change key” enters capture; any non-reserved key binds
 *
 * Slot geometry comes from `STATION_SCAN_BAR_ICON_SLOT_CLASS` /
 * `SIDEBAR_RAIL_DOT_TRACK` — do not add per-caller `-ml-1` or hover `pl-*`.
 */
export function ScanHotkeyControl({ children }: ScanHotkeyControlProps) {
  const { hotkey, setHotkey, setCapturing } = useScanHotkey();
  const [open, setOpen] = useState(false);
  const [rebinding, setRebinding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const gearRef = useRef<HTMLButtonElement>(null);

  // Close + blur the gear. Capturing a key flips the button into :focus-visible
  // (it's keyboard focus now), which would otherwise pin the gear visible via
  // focus-visible:opacity-100 even after the mouse leaves. Blurring clears that.
  const close = useCallback(() => {
    setOpen(false);
    setRebinding(false);
    setError(null);
    gearRef.current?.blur();
  }, []);

  const runNextScan = useCallback(() => {
    requestScanNext();
    close();
  }, [close]);

  const runReclaim = useCallback(() => {
    requestScanFocus();
    close();
  }, [close]);

  // Capture only while “Change key” is armed — opening the popover alone never
  // steals the next keystroke (chips are click-to-run).
  useEffect(() => {
    if (!open || !rebinding) {
      setCapturing(false);
      return;
    }
    setCapturing(true);
    setError(null);
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        setRebinding(false);
        setError(null);
        return;
      }
      // Next-scan is a fixed modifier chord — never capture Meta/Ctrl+. here.
      if (e.metaKey || e.ctrlKey || e.altKey) {
        setError(`Next scan is fixed at ${NEXT_SCAN_CHORD_LABEL} — pick a reclaim key`);
        return;
      }
      if (isBindableFocusScanHotkey(e.key)) {
        setHotkey(e.key);
        setRebinding(false);
        setError(null);
        return;
      }
      setError('That key is reserved — try another');
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      setCapturing(false);
    };
  }, [open, rebinding, setHotkey, setCapturing]);

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

      {/* Gear — same box as the resting icon; opacity cross-fade only. */}
      <HoverTooltip
        label={`Next scan ${NEXT_SCAN_CHORD_LABEL} · reclaim ${hotkey}. Click for details.`}
        asChild
      >
        <button
          ref={gearRef}
          type="button"
          onClick={() => (open ? close() : setOpen(true))}
          aria-label={`Next scan ${NEXT_SCAN_CHORD_LABEL}. Reclaim focus is ${hotkey}. Click for scan-bar hotkeys.`}
          className={cn(
            'ds-raw-button',
            cn('absolute inset-0 inline-flex items-center justify-center rounded-md text-text-soft transition-opacity duration-150 hover:text-blue-600 focus-visible:opacity-100', focusRing('control', 'neutral')),
            // Visual-only over the stance glyph — a corner chip below is the hit target
            // so hover does not steal Preview/Scan clicks (phase 2 leftover).
            'pointer-events-none',
            open
              ? 'opacity-100 text-blue-600'
              : 'opacity-0 group-hover:opacity-70',
          )}
        >
          <Settings className="block size-[17px]" />
        </button>
      </HoverTooltip>
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        tabIndex={-1}
        aria-hidden
        className={
          'ds-raw-button absolute -right-0.5 -bottom-0.5 z-raised size-2.5 rounded-sm '
          + 'bg-surface-card text-text-soft shadow-sm ring-1 ring-border-soft '
          + (open
            ? 'pointer-events-auto opacity-100'
            : 'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100')
        }
      >
        <Settings className="block size-2.5" />
      </button>

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
              Scan bar hotkeys
            </span>
            <IconButton
              icon={<X className="h-3 w-3" />}
              onClick={close}
              ariaLabel="Close"
              className="inline-flex h-5 w-5 items-center justify-center rounded-full hover:bg-surface-sunken"
            />
          </div>

          {/* Primary — next scan (fixed house default). Click runs it. */}
          <button
            type="button"
            onClick={runNextScan}
            className={cn(
              'ds-raw-button',
              'mt-2 flex w-full items-center gap-2 rounded-md px-1 py-1 text-left transition-colors hover:bg-surface-sunken',
            )}
            aria-label={`Run next scan (${NEXT_SCAN_CHORD_LABEL})`}
          >
            <kbd className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 font-mono text-xs font-semibold text-blue-700">
              {NEXT_SCAN_CHORD_LABEL}
            </kbd>
            <span className="text-xs font-semibold text-text-muted">
              Next scan — clear + focus
            </span>
          </button>

          {/* Secondary — reclaim: click runs focus; Change key rebinds. */}
          <div className="mt-2.5 border-t border-border-soft/70 pt-2.5">
            <p className="text-role-eyebrow uppercase tracking-wider text-text-faint">
              Reclaim focus
            </p>
            <div className="mt-1.5 flex items-center gap-2">
              <button
                type="button"
                onClick={rebinding ? undefined : runReclaim}
                disabled={rebinding}
                className={cn(
                  'ds-raw-button',
                  'rounded-md border border-border-soft bg-surface-canvas px-2 py-1 font-mono text-xs font-semibold text-text-muted transition-colors',
                  rebinding
                    ? 'cursor-default opacity-70'
                    : 'hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700',
                )}
                aria-label={
                  rebinding
                    ? `Current reclaim key ${hotkey}. Waiting for a new key.`
                    : `Focus scan bar (reclaim). Bound to ${hotkey}.`
                }
              >
                {hotkey}
              </button>
              {rebinding ? (
                <span className="text-xs font-semibold text-blue-600">Press a key…</span>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setRebinding(true);
                  }}
                  className="ds-raw-button text-xs font-semibold text-blue-600 hover:underline"
                >
                  Change key
                </button>
              )}
            </div>
            <p
              className={cn(
                'mt-1.5 text-role-caption font-medium',
                error ? 'text-rose-600' : 'text-text-faint',
              )}
            >
              {error ??
                (rebinding
                  ? 'Any key · Esc to cancel'
                  : 'Click a key to run it · Change key to rebind')}
            </p>
          </div>
        </motion.div>
      </AnchoredLayer>
    </span>
  );
}
