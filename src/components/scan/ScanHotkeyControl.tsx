'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Barcode, Check, Search } from '@/components/Icons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/design-system/primitives/DropdownMenu';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { isBindableFocusScanHotkey } from '@/lib/schemas/staff-preferences';
import {
  NEXT_SCAN_CHORD_LABEL,
  requestScanFocus,
  requestScanNext,
} from '@/lib/scan-hotkey/store';
import { useScanHotkey } from '@/lib/scan-hotkey/useScanHotkey';
import type { StationScanStance } from '@/components/station/scan-bar/scan-stance';
import { cn } from '@/utils/_cn';
import { focusRing } from '@/design-system/tokens/focus-ring';

interface ScanHotkeyControlProps {
  /** Current left-icon stance — decides the trigger glyph and the checked row. */
  stance: StationScanStance;
  /** Commit a stance pick from the menu. */
  onSelectStance: (stance: StationScanStance) => void;
  /** Custom glyph for the scan stance (preview always uses Search). */
  scanIcon?: ReactNode;
}

const GLYPH_CLASS = 'block size-[17px] transition-colors';

const STANCE_COPY: Record<
  StationScanStance,
  { label: string; hint: string }
> = {
  scan: { label: 'Scan', hint: 'Commits on Enter' },
  preview: { label: 'Preview', hint: 'Decode only — no write' },
};

/**
 * The scan bar's LEFT control — one dropdown in the 17px leading icon slot.
 *
 * Replaces the old stance-toggle-plus-hover-gear pair (two hit targets stacked
 * in one 17px box, one of them only reachable by hovering the bar). The face is
 * the live stance glyph; the menu carries every scan-entry decision:
 *
 *   Scan · Preview  — the stance, checked (name only; the hint lives on the
 *                     trigger tooltip, not repeated on every row)
 *   Focus scan bar  — runs the reclaim key
 *   Edit hotkey     — inline key capture (row stays open while capturing)
 *   Next scan       — runs the fixed {@link NEXT_SCAN_CHORD_LABEL} chord
 *
 * The trigger never steals the wedge: Radix returns focus to it on close and
 * the bar's own focus-scan hotkey stays bound to the input.
 */
export function ScanHotkeyControl({
  stance,
  onSelectStance,
  scanIcon,
}: ScanHotkeyControlProps) {
  const { hotkey, setHotkey, setCapturing } = useScanHotkey();
  const [open, setOpen] = useState(false);
  const [rebinding, setRebinding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stopRebinding = useCallback(() => {
    setRebinding(false);
    setError(null);
  }, []);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (!next) stopRebinding();
    },
    [stopRebinding],
  );

  // Capture only while "Edit hotkey" is armed — opening the menu alone never
  // swallows the next keystroke.
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
        stopRebinding();
        return;
      }
      // Next-scan is a fixed modifier chord — never capture Meta/Ctrl+. here.
      if (e.metaKey || e.ctrlKey || e.altKey) {
        setError(`Next scan is fixed at ${NEXT_SCAN_CHORD_LABEL}`);
        return;
      }
      if (isBindableFocusScanHotkey(e.key)) {
        setHotkey(e.key);
        stopRebinding();
        return;
      }
      setError('That key is reserved — try another');
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      setCapturing(false);
    };
  }, [open, rebinding, setHotkey, setCapturing, stopRebinding]);

  const glyph =
    stance === 'preview' ? (
      <Search className={GLYPH_CLASS} />
    ) : (
      (scanIcon ?? <Barcode className={GLYPH_CLASS} />)
    );

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <HoverTooltip
        label={`${STANCE_COPY[stance].label} — ${STANCE_COPY[stance].hint}. Click for scan options.`}
        asChild
      >
        <DropdownMenuTrigger asChild>
          {/* ds-raw-button: 17px leading slot inside the scan band — the icon IS
              the whole hit target; an IconButton box would break the slot. */}
          <button
            type="button"
            aria-label={`Scan entry options. Stance ${STANCE_COPY[stance].label}. Reclaim key ${hotkey}.`}
            className={cn(
              'ds-raw-button inline-flex size-[17px] items-center justify-center rounded-none leading-none',
              focusRing('control', 'neutral'),
              open ? 'text-blue-600' : 'text-text-soft hover:text-blue-600',
            )}
          >
            {glyph}
          </button>
        </DropdownMenuTrigger>
      </HoverTooltip>

      <DropdownMenuContent align="start" sideOffset={8} className="min-w-[13rem]">
        {(['scan', 'preview'] as const).map((value) => {
          const active = stance === value;
          return (
            <DropdownMenuItem
              key={value}
              onSelect={() => onSelectStance(value)}
              className="justify-between"
              aria-checked={active}
              role="menuitemradio"
            >
              <span className="flex items-center gap-2">
                {value === 'preview' ? (
                  <Search className="size-4" />
                ) : (
                  <Barcode className="size-4" />
                )}
                <span className="text-role-caption font-semibold">
                  {STANCE_COPY[value].label}
                </span>
              </span>
              {active ? <Check className="size-4 text-text-soft" /> : null}
            </DropdownMenuItem>
          );
        })}

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onSelect={() => requestScanFocus()}
          className="justify-between"
        >
          <span className="text-role-caption font-semibold">Focus scan bar</span>
          <kbd className="rounded-none border border-border-soft bg-surface-canvas px-1.5 py-0.5 font-mono text-role-micro font-semibold text-text-muted">
            {hotkey}
          </kbd>
        </DropdownMenuItem>

        <DropdownMenuItem
          // Stay open — the row becomes the capture surface.
          onSelect={(event) => {
            event.preventDefault();
            setError(null);
            setRebinding(true);
          }}
          className="justify-between"
        >
          <span className="text-role-caption font-semibold">Edit hotkey</span>
          {rebinding ? (
            <span className="text-role-caption font-semibold text-blue-600">
              Press a key…
            </span>
          ) : null}
        </DropdownMenuItem>

        {rebinding ? (
          <p
            className={cn(
              'px-2 pb-1 text-role-micro font-semibold',
              error ? 'text-rose-600' : 'text-text-faint',
            )}
          >
            {error ?? 'Any key · Esc to cancel'}
          </p>
        ) : null}

        <DropdownMenuItem
          onSelect={() => requestScanNext()}
          className="justify-between"
        >
          <span className="text-role-caption font-semibold">Next scan</span>
          <kbd className="rounded-none border border-blue-200 bg-blue-50 px-1.5 py-0.5 font-mono text-role-micro font-semibold text-blue-700">
            {NEXT_SCAN_CHORD_LABEL}
          </kbd>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
