'use client';

/**
 * Arrival dock **procedure** waist — scan a shelf, place the carton in front of
 * you. Compact `w-8` scan cell, twin of the Unbox {@link UnboxDockScanEntry}
 * and the parked-rail `CollapseStripScanCell`: Plus idle, glow + caret when
 * focused, **no placeholder**. It leads the shelf/lane row of
 * {@link ArrivalStagingDockControl} as a full-height abutting segment — never a
 * content-sized chip floating in dead white.
 *
 * Why this exists: Arrival's scan bar could only take a shelf inside a
 * `batch_sort` session armed by a physical `CMD-*` sticker, and a location
 * scanned there commits a BATCH — so on the open carton, the state an operator
 * is in for essentially the whole shift, scanning a shelf did nothing at all.
 * The only way to record placement was a mouse-driven `<select>`, at a bench
 * where both hands are on the box and a wedge. That is the complete explanation
 * for `staging_location_id` sitting at zero human writes across 2474 cartons —
 * operators stage constantly; the product asked them for a mouse.
 *
 * **Two loci, and this is the second one.** The left sidebar `StationScanBar` is
 * *ingest* (which carton); this cell is *procedure* (which shelf). It therefore
 * does NOT call `useRegisterScanTarget` — the Insert / F-key focus hotkey keeps
 * pointing at ingest — and a payload it does not own (a tracking) is handed
 * back to ingest via `receiving-submit-tracking` rather than swallowed.
 *
 * Storage is Arrival's own: `receiving_triage.staging_location_id` (+ lane) via
 * `useTriageStaging.selectShelf`, which owns the lane auto-route and its
 * manual-wins rule. **Never** the Unbox line putaway (`receiving_line_putaway`)
 * or the packing-desk ledger (`order_pack_placements`) — three jobs, three
 * lifetimes, three storages; what ports between stations is the INTERACTION.
 */

import { useCallback, useRef, useState, type MouseEvent } from 'react';
import { Plus } from '@/components/Icons';
import { emitReceiving } from '@/components/receiving/receiving-events';
import { ScanBandGlowHost } from '@/components/station/scan-bar/ScanBandGlowHost';
import {
  STATION_SCAN_BAR_COLLAPSE_HOVER_CLASS,
  STATION_SCAN_BAR_COLLAPSE_HOVER_DEFAULT_CLASS,
  STATION_SCAN_BAR_DEFAULT_BOTTOM_RULE_CLASS,
} from '@/components/station/scan-bar/tokens';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { useAuth } from '@/contexts/AuthContext';
import { useReceivingEvents } from '@/hooks/useReceivingEvents';
import {
  classifyArrivalCartonScan,
  findLocationByBarcode,
} from '@/lib/receiving/arrival-carton-scan';
import { useRegisterScanSink } from '@/lib/station-scan-sink';
import { useStationTheme } from '@/hooks/useStationTheme';
import { toast } from '@/lib/toast';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import type { TriageStagingController } from './useTriageStaging';

/** Match the parked-rail collapse strip + Unbox dock waist. */
const DOCK_SCAN_CELL_WIDTH = 'w-8';
const DOCK_SCAN_ICON_CLASS = 'h-3.5 w-3.5';

const ARIA_LABEL = 'Scan a location barcode to place this carton';

function focusEntry(el: HTMLInputElement | null) {
  if (!el || el.disabled) return;
  el.focus({ preventScroll: true });
  // Caret blink — do not select-all (collapse-strip recipe).
  const len = el.value.length;
  el.setSelectionRange(len, len);
}

