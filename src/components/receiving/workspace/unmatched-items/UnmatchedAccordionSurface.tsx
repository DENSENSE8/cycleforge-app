'use client';

/**
 * Unified unfound-carton items surface — the ONLY receiving path for an
 * unfound / return / sales-order-linked carton (no feature flag;
 * receiving-condition-serial-unification-plan.md).
 *
 * ONE row surface (Kinetic Ledger):
 *   - ≥1 line (or a known placeholderActiveRow) → {@link PoLinesAccordion}.
 *     Default leaf is `ActiveLineConditionSerial`; Testing overrides via
 *     `activeRowSlot` (verdict pills). No standing carton scanner beside rows.
 *   - 0 lines and no placeholder → {@link ReturnScanCard} (scan-first return).
 *     Shown ONLY when the carton has no line yet — no double-row.
 *
 * A return import (`handleReturnSerialScan`) writes the accordion's own
 * {@link receivingSiblingsQueryKey} cache via the wrapped `onLinked`, so the new
 * line reflows in the active-row accordion instantly (belt-and-suspenders with
 * the `app-refresh-data` invalidation `usePoLinesData` already listens to).
 *
 * Multi-return: additional returns are added through the header "+" (Package
 * Pairing) / the `UnfoundMatchStrip` order search, mirroring how a matched
 * carton grows — never a persistent second scanner (that was the double-row).
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, PackageOpen, Pencil, Unlink } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { Button, IconButton } from '@/design-system/primitives';
import { WorkspaceCard, InlineNotice } from '@/design-system/components';
import { toast } from '@/lib/toast';
import { HandlingUnitChip } from '@/components/receiving/HandlingUnitChip';
import { LabelIdentifyButton } from '@/components/receiving/label-identify/LabelIdentifyButton';
import {
  publishLineSerials,
  receivingSiblingsQueryKey,
  writeReceivingSiblingLine,
} from '@/lib/queries/receiving-queries';
import {
  appendOptimisticSerial,
  clearSerialRemoving,
  confirmOptimisticSerial,
  markSerialRemoving,
  mintOptimisticSerialId,
  removeSerialById,
  rollbackOptimisticSerial,
  setSerialGrade,
  unlinkSerialFromLineUnits,
  type LineSerial,
} from '@/lib/receiving/optimistic-serials';
import type {
  ReceivingLineRow,
  ReceivingLineUnitView,
} from '@/components/station/receiving-line-row';
import { PoLinesAccordion, type ActiveRowSerial } from '@/components/receiving/workspace/PoLinesAccordion';
import { ActiveLineConditionSerial } from '@/components/receiving/workspace/line-edit/ActiveLineConditionSerial';
import { useSerialLookup } from '@/components/receiving/workspace/SerialMatchResult';
import { dispatchUnboxRailLineUpdated } from '@/components/sidebar/receiving/unbox-rail-events';
import { dispatchSelectLine } from '@/components/station/receiving-lines-table-helpers';
import { setActiveSinkId } from '@/lib/station-scan-sink';
import { requestConfirm } from '@/design-system/components/confirm';
import { useUnmatchedItems } from './useUnmatchedItems';
import { IntakeClassifyRow } from './IntakeClassifyRow';
import { ReturnScanCard } from './ReturnScanCard';
import type { UnfoundLine, UnmatchedItemsSectionProps } from './unmatched-items-shared';
import { markReceivingSerialAbsent } from '@/components/receiving/workspace/receiving-label-helpers';

const IDLE_SERIAL_LOOKUP = {
  state: 'idle' as const,
  unit: null,
  serial: '',
  matchedOrder: null,
};

/**
 * Per-line serial handlers for unfound carton lines. Interleaved SKU bodies
 * pass an explicit `targetLineId`; otherwise defaults to the controller-active
 * line. Mirrors the matched carton's `useLineSerials` against the same
 * scan-serial / grade endpoints via the shared optimistic-serials +
 * publishLineSerials SoT.
 */
