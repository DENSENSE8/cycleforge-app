'use client';

/**
 * PO-items section of the LineEditPanel. Both source lanes now render the SAME
 * one-row surface — `PoLinesAccordion` (receiving-condition-serial-unification-
 * plan.md): a real Zoho PO carton mounts it directly (driven by the
 * `useUnboxLineController` layer); an unmatched / return / sales-order-linked
 * carton mounts it inside {@link UnmatchedItemsSection} → `UnmatchedAccordionSurface`
 * (driven by the `useUnmatchedItems` layer, with the return scanner as the
 * active row). {@link classifyLineSource} selects the controller layer, NOT the
 * surface — there is no standing carton scanner beside the rows, and no feature
 * flag. Lineless real PO cartons fall back to the unmatched lane so the
 * workspace never paints a blank card.
 */

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { openInUnboxHref } from '@/lib/receiving/surface-path';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PoLinesAccordion } from '../PoLinesAccordion';
import { UnmatchedItemsSection } from '../UnmatchedItemsSection';
import { ActiveLineConditionSerial } from './ActiveLineConditionSerial';
import { ReceivingPhotoButton } from './ReceivingPhotoButton';
import type { ReceivingLineRow } from '@/components/station/ReceivingLinesTable';
import type { InlineActionFeedbackPayload } from '../InlineActionFeedbackCard';
import type { UnboxLineController } from './unbox-line-controller';
import {
  dispatchLineUpdated,
  dispatchSelectLine,
} from '@/components/station/receiving-lines-table-helpers';
import { invalidateReceivingFeeds, receivingSiblingsQueryKey } from '@/lib/queries/receiving-queries';
import { requestConfirm } from '@/design-system/components/confirm';
import {
  shouldUsePoAccordion,
  shouldUseUnmatchedItemsSurface,
} from '@/lib/receiving/intake-items-routing';
import { isReturnIntake } from '@/lib/receiving/triage-intake-kind';

interface LinePoItemsSectionProps {
  row: ReceivingLineRow;
  staffId: string;
  c: UnboxLineController;
  /** Serial-number entry on the active line (unbox captures serials; triage doesn't). */
  serialScan: boolean;
  /** Offer the unmatched-carton "open in unbox" jump (triage hands off to unbox). */
  openInUnbox: boolean;
  /** PO-items accordion interactivity — false renders a flat read-only display (triage). */
  editLines: boolean;
  onItemDescFeedback?: (feedback: InlineActionFeedbackPayload | null) => void;
  onItemDescSaved?: (lineId: number, zohoNotes: string | null) => void;
  embedded?: boolean;
  headerRight?: React.ReactNode;
  /** Hide the embedded "PO items · N" eyebrow — the tab slider owns the label. */
  suppressHeader?: boolean;
  /** Carton-open snapshot of `receiving.accordionExpand`. */
  accordionBootstrap?: 'default' | 'all';
}

interface SiblingsResponse {
  success: boolean;
  receiving_lines: ReceivingLineRow[];
}

