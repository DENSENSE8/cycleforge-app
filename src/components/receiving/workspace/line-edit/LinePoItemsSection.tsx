"use client";

/**
 * PO-items section of the LineEditPanel — Unbox and Triage's adapter onto
 * {@link PoItemsSection}, the one PO-items surface every station renders.
 *
 * What stays here is the UNBOX CONTROLLER: the `ActiveLineConditionSerial`
 * capture leaf mounted under each editable line, the dual-loci dock handoffs,
 * the serial CRUD bound to `useUnboxLineController`, and the pairing `onLinked`
 * patch. What LEFT is the lane decision (matched accordion vs unfound surface,
 * including the lineless-real-PO probe) — Unbox, Testing and `/search` each
 * carried a copy of it, and Testing's had already drifted. {@link
 * classifyLineSource} still selects the controller layer, NOT the surface;
 * there is no standing carton scanner beside the rows, and no feature flag.
 */

import { useRouter } from "next/navigation";
import { openInUnboxHref } from "@/lib/receiving/surface-path";
import { useQueryClient } from "@tanstack/react-query";
import { PoItemsSection } from "../PoItemsSection";
import { ActiveLineConditionSerial } from "./ActiveLineConditionSerial";
import type { ReceivingLineRow } from "@/components/station/receiving-line-row";
import type { UnboxLineController } from "./unbox-line-controller";
import {
  dispatchLineUpdated,
  dispatchSelectLine,
} from "@/components/station/receiving-lines-table-helpers";
import { setActiveSinkId } from "@/lib/station-scan-sink";
import type { LineCollapseController } from "@/components/station/collapse";
import { scheduleFocusUnboxCaptureSerialInLine } from "./focus-unbox-capture-serial";
import { invalidateReceivingFeeds } from "@/lib/queries/receiving-queries";
import { requestConfirm } from "@/design-system/components/confirm";
import { isReturnIntake } from "@/lib/receiving/triage-intake-kind";
import { markReceivingSerialAbsent } from "../receiving-label-helpers";
import { patchReceivingLineCondition } from "../patch-receiving-line-condition";

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
  /**
   * Unbox dual loci: dock owns scanner/procedure; meta chips forward via
   * {@link onFocusCaptureStep}. Every editable line mounts Tags + open serial
   * (`ActiveLineConditionSerial`); controller-active line autofocuses centre
   * serial. When false, under-row editors mount (Testing / unmatched).
   */
  dockOwnsCapture?: boolean;
  onFocusCaptureStep?: (key: 'serial' | 'condition' | 'item_photos') => void;
  /**
   * The dock's `activeKey` (Unbox `dockOwnsCapture`) — the ONE derivation from
   * `useUnboxProcedureSteps(row)` in LineEditPanel. Gated to the controller line
   * below; drives the capture face's moving outline. Absent on Testing / Arrival.
   */
  activeStep?: string | null;
  /** Offer the unmatched-carton "open in unbox" jump (triage hands off to unbox). */
  openInUnbox: boolean;
  /** PO-items accordion interactivity — false renders a flat read-only display (triage). */
  editLines: boolean;
  embedded?: boolean;
  headerRight?: React.ReactNode;
  /** Hide the embedded receive-meter eyebrow — the tab slider owns the label. */
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
  /** Open the existing right-rail Locations display for this exact PO line. */
  onOpenLocation?: (line: ReceivingLineRow) => void;
  /**
   * When false (Arrival door flow), unit editors / serial stamp stay off;
   * PoLineRow still paints Unbox five-track meta. Defaults true.
   */
  unitsChrome?: boolean;
  /** RETURN match → Displays Timeline (full serial genealogy). */
  onOpenReturnHistory?: () => void;
  /**
   * Per-line capture disclosure, owned by the workspace ({@link useLineCollapse})
   * so the Items band's "Collapse all" reaches every line. Unbox only — the
   * unmatched / triage lanes keep their bodies mounted.
   */
  lineCollapse?: LineCollapseController;
}

