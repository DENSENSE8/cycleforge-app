'use client';

/**
 * Always-left Unbox dock procedure waist — compact scan cell twin of the
 * parked-rail {@link CollapseStripScanCell} (`w-8`, Plus idle, glow + caret
 * when focused, **no placeholder**). Step ACTION (ack · grades · photo strip)
 * owns the remaining Band 1 width to the right.
 *
 * `serial` mounts {@link UnboxSerialStepSurface} instead; `classify` owns Band 1
 * alone (grow editor). Sidebar Unbox scan stays ingestion-only while
 * `[data-unbox-dock-scan]` is mounted.
 *
 * Submit meaning follows `activeKey`:
 *   - condition → grade letter / alias
 *   - contents / label → confirm ack (or advance when already stamped)
 *   - photo strip keys → advance / skip (Link | Upload | Send sit to the right)
 *   - stage → location barcode
 *   - classify → positional next (›) when mounted
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus } from '@/components/Icons';
import { emitReceiving } from '@/components/receiving/receiving-events';
import { dispatchLineUpdated } from '@/components/station/receiving-lines-table-helpers';
import { ScanBandGlowHost } from '@/components/station/scan-bar/ScanBandGlowHost';
import {
  STATION_SCAN_BAR_COLLAPSE_HOVER_CLASS,
  STATION_SCAN_BAR_COLLAPSE_HOVER_DEFAULT_CLASS,
  STATION_SCAN_BAR_DEFAULT_BOTTOM_RULE_CLASS,
} from '@/components/station/scan-bar/tokens';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { useAuth } from '@/contexts/AuthContext';
import { useReceivingEvents } from '@/hooks/useReceivingEvents';
import { useStationTheme } from '@/hooks/useStationTheme';
import { CONDITION_GRADES, resolveConditionGrade } from '@/lib/conditions';
import { extractArrivalLocationBarcode } from '@/lib/receiving/arrival-command-routing';
import { invalidateReceivingFeeds } from '@/lib/queries/receiving-queries';
import { useRegisterScanSink } from '@/lib/station-scan-sink';
import { toast } from '@/lib/toast';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import { UNBOX_PHOTO_STRIP_KEYS } from './steps/dock/PhotoStepDockStrip';
import { useUnboxProcedureSteps } from './useUnboxProcedureSteps';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';

const ADVANCE_KEYS = new Set(['classify']);

/** Match parked-rail collapse strip + CONTEXT_PANEL_COLLAPSE.stripWidthPx. */
const DOCK_SCAN_CELL_WIDTH = 'w-8';
const DOCK_SCAN_ICON_CLASS = 'h-3.5 w-3.5';

function isKnownGrade(raw: string): string | null {
  const resolved = resolveConditionGrade(raw);
  return (CONDITION_GRADES as readonly string[]).includes(resolved)
    ? resolved
    : null;
}

function focusEntry(el: HTMLInputElement | null) {
  if (!el || el.disabled) return;
  el.focus({ preventScroll: true });
  // Caret blink — do not select-all (collapse-strip recipe).
  const len = el.value.length;
  el.setSelectionRange(len, len);
}