function useActiveUnfoundLineSerials({
  receivingId,
  lineId,
  lineCondition,
  staffId,
  isReturn,
}: {
  receivingId: number;
  lineId: number | null;
  lineCondition: string;
  staffId?: string;
  isReturn: boolean;
}) {
  const queryClient = useQueryClient();
  const [serialSubmitting, setSerialSubmitting] = useState(false);
  const [editingSerial, setEditingSerial] = useState<ActiveRowSerial | null>(null);
  const serialLookup = useSerialLookup();
  const serialQueueRef = useRef<
    Array<{
      raw: string;
      grade: string | null;
      lineId: number;
      tempId: number;
      resolve: () => void;
    }>
  >([]);
  const drainingRef = useRef(false);

  const readLineSerials = useCallback(
    (id: number): LineSerial[] => {
      const cached = queryClient.getQueryData<{
        success: boolean;
        receiving_lines: Array<{ id: number; serials?: LineSerial[] }>;
      }>(receivingSiblingsQueryKey(receivingId));
      const hit = cached?.receiving_lines?.find((l) => l.id === id);
      return (hit?.serials ?? []) as LineSerial[];
    },
    [queryClient, receivingId],
  );

  const readLineUnits = useCallback(
    (id: number): ReceivingLineUnitView[] | null => {
      const cached = queryClient.getQueryData<{
        success: boolean;
        receiving_lines: Array<{
          id: number;
          units?: ReceivingLineUnitView[] | null;
        }>;
      }>(receivingSiblingsQueryKey(receivingId));
      const hit = cached?.receiving_lines?.find((l) => l.id === id);
      return hit?.units ?? null;
    },
    [queryClient, receivingId],
  );

  const publish = useCallback(
    (
      id: number,
      serials: LineSerial[],
      units?: ReceivingLineUnitView[] | null,
    ) => {
      publishLineSerials(queryClient, receivingId, id, serials, units);
    },
    [queryClient, receivingId],
  );

  const postOneSerial = useCallback(
    async (
      serial: string,
      conditionGrade: string | null,
      resolvedLineId: number,
      tempId: number,
    ) => {
      try {
        if (isReturn) await serialLookup.check(serial);
        const res = await fetch('/api/receiving/scan-serial', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            receiving_id: receivingId,
            receiving_line_id: resolvedLineId,
            serial_number: serial,
            staff_id: Number(staffId) || undefined,
            condition_grade: conditionGrade ?? lineCondition ?? undefined,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.success) {
          toast.error(json?.error || 'Scan failed');
          publish(
            resolvedLineId,
            rollbackOptimisticSerial(readLineSerials(resolvedLineId), tempId),
          );
          return;
        }
        if (json.already_attached) {
          toast.info(`Already added — ${serial}`);
          publish(
            resolvedLineId,
            rollbackOptimisticSerial(readLineSerials(resolvedLineId), tempId),
          );
          return;
        }
        const confirmed = confirmOptimisticSerial(
          readLineSerials(resolvedLineId),
          tempId,
          json.serial_unit,
        );
        publish(resolvedLineId, confirmed);
        if (json.line_patch && typeof json.line_patch.id === 'number') {
          dispatchUnboxRailLineUpdated(json.line_patch);
        }
        if (json.is_return) {
          const su = json.serial_unit;
          serialLookup.applyResult({
            serial,
            found: true,
            is_return: true,
            unit: su
              ? {
                  id: typeof su.id === 'number' ? su.id : null,
                  serial_number: String(su.serial_number ?? serial),
                  sku: su.sku ?? null,
                  current_status: String(su.current_status ?? 'RETURNED'),
                  condition_grade: su.condition_grade ?? null,
                  current_location: su.current_location ?? null,
                  updated_at: su.updated_at ?? null,
                  is_return: true,
                }
              : null,
            matchedOrder: json.matched_order ?? null,
          });
        } else if (isReturn) {
          serialLookup.applyResult({ serial, found: false });
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Scan failed');
        publish(
          resolvedLineId,
          rollbackOptimisticSerial(readLineSerials(resolvedLineId), tempId),
        );
      }
    },
    [
      isReturn,
      lineCondition,
      publish,
      readLineSerials,
      receivingId,
      serialLookup,
      staffId,
    ],
  );

  const drainSerialQueue = useCallback(async () => {
    if (drainingRef.current) return;
    drainingRef.current = true;
    setSerialSubmitting(true);
    try {
      while (serialQueueRef.current.length > 0) {
        const next = serialQueueRef.current.shift();
        if (!next) break;
        await postOneSerial(next.raw, next.grade, next.lineId, next.tempId);
        next.resolve();
      }
    } finally {
      drainingRef.current = false;
      setSerialSubmitting(serialQueueRef.current.length > 0);
      if (serialQueueRef.current.length > 0) {
        void drainSerialQueue();
      }
    }
  }, [postOneSerial]);

  const submitSerial = useCallback(
    async (
      raw?: string,
      conditionGrade?: string | null,
      targetLineId?: number,
    ) => {
      const serial = (raw ?? '').trim();
      const resolvedLineId = targetLineId ?? lineId;
      if (!serial || resolvedLineId == null) return;
      if (resolvedLineId <= 0) return; // still on optimistic temp line — wait for remap
      const tempId = mintOptimisticSerialId();
      publish(
        resolvedLineId,
        appendOptimisticSerial(readLineSerials(resolvedLineId), serial, tempId),
      );
      return new Promise<void>((resolve) => {
        serialQueueRef.current.push({
          raw: serial,
          grade: conditionGrade ?? null,
          lineId: resolvedLineId,
          tempId,
          resolve,
        });
        void drainSerialQueue();
      });
    },
    [drainSerialQueue, lineId, publish, readLineSerials],
  );

  const deleteSerialUnit = useCallback(
    async (serialUnitId: number, targetLineId?: number) => {
      const resolvedLineId = targetLineId ?? lineId;
      if (serialUnitId == null || resolvedLineId == null || serialUnitId <= 0) return;
      const currentUnits = readLineUnits(resolvedLineId);
      const nextUnits =
        currentUnits != null
          ? unlinkSerialFromLineUnits(currentUnits, serialUnitId)
          : undefined;
      publish(
        resolvedLineId,
        markSerialRemoving(readLineSerials(resolvedLineId), serialUnitId),
        nextUnits,
      );
      try {
        const res = await fetch('/api/receiving/scan-serial', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            serial_unit_id: serialUnitId,
            receiving_line_id: resolvedLineId,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.success) {
          toast.error(json?.error || 'Could not remove serial');
          publish(
            resolvedLineId,
            clearSerialRemoving(readLineSerials(resolvedLineId), serialUnitId),
            currentUnits ?? undefined,
          );
          return;
        }
        if (editingSerial?.id === serialUnitId) setEditingSerial(null);
        toast.success('Serial removed');
        publish(
          resolvedLineId,
          removeSerialById(readLineSerials(resolvedLineId), serialUnitId),
          nextUnits,
        );
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not remove serial');
        publish(
          resolvedLineId,
          clearSerialRemoving(readLineSerials(resolvedLineId), serialUnitId),
          currentUnits ?? undefined,
        );
      }
    },
    [editingSerial?.id, lineId, publish, readLineSerials, readLineUnits],
  );

  const replaceSerialUnit = useCallback(
    async (
      original: { id: number; serial_number: string; condition_grade?: string | null },
      nextSerial: string,
      targetLineId?: number,
    ) => {
      const resolvedLineId = targetLineId ?? lineId;
      if (original.id == null || resolvedLineId == null || original.id <= 0) return;
      const next = (nextSerial ?? '').trim();
      if (!next || next === original.serial_number) return;
      const currentUnits = readLineUnits(resolvedLineId);
      const nextUnits =
        currentUnits != null
          ? unlinkSerialFromLineUnits(currentUnits, original.id)
          : undefined;
      publish(
        resolvedLineId,
        markSerialRemoving(readLineSerials(resolvedLineId), original.id),
        nextUnits,
      );
      try {
        const res = await fetch('/api/receiving/scan-serial', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            serial_unit_id: original.id,
            receiving_line_id: resolvedLineId,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.success) {
          toast.error(json?.error || 'Could not replace serial');
          publish(
            resolvedLineId,
            clearSerialRemoving(readLineSerials(resolvedLineId), original.id),
            currentUnits ?? undefined,
          );
          return;
        }
        publish(
          resolvedLineId,
          removeSerialById(readLineSerials(resolvedLineId), original.id),
          nextUnits,
        );
        await submitSerial(next, original.condition_grade ?? null, resolvedLineId);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not replace serial');
        publish(
          resolvedLineId,
          clearSerialRemoving(readLineSerials(resolvedLineId), original.id),
          currentUnits ?? undefined,
        );
      }
    },
    [lineId, publish, readLineSerials, readLineUnits, submitSerial],
  );

  const setUnitGrade = useCallback(
    async (serialUnitId: number, grade: string, targetLineId?: number) => {
      const resolvedLineId = targetLineId ?? lineId;
      if (resolvedLineId == null || serialUnitId <= 0) return;
      const prev = readLineSerials(resolvedLineId);
      const nextGrade = String(grade || '').trim() ? grade : null;
      publish(resolvedLineId, setSerialGrade(prev, serialUnitId, nextGrade));
      try {
        const res = await fetch(`/api/serial-units/${serialUnitId}/grade`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ new_grade: nextGrade }),
        });
        if (res.status === 409) return;
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) {
          toast.error(json?.error || 'Could not set unit condition');
          publish(resolvedLineId, prev);
          return;
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Condition save failed');
        publish(resolvedLineId, prev);
      }
    },
    [lineId, publish, readLineSerials],
  );

  return {
    serialSubmitting,
    editingSerial,
    setEditingSerial,
    serialLookup,
    submitSerial,
    deleteSerialUnit,
    replaceSerialUnit,
    setUnitGrade,
  };
}