export function LinePoItemsSection({
  row,
  staffId,
  c,
  serialScan,
  dockOwnsCapture = false,
  onFocusCaptureStep,
  activeStep = null,
  openInUnbox,
  editLines,
  embedded = false,
  headerRight,
  suppressHeader = false,
  accordionBootstrap = "default",
  onEditFilledSerial,
  onViewAllUnits,
  onOpenLocation,
  unitsChrome = true,
  onOpenReturnHistory,
  lineCollapse,
}: LinePoItemsSectionProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const receivingId = row.receiving_id;
  if (receivingId == null) return null;

  const openInUnboxHandler = openInUnbox
    ? () => {
        router.push(openInUnboxHref(receivingId, row.id));
      }
    : undefined;

  const receivingTypeHint = isReturnIntake(row) ? "RETURN" : c.receivingType;

  return (
    <PoItemsSection
      row={row}
      receivingId={receivingId}
      staffId={staffId}
      embedded={embedded}
      headerRight={headerRight}
      suppressHeader={suppressHeader}
      showSerialScan={unitsChrome && serialScan}
      readOnly={!editLines}
      unitsChrome={unitsChrome}
      lineCollapse={lineCollapse}
      accordionBootstrap={accordionBootstrap}
      dockOwnsCapture={dockOwnsCapture}
      onOpenInUnbox={openInUnboxHandler}
      sourcePlatformHint={c.sourcePlatform || undefined}
      receivingTypeHint={receivingTypeHint}
      listingUrlHint={c.listingLink || undefined}
      onFileReturnClaim={c.handleFileReturnClaim}
      onOpenReturnHistory={onOpenReturnHistory}
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
      onViewAllUnits={unitsChrome ? onViewAllUnits : undefined}
      onOpenLocation={onOpenLocation}
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
      serialSplit={
        unitsChrome && editLines
          ? {
              staffId,
              cartonSource: row.receiving_source,
            }
          : undefined
      }
      onEditConditionInDock={
        dockOwnsCapture && onFocusCaptureStep
          ? (line) => {
              // Sibling line: the dock's `activeKey` is bound to the OTHER
              // (controller) line, so `onFocusCaptureStep` would arm the wrong
              // line's condition. Promote this line to the controller — its own
              // in-row Tags / dock condition step then follow. Do NOT force a
              // serial focus (condition ≠ serial).
              if (line.id !== row.id) {
                setActiveSinkId(`po-line:${line.id}`);
                dispatchSelectLine(line);
                return;
              }
              onFocusCaptureStep('condition');
            }
          : undefined
      }
      onEditSerialInDock={
        dockOwnsCapture && onFocusCaptureStep
          ? (line) => {
              if (line.id !== row.id) {
                setActiveSinkId(`po-line:${line.id}`);
                dispatchSelectLine(line);
                scheduleFocusUnboxCaptureSerialInLine(line.id, 80);
                return;
              }
              onFocusCaptureStep('serial');
            }
          : undefined
      }
      activeConditionOverride={
        unitsChrome
          ? c.isMultiQtyLine
            ? (c.unitLabelCondition ?? c.cond)
            : c.cond
          : undefined
      }
      activeSerialActions={
        unitsChrome
          ? {
              editingSerialId: c.headerSerialEdit?.id ?? null,
              onEdit: (s) => {
                // Edit-in-Displays: seed the target serial, then open the Units
                // Displays leaf for the active line — never the in-row/dock field.
                c.setHeaderSerialEdit(s);
                onViewAllUnits?.(row);
              },
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
            }
          : undefined
      }
      activeRowSlot={
        // Dual loci (Unbox `dockOwnsCapture`): every editable line mounts the
        // capture face; chips still forward to the dock. Testing / unmatched
        // (`!dockOwnsCapture`) keep under-row editors. RETURN match evidence
        // rides inside ActiveLineConditionSerial via serialLookup.
        unitsChrome && serialScan
          ? ({ serials, units, line }) => {
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
                      : line.condition_grade || 'USED_A'
                  }
                  serialSubmitting={c.serialSubmitting}
                  editingSerial={
                    isControllerLine ? c.headerSerialEdit : null
                  }
                  serialLookup={
                    isControllerLine ? c.serialLookup : IDLE_SERIAL_LOOKUP
                  }
                  onFileReturnClaim={
                    isControllerLine ? c.handleFileReturnClaim : undefined
                  }
                  onOpenReturnHistory={
                    isControllerLine ? onOpenReturnHistory : undefined
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
                    if (isControllerLine) c.setCond(next);
                    patchReceivingLineCondition(line.id, next, {
                      condition_grade: line.condition_grade ?? null,
                      condition_graded_at: line.condition_graded_at ?? null,
                    });
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
                    markReceivingSerialAbsent(line.id, next, {
                      serial_absent: line.serial_absent ?? false,
                      serial_absent_reason: line.serial_absent_reason ?? null,
                    });
                  }}
                  units={units}
                  serialInputRef={isControllerLine ? c.serialRef : undefined}
                  autoFocusSerial={isControllerLine}
                  autoCommitDefaultGrade={
                    isControllerLine && !line.condition_graded_at
                  }
                  onEditFilledSerial={onEditFilledSerial}
                  stationCompact
                  dockOwnsCapture={dockOwnsCapture}
                  isActiveLine={isControllerLine}
                  // Outline-visibility only — NOT a capture-MOUNT gate
                  // (`resolveCaptureEntry` owns whether the row mounts). The
                  // dock's `activeKey` lights the cursor on this line alone.
                  activeStep={
                    isControllerLine && dockOwnsCapture ? activeStep : null
                  }
                  staffId={Number(staffId) || 0}
                  poRef={row.zoho_purchaseorder_number ?? null}
                  poRouteRef={
                    row.zoho_purchaseorder_id ??
                    row.zoho_purchaseorder_number ??
                    null
                  }
                  onArmCapture={() => {
                    // Sibling faces paint like the controller but only one line
                    // owns data-active-step + the po-line: scan sink. Promote
                    // before Tags / serial / condition arm so outline + sink
                    // catch up; local focus does not wait on this.
                    setActiveSinkId(`po-line:${line.id}`);
                    if (!isControllerLine) dispatchSelectLine(line);
                  }}
                />
              );
            }
          : undefined
      }
    />
  );
}