export function LinePoItemsSection({
  row,
  staffId,
  c,
  serialScan,
  openInUnbox,
  editLines,
  onItemDescFeedback,
  onItemDescSaved,
  embedded = false,
  headerRight,
  suppressHeader = false,
  accordionBootstrap = 'default',
}: LinePoItemsSectionProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const receivingId = row.receiving_id;
  const wantsPoAccordion = shouldUsePoAccordion(row);
  const queryKey = useMemo(
    () => receivingSiblingsQueryKey(receivingId ?? 0),
    [receivingId],
  );

  const { data, isPending } = useQuery<SiblingsResponse>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(
        `/api/receiving-lines?receiving_id=${receivingId}&include=serials`,
      );
      if (!res.ok) throw new Error('Failed to fetch siblings');
      return res.json();
    },
    enabled: wantsPoAccordion && receivingId != null,
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });

  if (receivingId == null) return null;

  const siblingCount = data?.receiving_lines?.length;
  const linelessRealPo =
    wantsPoAccordion && !isPending && (siblingCount === undefined ? false : siblingCount === 0);
  const useUnmatchedSurface =
    shouldUseUnmatchedItemsSurface(row) || linelessRealPo;

  const openInUnboxHandler = openInUnbox
    ? () => {
        router.push(openInUnboxHref(receivingId, row.id));
      }
    : undefined;

  const receivingTypeHint = isReturnIntake(row) ? 'RETURN' : c.receivingType;

  if (useUnmatchedSurface) {
    return (
      <UnmatchedItemsSection
        receivingId={receivingId}
        staffId={staffId}
        embedded={embedded}
        headerRight={headerRight}
        suppressHeader={suppressHeader}
        showSerialScan={serialScan}
        onOpenInUnbox={openInUnboxHandler}
        sourcePlatformHint={c.sourcePlatform || undefined}
        receivingTypeHint={receivingTypeHint}
        listingUrlHint={c.listingLink || undefined}
        onFileReturnClaim={c.handleFileReturnClaim}
        onActiveConditionChange={(next) => {
          c.setCond(next);
          c.setUnitLabelCondition(next);
        }}
        serialAbsent={c.serialAbsent}
        serialAbsentReason={c.serialAbsentReason}
        requireSerialConfirmation={c.requireSerialConfirmation}
        onSerialAbsentChange={({ absent, reason }) => c.commitSerialAbsent({ absent, reason })}
        linkedOrderHint={{
          source: row.receiving_source ?? null,
          zoho_purchaseorder_id: row.zoho_purchaseorder_id ?? null,
          zoho_purchaseorder_number: row.zoho_purchaseorder_number ?? null,
        }}
        activeLineId={row.id}
        onUnlinked={() => {
          invalidateReceivingFeeds(queryClient);
        }}
        onLinked={({ carton, line }) => {
          const cartonPatch = {
            zoho_purchaseorder_number: carton.zoho_purchaseorder_number,
            receiving_source: carton.source ?? 'zoho_po',
            source_platform: carton.source_platform ?? row.source_platform,
            source_platform_pill: carton.source_platform ?? row.source_platform_pill,
            carton_intake_type: carton.intake_type ?? row.carton_intake_type,
            receiving_type: carton.intake_type ?? row.receiving_type,
          };
          if (line && line.id > 0 && row.id <= 0) {
            const realRow: ReceivingLineRow = {
              ...row,
              ...cartonPatch,
              id: line.id,
              sku: line.sku ?? row.sku,
              item_name: line.item_name ?? row.item_name,
              quantity_expected: line.quantity_expected,
              quantity_received: line.quantity_received,
              condition_grade: line.condition_grade ?? row.condition_grade,
              receiving_listing_url: line.listing_url ?? row.receiving_listing_url,
              source_platform_pill: line.source_platform_pill ?? cartonPatch.source_platform_pill,
            };
            dispatchSelectLine(realRow);
          } else if (row.id > 0) {
            dispatchLineUpdated({ id: row.id, ...cartonPatch });
          }
          invalidateReceivingFeeds(queryClient);
        }}
      />
    );
  }

  return (
    <PoLinesAccordion
      receivingId={receivingId}
      activeLineId={row.id}
      embedded={embedded}
      headerRight={headerRight}
      suppressHeader={suppressHeader}
      placeholderActiveRow={row}
      readOnly={!editLines}
      accordionBootstrap={accordionBootstrap}
      serialSplit={
        editLines
          ? {
              staffId,
              cartonSource: row.receiving_source,
            }
          : undefined
      }
      onItemDescFeedback={onItemDescFeedback}
      onItemDescSaved={onItemDescSaved}
      activeConditionOverride={c.isMultiQtyLine ? (c.unitLabelCondition ?? c.cond) : c.cond}
      activeSerialActions={{
        editingSerialId: c.headerSerialEdit?.id ?? null,
        onEdit: (s) => c.setHeaderSerialEdit(s),
        onDelete: async (s, lineId) => {
          if (s.id == null) return;
          const ok = await requestConfirm({
            description: `Remove serial ${s.serial_number}?`,
            tone: 'danger',
            confirmLabel: 'Remove',
          });
          if (!ok) return;
          if (c.headerSerialEdit?.id === s.id) c.setHeaderSerialEdit(null);
          void c.deleteSerialUnit(s.id, lineId);
        },
      }}
      activeRowSlot={({ serials, units }) => !serialScan ? null : (
        <ActiveLineConditionSerial
          serials={serials}
          lineId={row.id}
          receivingId={receivingId}
          quantityExpected={row.quantity_expected ?? null}
          cond={c.cond}
          serialSubmitting={c.serialSubmitting}
          editingSerial={c.headerSerialEdit}
          serialLookup={c.serialLookup}
          onFileReturnClaim={c.handleFileReturnClaim}
          onSubmitSerial={(sn, grade) => c.enqueueSerial(sn, grade)}
          onDeleteSerialUnit={(id, lineId) => void c.deleteSerialUnit(id, lineId)}
          onReplaceSerialUnit={(original, next) => void c.replaceSerialUnit(original, next)}
          onSetUnitGrade={(id, grade) => void c.setUnitGrade(id, grade)}
          onActiveConditionChange={c.setUnitLabelCondition}
          onConditionChange={(next) => {
            c.setCond(next);
            void c.patch({ condition_grade: next });
          }}
          onEditingSerialChange={c.setHeaderSerialEdit}
          serialAbsent={c.serialAbsent}
          serialAbsentReason={c.serialAbsentReason}
          requireSerialConfirmation={c.requireSerialConfirmation}
          onSerialAbsentChange={({ absent, reason }) => c.commitSerialAbsent({ absent, reason })}
          units={units}
          serialInputRef={c.serialRef}
          // The desktop's ONLY item-evidence surface. Stage is threaded
          // explicitly and paired with the line id — a defaulted safety
          // classification is what let bench photos become arrival evidence
          // once already (`.claude/rules/backend-patterns.md`). `unbox_item`
          // + `receivingLineId` writes RECEIVING_LINE / `receiving_item`;
          // `arrival_package` is never reachable from this bench.
          itemPhotoSlot={
            <ReceivingPhotoButton
              receivingId={receivingId}
              staffId={Number(staffId) || 0}
              poRef={row.zoho_purchaseorder_number ?? null}
              photoStage="unbox_item"
              receivingLineId={row.id}
              // Routes a phone request to /m/receiving/po/{ref}/item/{line}/photos.
              // The detail route resolves either the Zoho id or the printed
              // number; prefer the id, which survives a PO rename. Absent →
              // the phone leg is click-inert and device upload still works.
              poRouteRef={row.zoho_purchaseorder_id ?? row.zoho_purchaseorder_number ?? null}
            />
          }
        />
      )}
    />
  );
}
