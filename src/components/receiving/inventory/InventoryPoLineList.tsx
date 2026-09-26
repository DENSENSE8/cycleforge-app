'use client';

/**
 * Shared inventory PO line list — Unbox Inventory
 * Displays instrument mode (edge-to-edge editable line notes).
 */

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Loader2 } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import {
  DenseComposeBodyBand,
  DenseComposeBodyTextarea,
  WORKSPACE_NESTED_FIELD,
  WORKSPACE_NESTED_FIELD_PAD,
} from '@/design-system/components';
import { cornerClass } from '@/design-system/tokens/radius';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { QUEUE_ROW } from '@/components/ui/queue-row-chrome';
import { parseSerialFromLineDescription } from '@/lib/zoho-po-prefill';
import { deriveReceivingLineStatus } from '@/lib/receiving/workflow-stages';
import { isZohoReceivedLikeStatus } from '@/lib/receiving/zoho-received-status';
import { cn } from '@/utils/_cn';
import type { DetailsResponse } from '@/components/sidebar/receiving/incoming-details/incoming-details-shared';
import { Row } from '@/components/sidebar/receiving/incoming-details/incoming-details-primitives';

type LineItem = DetailsResponse['line_items'][number];

const COARSE_FACE: Record<string, string> = {
  INCOMING: 'Incoming',
  SCANNED: 'Scanned',
  UNBOXED: 'Unboxed',
  RECEIVED: 'Received',
};

/**
 * Trust face for a PO line — prefer vendor PO receipt (same plane as
 * Information's RECEIVED chip) when local qty still shows received. After
 * Unreceive, qty is 0 while Zoho status may lag until Refresh — prefer local
 * workflow so Lines do not contradict the dock.
 */
function lineTrustStatusLabel(
  workflowStatus: string | null | undefined,
  poStatus: string | null | undefined,
  quantityReceived?: number,
): string | null {
  const localQty = Number(quantityReceived ?? 0);
  if (localQty > 0 && isZohoReceivedLikeStatus(poStatus)) return 'Received';
  const poOpen = Boolean(String(poStatus ?? '').trim()) && !isZohoReceivedLikeStatus(poStatus);
  if (poOpen && localQty > 0) return 'Unboxed';
  if (!(workflowStatus || '').trim()) return null;
  return COARSE_FACE[deriveReceivingLineStatus(workflowStatus)] ?? null;
}

function lineKey(line: LineItem, idx: number): string {
  return String(line.line_item_id || line.receiving_line_id || `line-${idx}`);
}

