'use client';

/**
 * Always-present Unbox dock keyboard entry — the wedge waist for every
 * procedure step except `serial` (that step mounts {@link UnboxSerialStepSurface}
 * as the entry).
 *
 * Sidebar Unbox scan is ingestion-only while this marker is mounted
 * (`[data-unbox-dock-scan]`). Submit meaning follows `activeKey`:
 *   - condition → grade letter / alias
 *   - contents / label → confirm ack (or advance when already stamped)
 *   - arrival_check / classify → positional next (›)
 *   - carton / item photos → Enter advances when the step is settled; empty no-op
 *
 * Capture stays pointer (Link · Send · camera). Notes mode swaps the leading
 * zone entirely — this surface does not mount then.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { emitReceiving } from '@/components/receiving/receiving-events';
import { dispatchLineUpdated } from '@/components/station/receiving-lines-table-helpers';
import { useReceivingEvents } from '@/hooks/useReceivingEvents';
import { CONDITION_GRADES, resolveConditionGrade } from '@/lib/conditions';
import { invalidateReceivingFeeds } from '@/lib/queries/receiving-queries';
import { toast } from '@/lib/toast';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import { useUnboxProcedureSteps } from './useUnboxProcedureSteps';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';

const PHOTO_KEYS = new Set([
  'shipping_label_photo',
  'box_photo',
  'packing_material',
  'item_photos',
]);

const ADVANCE_KEYS = new Set(['arrival_check', 'classify']);

function isKnownGrade(raw: string): string | null {
  const resolved = resolveConditionGrade(raw);
  return (CONDITION_GRADES as readonly string[]).includes(resolved)
    ? resolved
    : null;
}

function focusEntry(el: HTMLInputElement | null) {
  if (!el || el.disabled) return;
  el.focus({ preventScroll: true });
  el.select();
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
  const queryClient = useQueryClient();
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
    const t = window.setTimeout(() => focusEntry(inputRef.current), 0);
    return () => window.clearTimeout(t);
  }, [hidden, activeKey, row.id]);

  useReceivingEvents({
    'receiving-focus-scan': () => {
      if (hidden) return;
      requestAnimationFrame(() => focusEntry(inputRef.current));
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

  const onSubmit = useCallback(() => {
    if (!activeKey || !active) return;
    const raw = value.trim();

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

    if (ADVANCE_KEYS.has(activeKey)) {
      setValue('');
      advance();
      return;
    }

    if (PHOTO_KEYS.has(activeKey)) {
      // Empty Enter no-ops while pending; advance when evidence already settled.
      if (!raw && active.state !== 'done') {
        return;
      }
      setValue('');
      advance();
      return;
    }

    // Fallback: positional next when a neighbour exists.
    if (raw || active.state === 'done') {
      setValue('');
      advance();
    }
  }, [
    ackContents,
    ackLabel,
    active,
    activeKey,
    advance,
    onSetCondition,
    value,
  ]);

  if (hidden) return null;

  const placeholder =
    activeKey === 'condition'
      ? 'Grade…'
      : activeKey === 'contents' || activeKey === 'label'
        ? 'Enter to confirm'
        : ADVANCE_KEYS.has(activeKey)
          ? 'Enter to continue'
          : PHOTO_KEYS.has(activeKey)
            ? 'Enter when ready'
            : 'Scan…';

  return (
    <div
      className="flex h-11 w-full min-w-0 flex-1 items-center"
      data-unbox-dock-scan
      data-unbox-dock-scan-step={activeKey}
    >
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          e.stopPropagation();
          onSubmit();
        }}
        placeholder={placeholder}
        aria-label={`Dock entry — ${active?.label ?? 'procedure step'}`}
        autoComplete="off"
        spellCheck={false}
        className={cn(
          // Full-band wedge — never a content-sized chip on the flush floor.
          'box-border h-9 w-full min-w-0 flex-1 border border-border-soft bg-surface-sunken px-3',
          'text-role-caption text-text-default placeholder:text-text-faint',
          cornerClass('flush'),
          focusRing('control', 'neutral'),
        )}
        data-unbox-dock-scan-input
      />
    </div>
  );
}