export function UnmatchedAccordionSurface(props: UnmatchedItemsSectionProps) {
  const {
    receivingId,
    staffId,
    receivingTypeHint = 'PO',
    onFileReturnClaim,
    onOpenReturnHistory,
    onActiveConditionChange,
    serialAbsent,
    serialAbsentReason,
    requireSerialConfirmation,
    onSerialAbsentChange,
    showSerialScan = true,
    readOnly: readOnlyProp,
    unitsChrome = true,
    onOpenInUnbox,
    embedded = false,
    headerRight,
    suppressHeader = false,
    activeLineId,
    onViewAllUnits,
    activeRowSlot: activeRowSlotProp,
    placeholderActiveRow: placeholderActiveRowProp,
    hideNoTestLines = false,
    activeSerialActions: activeSerialActionsProp,
    dockOwnsCapture = false,
  } = props;
  // Legacy callers tied interactivity to showSerialScan; Arrival passes
  // readOnly from editLines so unit capture can stay off independently.
  const readOnly = readOnlyProp ?? !showSerialScan;

  const queryClient = useQueryClient();

  // Wrap onLinked so a return import (or Ecwid pairing) that returns the created
  // line ALSO lands it on the accordion's own siblings cache — the active row
  // reflows instantly, before the app-refresh-data refetch reconciles.
  const propsOnLinked = props.onLinked;
  const wrappedOnLinked = useCallback<NonNullable<UnmatchedItemsSectionProps['onLinked']>>(
    (result) => {
      if (result.line?.id) {
        writeReceivingSiblingLine(queryClient, receivingId, result.line);
      }
      propsOnLinked?.(result);
    },
    [propsOnLinked, queryClient, receivingId],
  );

  const c = useUnmatchedItems({ ...props, onLinked: wrappedOnLinked });

  const isReturn = String(receivingTypeHint || '').toUpperCase() === 'RETURN';
  const hasLines = c.lines.length > 0;

  // Resolve the active line: the workspace's selected line if it's a real line
  // of this carton, else the first line (an unfound STUB id won't match).
  const resolvedActiveLine = useMemo<UnfoundLine | null>(() => {
    if (!hasLines) return null;
    return c.lines.find((l) => l.id === activeLineId) ?? c.lines[0] ?? null;
  }, [activeLineId, c.lines, hasLines]);
  const resolvedActiveLineId = resolvedActiveLine?.id ?? null;

  // Never-blank: host placeholder (Testing / workspace) wins; else the resolved
  // fetched line. A known positive id keeps the accordion mounted while GET
  // clears local lines — never flash ReturnScanCard beside a known selection.
  const paintPlaceholder = useMemo<ReceivingLineRow | undefined>(() => {
    if (placeholderActiveRowProp && placeholderActiveRowProp.id > 0) {
      return placeholderActiveRowProp;
    }
    if (resolvedActiveLine && resolvedActiveLine.id > 0) {
      return resolvedActiveLine as unknown as ReceivingLineRow;
    }
    return undefined;
  }, [placeholderActiveRowProp, resolvedActiveLine]);
  const showAccordion = hasLines || Boolean(paintPlaceholder);

  const lineSerials = useActiveUnfoundLineSerials({
    receivingId,
    lineId: resolvedActiveLineId,
    lineCondition: resolvedActiveLine?.condition_grade ?? 'USED_A',
    staffId,
    isReturn,
  });

  const headerActions = (
    <div className="flex items-center gap-1.5">
      {c.assignedBox ? (
        <HandlingUnitChip
          handlingUnitId={c.assignedBox.id}
          code={c.assignedBox.code}
          unitCount={c.assignedBox.total}
          dense
        />
      ) : null}
      {onOpenInUnbox ? (
        <HoverTooltip label="Open this carton in unbox mode (serial scan, photos, receive)" asChild>
          <Button
            variant="secondary"
            size="sm"
            type="button"
            onClick={onOpenInUnbox}
            ariaLabel="Open this carton in unbox mode (serial scan, photos, receive)"
            icon={<PackageOpen />}
            className="h-7 gap-1 rounded-md border border-blue-200 bg-blue-50 px-2.5 text-blue-700 hover:bg-blue-100"
          >
            Open in unbox
          </Button>
        </HoverTooltip>
      ) : null}
      {!embedded ? (
        <HoverTooltip label="Edit carton items — opens Package Pairing (catalog item, web search, or a box)" asChild>
          <IconButton
            icon={<Pencil className="h-3.5 w-3.5 text-white" />}
            ariaLabel="Edit carton items"
            onClick={() => window.dispatchEvent(new CustomEvent('receiving-open-pairing-add'))}
            className="inline-flex h-6 w-6 items-center justify-center rounded-xl bg-blue-600 hover:bg-blue-700"
          />
        </HoverTooltip>
      ) : null}
    </div>
  );

  const body = (
    <div className="space-y-2">
      {/* Door-classification pill row — triage-only (gated on the triage-only
          onOpenInUnbox CTA); the unbox workspace shows the read-only banner. */}
      {onOpenInUnbox ? (
        <IntakeClassifyRow value={c.classification} onSelect={c.saveClassification} />
      ) : null}

      {c.showUnlinkPrompt ? (
        <InlineNotice
          tone="warning"
          size="sm"
          title={c.linkError ? 'Could not import — order already linked' : 'Order linked — no items yet'}
        >
          <div className="space-y-2">
            <p className="text-role-caption text-amber-900">
              {c.linkError ? (
                <>
                  {c.linkError}
                  {c.linkedOrderNumber ? (
                    <>
                      {' '}This carton is still paired to order{' '}
                      <span className="font-mono font-semibold">{c.linkedOrderNumber}</span>.
                    </>
                  ) : null}
                </>
              ) : c.linkedOrderNumber ? (
                <>
                  Order <span className="font-mono font-semibold">{c.linkedOrderNumber}</span> is paired to this
                  carton but no line items were imported. Unlink to clear the pairing and scan the serial again.
                </>
              ) : (
                'This carton has an order pairing but no line items. Unlink to clear it and try again.'
              )}
            </p>
            <HoverTooltip
              label="Clears the order#, platform, return flags, and per-line source linkage"
              asChild
              focusable={false}
            >
              <Button
                variant="secondary"
                size="sm"
                icon={c.unlinking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink />}
                onClick={() => void c.handleUnlinkOrder()}
                disabled={c.unlinking}
                className="h-7 border-rose-200 bg-rose-50 px-2.5 text-rose-700 hover:bg-rose-100"
              >
                {c.unlinking ? 'Unlinking…' : 'Unlink order'}
              </Button>
            </HoverTooltip>
          </div>
        </InlineNotice>
      ) : null}

      {/* Identify an item by photographing its printed label — same add path the
          CartonAddPopover uses. Hidden when no vision box is configured. */}
      <LabelIdentifyButton
        onConfirm={(cand) =>
          c.handleAddLine({
            sku_platform_id_row: null,
            sku_catalog_id: cand.sku_catalog_id,
            sku: cand.sku ?? '',
            item_name: cand.product_title ?? cand.item_name ?? cand.model,
            image_url: cand.image_url,
          })
        }
      />

      {showAccordion ? (
        // One row surface — condition/serial editors interleaved under each SKU.
        <PoLinesAccordion
          receivingId={receivingId}
          activeLineId={
            resolvedActiveLineId ?? paintPlaceholder?.id ?? c.lines[0]?.id ?? 0
          }
          // Cold siblings key: paint the known unfound line on frame 1 (never
          // blank while GET /api/receiving-lines is in flight).
          placeholderActiveRow={paintPlaceholder}
          hideNoTestLines={hideNoTestLines}
          embedded
          suppressHeader
          readOnly={readOnly}
          unitsChrome={unitsChrome}
          activeConditionOverride={
            unitsChrome ? (resolvedActiveLine?.condition_grade ?? null) : undefined
          }
          activeSerialActions={
            activeSerialActionsProp !== undefined
              ? activeSerialActionsProp
              : unitsChrome && showSerialScan
                ? {
                    editingSerialId: lineSerials.editingSerial?.id ?? null,
                    onEdit: (s) => lineSerials.setEditingSerial(s),
                    onDelete: async (s, targetLineId) => {
                      if (s.id == null) return;
                      const ok = await requestConfirm({
                        description: `Remove serial ${s.serial_number}?`,
                        tone: 'danger',
                        confirmLabel: 'Remove',
                      });
                      if (!ok) return;
                      void lineSerials.deleteSerialUnit(s.id, targetLineId);
                    },
                  }
                : undefined
          }
          onViewAllUnits={unitsChrome ? onViewAllUnits : undefined}
          activeRowSlot={
            activeRowSlotProp !== undefined
              ? activeRowSlotProp
              : unitsChrome && showSerialScan
                ? ({ serials, units, line }) => {
                    const isActiveLine = line.id === resolvedActiveLineId;
                    return (
                      <ActiveLineConditionSerial
                        serials={serials}
                        lineId={line.id}
                        receivingId={receivingId}
                        quantityExpected={line.quantity_expected ?? null}
                        cond={line.condition_grade || 'USED_A'}
                        serialSubmitting={lineSerials.serialSubmitting}
                        editingSerial={lineSerials.editingSerial}
                        serialLookup={
                          isActiveLine ? lineSerials.serialLookup : IDLE_SERIAL_LOOKUP
                        }
                        onFileReturnClaim={
                          isActiveLine && onFileReturnClaim
                            ? (mo) =>
                                onFileReturnClaim(mo, lineSerials.serialLookup.serial)
                            : undefined
                        }
                        onOpenReturnHistory={
                          isActiveLine ? onOpenReturnHistory : undefined
                        }
                        onSubmitSerial={(sn, grade) =>
                          lineSerials.submitSerial(sn, grade, line.id)
                        }
                        onDeleteSerialUnit={(id, targetLineId) =>
                          void lineSerials.deleteSerialUnit(
                            id,
                            targetLineId ?? line.id,
                          )
                        }
                        onReplaceSerialUnit={(original, next) =>
                          void lineSerials.replaceSerialUnit(original, next, line.id)
                        }
                        onSetUnitGrade={(id, grade) =>
                          void lineSerials.setUnitGrade(id, grade, line.id)
                        }
                        onActiveConditionChange={(next) => {
                          if (isActiveLine && next) onActiveConditionChange?.(next);
                        }}
                        onConditionChange={(next) => {
                          void c.handleConditionChange(line.id, next);
                        }}
                        onEditingSerialChange={lineSerials.setEditingSerial}
                        serialAbsent={
                          isActiveLine
                            ? (serialAbsent ?? false)
                            : (line.serial_absent ?? false)
                        }
                        serialAbsentReason={
                          isActiveLine
                            ? (serialAbsentReason ?? null)
                            : (line.serial_absent_reason ?? null)
                        }
                        requireSerialConfirmation={requireSerialConfirmation ?? false}
                        onSerialAbsentChange={(next) => {
                          if (isActiveLine) {
                            onSerialAbsentChange?.(next);
                            return;
                          }
                          markReceivingSerialAbsent(line.id, next);
                        }}
                        units={units}
                        autoFocusSerial={isActiveLine}
                        autoCommitDefaultGrade={
                          isActiveLine && !line.condition_graded_at
                        }
                        dockOwnsCapture={dockOwnsCapture}
                        isActiveLine={isActiveLine}
                        staffId={Number(staffId) || 0}
                        poRef={
                          props.linkedOrderHint?.zoho_purchaseorder_number ?? null
                        }
                        poRouteRef={null}
                        onArmCapture={() => {
                          setActiveSinkId(`po-line:${line.id}`);
                          if (!isActiveLine) dispatchSelectLine(line);
                        }}
                      />
                    );
                  }
                : undefined
          }
        />
      ) : unitsChrome && showSerialScan ? (
        // Empty carton: the "scan the first return" active-row affordance. Shown
        // ONLY at 0 lines, so it never stands beside a line row (no double-row).
        <ReturnScanCard
          condition={c.cartonScanCondition}
          onConditionChange={(next) => c.handleCartonConditionChange(next)}
          onAdd={(sn) => c.handleReturnSerialScan(sn)}
          serialAbsent={serialAbsent}
          serialAbsentReason={serialAbsentReason}
          requireSerialConfirmation={requireSerialConfirmation}
          onSerialAbsentChange={onSerialAbsentChange}
          dockOwnsCapture={dockOwnsCapture}
          receivingId={receivingId}
          staffId={Number(staffId) || 0}
        />
      ) : null}
    </div>
  );

  if (embedded) {
    return (
      <div className="space-y-2">
        {suppressHeader ? null : (
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-role-caption font-semibold uppercase tracking-[0.14em] text-text-soft">
              Purchase order items · {c.lines.length}
            </h3>
            <div className="flex items-center gap-1.5">
              {headerActions}
              {headerRight ?? null}
            </div>
          </div>
        )}
        {body}
      </div>
    );
  }

  return (
    <WorkspaceCard label={`Purchase order items · ${c.lines.length}`} actions={headerActions}>
      {body}
    </WorkspaceCard>
  );
}