export function InventoryPoLineList({
  lines,
  focusReceivingLineId = null,
  editable = false,
  /** Edge-to-edge editable line notes (Unbox Inventory instrument). */
  inlineNotes = false,
  /** Linked inventory PO status (dossier `po.status`) — drives Received trust face. */
  poStatus = null,
  onSaveDescription,
  savingLineId = null,
  /** Roving keyboard focus index among line instruments (−1 = none). */
  focusIndex = -1,
  onFocusIndexChange,
}: {
  lines: LineItem[];
  focusReceivingLineId?: number | null;
  editable?: boolean;
  inlineNotes?: boolean;
  poStatus?: string | null;
  onSaveDescription?: (line: LineItem, description: string | null) => void | Promise<void>;
  savingLineId?: number | null;
  focusIndex?: number;
  onFocusIndexChange?: (index: number) => void;
}) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [draftByKey, setDraftByKey] = useState<Record<string, string>>({});
  const prevServerDesc = useRef<Record<string, string>>({});
  const textareaRefs = useRef<Map<string, HTMLTextAreaElement>>(new Map());

  useEffect(() => {
    setDraftByKey((prev) => {
      const next = { ...prev };
      const serverNow: Record<string, string> = {};
      for (let idx = 0; idx < lines.length; idx++) {
        const line = lines[idx]!;
        const key = lineKey(line, idx);
        const server = line.description ?? '';
        serverNow[key] = server;
        const priorServer = prevServerDesc.current[key];
        if (next[key] === undefined || (priorServer !== undefined && next[key] === priorServer)) {
          next[key] = server;
        }
      }
      prevServerDesc.current = serverNow;
      return next;
    });
  }, [lines]);

  // When parent roving focus lands on a line, put caret in its notes field.
  useEffect(() => {
    if (!inlineNotes || focusIndex < 0 || focusIndex >= lines.length) return;
    const line = lines[focusIndex]!;
    const key = lineKey(line, focusIndex);
    const el = textareaRefs.current.get(key);
    if (el && document.activeElement !== el) {
      el.focus({ preventScroll: true });
    }
  }, [focusIndex, inlineNotes, lines]);

  // Seed roving focus + scroll to the workspace-active line (middle twin).
  useEffect(() => {
    if (focusReceivingLineId == null || lines.length === 0) return;
    const idx = lines.findIndex(
      (l) =>
        l.receiving_line_id != null && l.receiving_line_id === focusReceivingLineId,
    );
    if (idx < 0) return;
    onFocusIndexChange?.(idx);
    requestAnimationFrame(() => {
      document
        .querySelector(`[data-inventory-line-id="${focusReceivingLineId}"]`)
        ?.scrollIntoView({ block: 'nearest' });
    });
    // lines.length only — avoid resetting focus on every description refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusReceivingLineId, lines.length]);

  if (lines.length === 0) {
    return (
      <p className="px-2 py-4 text-center text-role-caption font-medium text-text-faint">
        No lines — Refresh to pull from inventory.
      </p>
    );
  }

  if (inlineNotes) {
    return (
      <ul
        className="divide-y divide-border-hairline"
        data-testid="inventory-po-line-list"
        data-inline-notes="true"
        data-inventory-instrument="lines"
      >
        {lines.map((line, idx) => {
          const key = lineKey(line, idx);
          const isActive =
            focusReceivingLineId != null &&
            line.receiving_line_id != null &&
            line.receiving_line_id === focusReceivingLineId;
          const isFocused = focusIndex === idx;
          const label = (line.sku || line.name || 'Line').trim() || 'Line';
          const qty = `${line.quantity_received}/${line.quantity_expected}`;
          const rateLabel =
            line.rate != null && Number.isFinite(line.rate)
              ? `$${Number(line.rate).toFixed(2)}`
              : null;
          const totalLabel =
            line.item_total != null && Number.isFinite(line.item_total)
              ? `$${Number(line.item_total).toFixed(2)}`
              : null;
          const canEdit =
            editable &&
            line.receiving_line_id != null &&
            Number.isFinite(line.receiving_line_id) &&
            line.receiving_line_id > 0;
          const draft = draftByKey[key] ?? (line.description ?? '');
          const saving =
            savingLineId != null &&
            line.receiving_line_id != null &&
            savingLineId === line.receiving_line_id;
          const dirty = draft.trim() !== (line.description ?? '').trim();
          const noteId = `inventory-line-note-${key}`;
          const snFace = parseSerialFromLineDescription(draft || line.description);
          const lineIdAttr =
            line.receiving_line_id != null ? String(line.receiving_line_id) : undefined;

          return (
            <li
              key={key}
              className={cn(
                // Station selected face — same opacity semantics as middle PoLineRow.
                isActive && QUEUE_ROW.selectedStationClass,
                isActive && 'ring-inset ring-2 ring-accent-bg/50',
                isFocused && !isActive && 'ring-inset ring-1 ring-accent-bg/40',
              )}
              data-inventory-line-instrument={idx}
              data-inventory-line-id={lineIdAttr}
              data-inventory-line-active={isActive ? 'true' : undefined}
              aria-current={isActive ? 'true' : undefined}
            >
              {/* Identity face — keyboard target for ↑↓ roving */}
              <button
                type="button"
                tabIndex={isFocused ? 0 : -1}
                className={cn(
                  'flex w-full items-center justify-between gap-2 border-b border-border-hairline px-2 py-1.5 text-left',
                  focusRing('control', 'accent'),
                  'outline-none',
                )}
                onFocus={() => onFocusIndexChange?.(idx)}
                onClick={() => {
                  onFocusIndexChange?.(idx);
                  textareaRefs.current.get(key)?.focus();
                }}
                aria-label={`${label}, ${qty}${isActive ? ', active line' : ''}`}
              >
                <span className="min-w-0 flex-1 overflow-hidden">
                  <span className="flex min-w-0 items-baseline gap-1.5">
                    <span className="truncate text-role-caption font-semibold text-text-default">
                      {label}
                    </span>
                    {isActive ? (
                      <span className="shrink-0 text-role-eyebrow font-semibold uppercase tracking-wider text-accent-bg">
                        Active
                      </span>
                    ) : null}
                  </span>
                  {snFace ? (
                    <span className="mt-0.5 block truncate text-role-micro text-text-muted">
                      SN: {snFace}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-right text-role-caption font-semibold tabular-nums text-text-default">
                  <span className="block">{qty}</span>
                  {rateLabel ? (
                    <span className="mt-0.5 block text-role-micro font-medium text-text-muted">
                      {rateLabel}
                      {totalLabel ? ` · ${totalLabel}` : ''}
                    </span>
                  ) : null}
                  {(() => {
                    const trust = lineTrustStatusLabel(
                      line.workflow_status,
                      poStatus,
                      line.quantity_received,
                    );
                    return trust ? (
                      <span className="mt-0.5 block text-role-eyebrow uppercase tracking-wider text-text-soft">
                        {trust}
                      </span>
                    ) : null;
                  })()}
                </span>
              </button>

              {canEdit ? (
                <DenseComposeBodyBand>
                  <DenseComposeBodyTextarea
                    id={noteId}
                    ref={(el) => {
                      if (el) textareaRefs.current.set(key, el);
                      else textareaRefs.current.delete(key);
                    }}
                    rows={3}
                    aria-label={`Line notes for ${label}`}
                    value={draft}
                    onFocus={() => onFocusIndexChange?.(idx)}
                    onChange={(e) =>
                      setDraftByKey((prev) => ({ ...prev, [key]: e.target.value }))
                    }
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                        e.preventDefault();
                        if (dirty && onSaveDescription) {
                          void onSaveDescription(line, draft.trim() || null);
                        }
                        return;
                      }
                      if (e.key === 'ArrowDown' && e.altKey) {
                        e.preventDefault();
                        onFocusIndexChange?.(Math.min(lines.length - 1, idx + 1));
                      }
                      if (e.key === 'ArrowUp' && e.altKey) {
                        e.preventDefault();
                        onFocusIndexChange?.(Math.max(0, idx - 1));
                      }
                    }}
                    placeholder="Line description from inventory (serial · condition text after receive)"
                    className="min-h-[4.5rem]"
                  />
                  {dirty ? (
                    <div className="absolute bottom-1 right-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={saving || !onSaveDescription}
                        loading={saving}
                        icon={
                          saving ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Check className="h-3.5 w-3.5" />
                          )
                        }
                        onClick={() => {
                          if (!onSaveDescription) return;
                          void onSaveDescription(line, draft.trim() || null);
                        }}
                        ariaLabel="Save line notes"
                      >
                        {saving ? '…' : 'Save'}
                      </Button>
                    </div>
                  ) : null}
                </DenseComposeBodyBand>
              ) : (
                <p className="bg-surface-sunken px-2 py-2 text-role-caption text-text-muted">
                  {(line.description ?? '').trim() || '—'}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <ul
      className={cn(
        'divide-y divide-border-hairline overflow-hidden border border-border-hairline',
        cornerClass('flush'),
      )}
      data-testid="inventory-po-line-list"
    >
      {lines.map((line, idx) => {
        const key = lineKey(line, idx);
        const isActive =
          focusReceivingLineId != null &&
          line.receiving_line_id != null &&
          line.receiving_line_id === focusReceivingLineId;
        const label = (line.sku || line.name || 'Line').trim() || 'Line';
        const qty = `${line.quantity_received}/${line.quantity_expected}`;
        const canEdit =
          editable &&
          line.receiving_line_id != null &&
          Number.isFinite(line.receiving_line_id) &&
          line.receiving_line_id > 0;
        const showEditor = editable && expandedKey === key;
        const draft = draftByKey[key] ?? (line.description ?? '');
        const saving =
          savingLineId != null &&
          line.receiving_line_id != null &&
          savingLineId === line.receiving_line_id;
        const dirty = draft.trim() !== (line.description ?? '').trim();

        return (
          <li key={key} className={cn(isActive && 'bg-surface-sunken')}>
            <button
              type="button"
              className={cn(
                'flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left',
                canEdit && 'hover:bg-surface-sunken/50',
                !canEdit && 'cursor-default',
              )}
              disabled={!canEdit}
              onClick={() => {
                if (!canEdit) return;
                setExpandedKey((prev) => (prev === key ? null : key));
                setDraftByKey((prev) =>
                  prev[key] != null ? prev : { ...prev, [key]: line.description ?? '' },
                );
              }}
              aria-expanded={showEditor}
            >
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1 truncate text-role-caption font-semibold text-text-default">
                  {canEdit ? (
                    showEditor ? (
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-text-soft" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-text-soft" />
                    )
                  ) : null}
                  <span className="truncate">{label}</span>
                </p>
                {line.name && line.sku ? (
                  <p className="mt-0.5 truncate text-role-caption text-text-muted">{line.name}</p>
                ) : null}
                {!showEditor && line.description ? (
                  <p className="mt-1 line-clamp-2 text-role-micro text-text-soft">
                    {line.description}
                  </p>
                ) : null}
              </div>
              <p className="shrink-0 text-role-caption font-semibold tabular-nums text-text-default">
                {qty}
              </p>
            </button>

            {showEditor ? (
              <div className="space-y-2 border-t border-border-hairline bg-surface-sunken/40 px-3 py-3">
                <Row label="Item id" value={line.item_id ?? '—'} copyValue={line.item_id} />
                <Row
                  label="Line id"
                  value={line.line_item_id ?? '—'}
                  copyValue={line.line_item_id}
                />
                <textarea
                  rows={4}
                  aria-label="Item description"
                  value={draft}
                  onChange={(e) =>
                    setDraftByKey((prev) => ({ ...prev, [key]: e.target.value }))
                  }
                  className={cn(
                    'min-h-[5rem] w-full resize-y text-role-caption text-text-default',
                    WORKSPACE_NESTED_FIELD,
                    WORKSPACE_NESTED_FIELD_PAD,
                    focusRing('field', 'accent'),
                  )}
                />
                <div className="flex justify-end">
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={saving || !onSaveDescription || !dirty}
                    loading={saving}
                    icon={
                      saving ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Check className="h-3.5 w-3.5" />
                      )
                    }
                    onClick={() => {
                      if (!onSaveDescription) return;
                      void onSaveDescription(line, draft.trim() || null);
                    }}
                  >
                    {saving ? 'Saving…' : 'Save description'}
                  </Button>
                </div>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