export function ArrivalDockScanEntry({
  receivingId,
  staging,
}: {
  /** Carton-level anchor — Arrival staging is carton-scoped (unfound cartons
   *  have no lines, so this must never route through a line-scoped write). */
  receivingId: number | null | undefined;
  staging: TriageStagingController;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);
  const { user } = useAuth();
  const { theme, inputBorder } = useStationTheme({ staffId: user?.staffId ?? 0 });
  const collapseHover =
    STATION_SCAN_BAR_COLLAPSE_HOVER_CLASS[theme] ??
    STATION_SCAN_BAR_COLLAPSE_HOVER_DEFAULT_CLASS;
  const bottomRule = inputBorder || STATION_SCAN_BAR_DEFAULT_BOTTOM_RULE_CLASS;

  const { locations, selectShelf, refreshCatalog } = staging;
  const enabled = typeof receivingId === 'number' && receivingId > 0;

  useReceivingEvents({
    'receiving-focus-scan': () => {
      if (!enabled) return;
      requestAnimationFrame(() => {
        setFocused(true);
        focusEntry(inputRef.current);
      });
    },
  });

  /**
   * Resolve a decoded shelf code → location id. The catalog the dock already
   * holds answers instantly (and keeps the dock's own shelf summary coherent);
   * the API is the authority when it does not, because that catalog query is
   * filtered to real bins.
   */
  const resolveLocation = useCallback(
    async (barcode: string): Promise<{ id: number; name: string } | null> => {
      const cached = findLocationByBarcode(barcode, locations);
      if (cached) return { id: cached.id, name: cached.name };
      try {
        const res = await fetch(`/api/locations/${encodeURIComponent(barcode)}`, {
          cache: 'no-store',
        });
        const data = (await res.json().catch(() => ({}))) as {
          location?: { id?: number; name?: string };
          error?: string;
        };
        if (!res.ok || data.location?.id == null) {
          toast.error(data.error || `Shelf not found: ${barcode}`);
          return null;
        }
        // The catalog in hand did not carry this shelf, so it is stale — pull it
        // again or the picker and the shelf summary will deny the placement we
        // are about to make.
        refreshCatalog();
        return { id: data.location.id, name: data.location.name ?? barcode };
      } catch {
        toast.error('Could not look up that shelf.');
        return null;
      }
    },
    [locations, refreshCatalog],
  );

  const placeCarton = useCallback(
    async (barcode: string) => {
      const location = await resolveLocation(barcode);
      if (!location) return;
      // selectShelf owns the lane auto-route (manual lane always wins) and the
      // optimistic broadcast — never PATCH priority_lane from here.
      const ok = await selectShelf(location.id);
      // Only claim the placement landed when it did; selectShelf already
      // reported the failure and rolled its optimistic state back.
      if (ok) toast.success(`Staged → ${location.name}`);
    },
    [resolveLocation, selectShelf],
  );

  /**
   * Apply a dock payload — shared by Enter on the focused input and the Action
   * scan sink (wedge while focus sits on the centre / chrome).
   */
  const applyScan = useCallback(
    (rawInput: string) => {
      const scan = classifyArrivalCartonScan(rawInput);
      if (!scan.raw) return;
      setValue('');

      if (scan.kind === 'location') {
        void placeCarton(scan.locationBarcode);
        setTimeout(() => emitReceiving('receiving-focus-scan'), 60);
        return;
      }

      // Not ours — hand the tracking back to the ingest bar unchanged rather
      // than eating a scan the operator meant for the next carton.
      emitReceiving('receiving-submit-tracking', { tracking: scan.raw });
    },
    [placeCarton],
  );

  const onSubmit = useCallback(() => {
    applyScan(value);
  }, [applyScan, value]);

  const arm = useCallback((e?: MouseEvent) => {
    e?.stopPropagation();
    setFocused(true);
    requestAnimationFrame(() => focusEntry(inputRef.current));
  }, []);

  // Action sink — wedge while focus is NOT in this input (row / chrome).
  // Carton-scoped id: Arrival places the carton, not a line.
  useRegisterScanSink({
    id: `arrival-carton:${receivingId ?? 0}`,
    enabled,
    onScan: applyScan,
    focus: () => {
      setFocused(true);
      focusEntry(inputRef.current);
    },
  });

  if (!enabled) return null;

  return (
    <div
      className={cn(
        'relative flex h-full shrink-0 items-center justify-center self-stretch',
        DOCK_SCAN_CELL_WIDTH,
      )}
      data-arrival-dock-scan
      data-focused={focused ? 'true' : undefined}
    >
      {!focused ? (
        <HoverTooltip label={ARIA_LABEL} asChild>
          <button
            type="button"
            aria-label={ARIA_LABEL}
            data-arrival-dock-scan-idle=""
            className={cn(
              'ds-raw-button ds-allow-control-size',
              'flex h-full w-full items-center justify-center border-0 border-b-2 border-b-transparent',
              'text-text-faint transition-colors',
              focusRing('control', 'neutral'),
              collapseHover,
            )}
            onClick={arm}
          >
            <Plus className={DOCK_SCAN_ICON_CLASS} aria-hidden />
          </button>
        </HoverTooltip>
      ) : null}

      {/* Keep the input mounted while idle so receiving-focus-scan can land. */}
      <ScanBandGlowHost
        themeColor={theme}
        className={cn(
          'h-full w-full',
          focused ? 'relative' : 'pointer-events-none absolute inset-0 opacity-0',
        )}
      >
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            e.stopPropagation();
            onSubmit();
          }}
          // No placeholder — glow + caret are the focus signal (collapse-strip twin).
          placeholder=""
          aria-label={ARIA_LABEL}
          autoComplete="off"
          spellCheck={false}
          className={cn(
            'box-border h-full w-full bg-transparent px-0 text-center',
            'text-role-micro font-semibold text-text-default outline-none',
            bottomRule,
          )}
          data-arrival-dock-scan-input
        />
      </ScanBandGlowHost>
    </div>
  );
}