export function UnboxDockScanEntry({
  row,
  onSetCondition,
}: {
  row: ReceivingLineRow;
  /** Grade writer from the line controller — stamps via /condition SoT. */
  onSetCondition?: (grade: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { theme, inputBorder } = useStationTheme({
    staffId: user?.staffId ?? 0,
  });
  const collapseHover =
    STATION_SCAN_BAR_COLLAPSE_HOVER_CLASS[theme] ??
    STATION_SCAN_BAR_COLLAPSE_HOVER_DEFAULT_CLASS;
  const bottomRule = inputBorder || STATION_SCAN_BAR_DEFAULT_BOTTOM_RULE_CLASS;

  const {
    activeKey,
    steps,
    nextNeighbour,
    settled,
    focusStep,
  } = useUnboxProcedureSteps(row);

  const active = settled && activeKey
    ? steps.find((s) => s.key === activeKey)
    : null;

  // Serial step owns its own field — never dual-mount.
  const hidden = !settled || !activeKey || activeKey === 'serial';

  useEffect(() => {
    if (hidden) return;
    setValue('');
    const t = window.setTimeout(() => {
      setFocused(true);
      focusEntry(inputRef.current);
    }, 0);
    return () => window.clearTimeout(t);
  }, [hidden, activeKey, row.id]);

  useReceivingEvents({
    'receiving-focus-scan': () => {
      if (hidden) return;
      requestAnimationFrame(() => {
        setFocused(true);
        focusEntry(inputRef.current);
      });
    },
  });

  const advance = useCallback(() => {
    if (!nextNeighbour) return;
    focusStep(nextNeighbour.key);
    setTimeout(() => emitReceiving('receiving-focus-scan'), 60);
  }, [focusStep, nextNeighbour]);

  const ackContents = useCallback(async () => {
    const receivingId = row.receiving_id ?? 0;
    if (receivingId <= 0) return;
    if (row.contents_confirmed_at) {
      advance();
      return;
    }
    try {
      const res = await fetch(`/api/receiving/${receivingId}/contents-confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmed: true }),
      });
      if (!res.ok) throw new Error(String(res.status));
      if (row.id > 0) {
        dispatchLineUpdated({
          id: row.id,
          contents_confirmed_at: new Date().toISOString(),
        });
      }
      invalidateReceivingFeeds(queryClient);
    } catch {
      toast.error('Could not record the contents check.');
    } finally {
      setTimeout(() => emitReceiving('receiving-focus-scan'), 60);
    }
  }, [advance, queryClient, row.contents_confirmed_at, row.id, row.receiving_id]);

  const ackLabel = useCallback(async () => {
    if (row.id <= 0) return;
    if (row.label_previewed_at) {
      advance();
      return;
    }
    try {
      const res = await fetch(`/api/receiving/lines/${row.id}/label-previewed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmed: true }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const json = (await res.json()) as {
        line?: { label_previewed_at?: string | null };
      };
      dispatchLineUpdated({
        id: row.id,
        label_previewed_at: json.line?.label_previewed_at ?? new Date().toISOString(),
      });
    } catch {
      toast.error('Could not record the label check.');
    } finally {
      setTimeout(() => emitReceiving('receiving-focus-scan'), 60);
    }
  }, [advance, row.id, row.label_previewed_at]);

  const stageLocation = useCallback(
    async (rawBarcode: string) => {
      if (row.id <= 0) return;
      const code = extractArrivalLocationBarcode(rawBarcode) ?? rawBarcode.trim();
      if (!code) {
        toast.error('Scan a location barcode');
        return;
      }
      try {
        const res = await fetch(`/api/receiving/lines/${row.id}/stage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ barcode: code }),
        });
        const json = (await res.json().catch(() => null)) as {
          success?: boolean;
          error?: string;
          line?: { staged_at?: string | null; staged_location_id?: number | null };
          location?: {
            id: number;
            name: string;
            barcode: string | null;
            room: string | null;
          } | null;
        } | null;
        if (!res.ok || !json?.success) {
          toast.error(json?.error || 'Location not found');
          return;
        }
        dispatchLineUpdated({
          id: row.id,
          staged_at: json.line?.staged_at ?? new Date().toISOString(),
          staged_location_id: json.line?.staged_location_id ?? json.location?.id ?? null,
          staged_location_name: json.location?.name ?? null,
          staged_location_barcode: json.location?.barcode ?? null,
          staged_location_room: json.location?.room ?? null,
        });
        invalidateReceivingFeeds(queryClient);
        toast.success(
          json.location?.name
            ? `Staged → ${json.location.name}`
            : 'Location staged',
        );
      } catch {
        toast.error('Could not stage the location.');
      } finally {
        setTimeout(() => emitReceiving('receiving-focus-scan'), 60);
      }
    },
    [queryClient, row.id],
  );

  /**
   * Apply a dock payload — shared by Enter on the focused input and the
   * Action scan sink (wedge while focus is on a PO line / chrome).
   */
  const applyScan = useCallback(
    (rawInput: string) => {
      if (!activeKey || !active) return;
      const raw = rawInput.trim();

      if (activeKey === 'condition') {
        if (!raw) return;
        const grade = isKnownGrade(raw);
        if (!grade) {
          toast.error('Unknown grade — try A, B, C, NEW, …');
          setValue('');
          return;
        }
        onSetCondition?.(grade);
        setValue('');
        setTimeout(() => emitReceiving('receiving-focus-scan'), 60);
        return;
      }

      if (activeKey === 'contents') {
        setValue('');
        void ackContents();
        return;
      }

      if (activeKey === 'label') {
        setValue('');
        void ackLabel();
        return;
      }

      if (activeKey === 'stage') {
        if (!raw) return;
        setValue('');
        void stageLocation(raw);
        return;
      }

      // Photo steps: Enter / wedge advances (strip verbs stay pointer).
      if (UNBOX_PHOTO_STRIP_KEYS.has(activeKey)) {
        setValue('');
        advance();
        return;
      }

      if (ADVANCE_KEYS.has(activeKey)) {
        setValue('');
        advance();
        return;
      }

      // Fallback: positional next when a neighbour exists.
      if (raw || active.state === 'done') {
        setValue('');
        advance();
      }
    },
    [ackContents, ackLabel, active, activeKey, advance, onSetCondition, stageLocation],
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
  // Exclusive with UnboxSerialStepSurface (this surface is hidden on serial).
  useRegisterScanSink({
    // Shared with UnboxSerialStepSurface / Testing line adder — exclusive
    // mount per line under `po-line:` so mouse/↑↓ can setActiveSinkId.
    id: `po-line:${row.id}`,
    enabled: !hidden && row.id > 0,
    onScan: applyScan,
    focus: () => {
      setFocused(true);
      focusEntry(inputRef.current);
    },
  });

  if (hidden) return null;

  const ariaLabel = `Scan — ${active?.label ?? 'procedure step'}`;

  return (
    <div
      className={cn(
        'relative flex h-11 shrink-0 items-center justify-center',
        DOCK_SCAN_CELL_WIDTH,
      )}
      data-unbox-dock-scan
      data-unbox-dock-scan-step={activeKey}
      data-unbox-dock-scan-compact=""
      data-focused={focused ? 'true' : undefined}
    >
      {!focused ? (
        <HoverTooltip label={ariaLabel} asChild>
          <button
            type="button"
            aria-label={ariaLabel}
            data-unbox-dock-scan-idle=""
            className={cn(
              'ds-raw-button ds-allow-control-size',
              'flex h-11 w-full items-center justify-center border-0 border-b-2 border-b-transparent',
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
          'h-11 w-full',
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
          aria-label={ariaLabel}
          autoComplete="off"
          spellCheck={false}
          className={cn(
            'box-border h-11 w-full bg-transparent px-0 text-center',
            'text-role-micro font-semibold text-text-default outline-none',
            bottomRule,
          )}
          data-unbox-dock-scan-input
        />
      </ScanBandGlowHost>
    </div>
  );
}
