"use client";

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

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { openInUnboxHref } from "@/lib/receiving/surface-path";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PoLinesAccordion } from "../PoLinesAccordion";
import { UnmatchedItemsSection } from "../UnmatchedItemsSection";
import { ActiveLineConditionSerial } from "./ActiveLineConditionSerial";
import type { ReceivingLineRow } from "@/components/station/receiving-line-row";
import type { InlineActionFeedbackPayload } from "../InlineActionFeedbackCard";
import type { UnboxLineController } from "./unbox-line-controller";
import {
  dispatchLineUpdated,
  dispatchSelectLine,
} from "@/components/station/receiving-lines-table-helpers";
import {
  invalidateReceivingFeeds,
  receivingSiblingsQueryKey,
} from "@/lib/queries/receiving-queries";
import { requestConfirm } from "@/design-system/components/confirm";
import {
  shouldUsePoAccordion,
  shouldUseUnmatchedItemsSurface,
} from "@/lib/receiving/intake-items-routing";
import { isReturnIntake } from "@/lib/receiving/triage-intake-kind";
import { markReceivingSerialAbsent } from "../receiving-label-helpers";

/** Line-scoped condition write for interleaved sibling SKU bodies. */
function patchLineCondition(lineId: number, next: string) {
  const cleared = !String(next || "").trim();
  dispatchLineUpdated({
    id: lineId,
    condition_grade: cleared ? "" : next,
  });
  void fetch(`/api/receiving/lines/${lineId}/condition`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      cleared ? { reopen: true } : { condition_grade: next },
    ),
  }).catch(() => {});
}

const IDLE_SERIAL_LOOKUP = {
  state: "idle" as const,
  unit: null,
  serial: "",
  matchedOrder: null,
};

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
  accordionBootstrap?: "default" | "all";
  /**
   * Filled multi-qty unit pencil → open Units display / edit handoff.
   * Wired from LineEditPanel; omitted on triage / unmatched.
   */
  onEditFilledSerial?: (serial: {
    id: number;
    serial_number: string;
    condition_grade?: string | null;
  }) => void;
  /** Serials cell click → Units Displays. */
  onViewAllUnits?: (line: ReceivingLineRow) => void;
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
  accordionBootstrap = "default",
  onEditFilledSerial,
  onViewAllUnits,
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
      if (!res.ok) throw new Error("Failed to fetch siblings");
      return res.json();
    },
    enabled: wantsPoAccordion && receivingId != null,
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });

  if (receivingId == null) return null;

  const siblingCount = data?.receiving_lines?.length;
  const linelessRealPo =
    wantsPoAccordion &&
    !isPending &&
    (siblingCount === undefined ? false : siblingCount === 0);
  const useUnmatchedSurface =
    shouldUseUnmatchedItemsSurface(row) || linelessRealPo;

  const openInUnboxHandler = openInUnbox
    ? () => {
        router.push(openInUnboxHref(receivingId, row.id));
      }
    : undefined;

  const receivingTypeHint = isReturnIntake(row) ? "RETURN" : c.receivingType;

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
        onSerialAbsentChange={({ absent, reason }) =>
          c.commitSerialAbsent({ absent, reason })
        }
        linkedOrderHint={{
          source: row.receiving_source ?? null,
          zoho_purchaseorder_id: row.zoho_purchaseorder_id ?? null,
          zoho_purchaseorder_number: row.zoho_purchaseorder_number ?? null,
        }}
        activeLineId={row.id}
        onViewAllUnits={onViewAllUnits}
        onUnlinked={() => {
          invalidateReceivingFeeds(queryClient);
        }}
        onLinked={({ carton, line }) => {
          const cartonPatch = {
            zoho_purchaseorder_number: carton.zoho_purchaseorder_number,
            receiving_source: carton.source ?? "zoho_po",
            source_platform: carton.source_platform ?? row.source_platform,
            source_platform_pill:
              carton.source_platform ?? row.source_platform_pill,
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
              receiving_listing_url:
                line.listing_url ?? row.receiving_listing_url,
              source_platform_pill:
                line.source_platform_pill ?? cartonPatch.source_platform_pill,
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
      onViewAllUnits={onViewAllUnits}
      activeConditionOverride={
        c.isMultiQtyLine ? (c.unitLabelCondition ?? c.cond) : c.cond
      }
      activeSerialActions={{
        editingSerialId: c.headerSerialEdit?.id ?? null,
        onEdit: (s) => c.setHeaderSerialEdit(s),
        onDelete: async (s, lineId) => {
          if (s.id == null) return;
          const ok = await requestConfirm({
            description: `Remove serial ${s.serial_number}?`,
            tone: "danger",
            confirmLabel: "Remove",
          });
          if (!ok) return;
          if (c.headerSerialEdit?.id === s.id) c.setHeaderSerialEdit(null);
          void c.deleteSerialUnit(s.id, lineId);
        },
      }}
      activeRowSlot={({ serials, units, line }) => {
        if (!serialScan) return null;
        const isControllerLine = line.id === row.id;
        return (
          <ActiveLineConditionSerial
            serials={serials}
            lineId={line.id}
            receivingId={receivingId}
            quantityExpected={line.quantity_expected ?? null}
            cond={
              isControllerLine
                ? c.cond
                : line.condition_grade || "USED_A"
            }
            serialSubmitting={c.serialSubmitting}
            editingSerial={c.headerSerialEdit}
            serialLookup={
              isControllerLine ? c.serialLookup : IDLE_SERIAL_LOOKUP
            }
            onFileReturnClaim={
              isControllerLine ? c.handleFileReturnClaim : undefined
            }
            onSubmitSerial={(sn, grade) =>
              c.enqueueSerial(sn, grade, line.id)
            }
            onDeleteSerialUnit={(id, lineId) =>
              void c.deleteSerialUnit(id, lineId ?? line.id)
            }
            onReplaceSerialUnit={(original, next) =>
              void c.replaceSerialUnit(original, next, line.id)
            }
            onSetUnitGrade={(id, grade) =>
              void c.setUnitGrade(id, grade, line.id)
            }
            onActiveConditionChange={(next) => {
              if (isControllerLine) c.setUnitLabelCondition(next);
            }}
            onConditionChange={(next) => {
              if (isControllerLine) {
                c.setCond(next);
                void c.patch({ condition_grade: next });
                return;
              }
              patchLineCondition(line.id, next);
            }}
            onEditingSerialChange={c.setHeaderSerialEdit}
            serialAbsent={
              isControllerLine
                ? c.serialAbsent
                : (line.serial_absent ?? false)
            }
            serialAbsentReason={
              isControllerLine
                ? c.serialAbsentReason
                : (line.serial_absent_reason ?? null)
            }
            requireSerialConfirmation={c.requireSerialConfirmation}
            onSerialAbsentChange={(next) => {
              if (isControllerLine) {
                c.commitSerialAbsent(next);
                return;
              }
              markReceivingSerialAbsent(line.id, next);
            }}
            units={units}
            serialInputRef={isControllerLine ? c.serialRef : undefined}
            autoFocusSerial={isControllerLine}
            onEditFilledSerial={onEditFilledSerial}
            stationCompact
          />
        );
      }}
    />
  );
}
