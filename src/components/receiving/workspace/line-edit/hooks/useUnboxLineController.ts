'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from '@/lib/toast';
import {
  printReceivingLabel,
  markReceivingLabelPrinted,
  markReceivingSerialAbsent,
} from '../../receiving-label-helpers';
import { useSerialLookup, type SerialMatchedOrder } from '../../SerialMatchResult';
import { takeSerialEditHandoff } from '../../serialEditHandoff';
import { printProductLabel } from '@/lib/print/printProductLabel';
import { printAsListedLabel } from '@/lib/print/printAsListedLabel';
import { printTicketLabel } from '@/lib/print/printTicketLabel';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { useLineSerials } from './useLineSerials';
import { useReceiveAction } from './useReceiveAction';
import { useZohoLinePrefill } from './useZohoLinePrefill';
import { useReceivingLineCore } from './useReceivingLineCore';
import { useCartonLabelEditor } from './useCartonLabelEditor';
import { dispatchUnboxRailLineUpdated } from '@/components/sidebar/receiving/unbox-rail-events';
import { useSetting } from '@/hooks/useSettings';
import type { LabelEditDraft } from '../LabelEditPopover';
import type { AsListedLabelDraft } from '@/components/labels/AsListedEditPopover';
import { shouldUseLocalReceiveOnly } from '@/lib/receiving/intake-items-routing';
import {
  UNBOX_LABEL_KINDS,
  labelOptionsForSelect,
  listAvailableLabelOptions,
  resolveActiveLabelKind,
  workspaceLabelToFace,
  type WorkspaceLabelContext,
  type WorkspaceLabelKind,
} from '@/lib/print/workspace-label-kinds';

/**
 * Controller for the UNBOX + TRIAGE workspace display. Composes the mode-agnostic
 * `useReceivingLineCore` (carton identity / scratch / copy·share / priority) and
 * layers the unbox-specific domain on top: condition grade, serial scanning, the
 * receive/print action, the RETURN serial-match flow, and the printed-label
 * payload. Returns `{ ...core, ...unbox }` so the panel reads one object.
 *
 * Testing has its own controller (Phase 3) that composes the SAME core but swaps
 * this layer for verdicts + unit-id minting — so the shared carton logic lives in
 * exactly one place.
 */
export function useUnboxLineController(
  row: ReceivingLineRow,
  staffId: string,
  { itemTotal }: { itemTotal?: number },
) {
  const core = useReceivingLineCore(row, staffId, {
    dispatchLine: dispatchUnboxRailLineUpdated,
  });

  const [qa, setQa] = useState(
    !row.qa_status || row.qa_status === 'PENDING' ? 'PASSED' : row.qa_status,
  );
  const [disp, setDisp] = useState(
    !row.disposition_code || row.disposition_code === 'HOLD' ? 'ACCEPT' : row.disposition_code,
  );
  // Unfound cartons carry a placeholder carton grade (BRAND_NEW); the real grade
  // lives per line and defaults to USED_A.
  const initialCond =
    row.receiving_source === 'unmatched' ? 'USED_A' : row.condition_grade || 'USED_A';
  const [cond, setCond] = useState(initialCond);
  // Effective condition of the selected unit on a multi-qty line (reported up
  // from ReceivingUnitRows). Null on single-qty lines.
  const [unitLabelCondition, setUnitLabelCondition] = useState<string | null>(null);
  /**
   * Single durable note buffer for this line: hydrates from `receiving_lines.notes`,
   * composes the printed label face, and auto-saves back on blur. Formerly a split
   * ephemeral label buffer + a durable "internal" buffer — merged so the printed
   * note is durable and a reprint carries the same note (see LineNotesCard).
   */
  const [labelNotes, setLabelNotes] = useState(row.notes ?? '');
  const [serialInput, setSerialInput] = useState('');
  // Explicit "no serial number" waiver for this line (mutually exclusive with a
  // captured serial). Carries an auditable reason code and satisfies the optional
  // serial-confirmation gate (receiving.requireSerialConfirmation). Durable —
  // seeded from the persisted `receiving_line_testing.serial_absent` on the row,
  // committed via commitSerialAbsent (below), so it survives refresh / device.
  const [serialAbsent, setSerialAbsent] = useState(!!row.serial_absent);
  const [serialAbsentReason, setSerialAbsentReason] = useState<string | null>(
    row.serial_absent_reason ?? null,
  );
  // RETURN flow: on serial commit we check the serial against serial_units.
  const serialLookup = useSerialLookup();
  const [headerSerialEdit, setHeaderSerialEdit] = useState<{
    id?: number;
    serial_number: string;
    condition_grade?: string | null;
  } | null>(null);
  const [claimModalOpen, setClaimModalOpen] = useState(false);
  const [returnClaimPrefill, setReturnClaimPrefill] = useState<string | null>(null);
  // Guards the auto-bind-PO# effect so a matched order is only written once.
  const autoBoundOrderRef = useRef<string | null>(null);
  const [extraSerials, setExtraSerials] = useState<string[]>([]);
  const serialRef = useRef<HTMLInputElement>(null);

  // Reset the unbox-specific buffers on line/carton change. (Carton-level resets
  // live in the core.)
  useEffect(() => {
    setQa(!row.qa_status || row.qa_status === 'PENDING' ? 'PASSED' : row.qa_status);
    setDisp(!row.disposition_code || row.disposition_code === 'HOLD' ? 'ACCEPT' : row.disposition_code);
    setCond(row.receiving_source === 'unmatched' ? 'USED_A' : row.condition_grade || 'USED_A');
    setUnitLabelCondition(null);
  }, [row.id, row.qa_status, row.disposition_code, row.condition_grade, row.receiving_source]);

  // Hydrate the note buffer from the durable column on line change AND whenever the
  // persisted value updates (own blur-save echo, another device, an external edit)
  // so the composer and the printed label always reflect the saved note.
  useEffect(() => {
    setLabelNotes(row.notes ?? '');
  }, [row.id, row.notes]);

  // Track the previous line's label notes so the Label composer can offer a
  // "repeat previous" prefill on multi-line cartons. The workspace stays
  // mounted across sibling-line switches within the same carton (see
  // ReceivingRightPane's carton-keyed remount), so a ref-captured value
  // naturally survives from one line to the next.
  const labelNotesLiveRef = useRef(labelNotes);
  useEffect(() => {
    labelNotesLiveRef.current = labelNotes;
  }, [labelNotes]);
  const [prevLineNotes, setPrevLineNotes] = useState('');
  useEffect(() => {
    return () => setPrevLineNotes(labelNotesLiveRef.current);
  }, [row.id]);

  // Serial is per line; prefill from the row's recorded serials (most recent
  // wins) so the panel reflects what the table chip shows.
  useEffect(() => {
    const localSerials = (row.serials ?? []) as Array<{ serial_number?: string | null }>;
    const latest = localSerials.length > 0
      ? String(localSerials[localSerials.length - 1]?.serial_number || '').trim()
      : '';
    setSerialInput(latest);
  }, [row.id, row.serials]);

  // Seed the no-serial waiver from the line's DURABLE value on line change AND
  // whenever the persisted fact updates — a fresh open, a reload, another device,
  // or the optimistic `receiving-line-updated` bus patch from commitSerialAbsent
  // all reconcile here (it's a per-line fact now, not ephemeral per-mount state).
  useEffect(() => {
    setSerialAbsent(!!row.serial_absent);
    setSerialAbsentReason(row.serial_absent_reason ?? null);
  }, [row.id, row.serial_absent, row.serial_absent_reason]);

  // Quick-return hotkey: Escape re-focuses the serial scan input from anywhere
  // in the unbox panel, so the operator can resume scanning without reaching for
  // the mouse. Only fires when no modal/dialog/select is currently active
  // (avoids intercepting Escape from popovers, search fields, select elements).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const active = document.activeElement;
      if (active === serialRef.current) return;
      const tag = (active as HTMLElement | null)?.tagName ?? '';
      // Let Escape do its natural job inside text inputs and selects — only
      // intercept when focus is on a button, icon, or neutral element.
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      // Aria-modal or role=dialog above us → a popover is open, let it handle the key.
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      e.preventDefault();
      serialRef.current?.focus();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Clear any RETURN match when switching lines.
  useEffect(() => {
    serialLookup.reset();
  }, [row.id, serialLookup.reset]);

  // Consume a serial-edit handoff queued by Edit on a non-active accordion row.
  useEffect(() => {
    const handoff = takeSerialEditHandoff(row.id);
    if (handoff) setHeaderSerialEdit(handoff);
  }, [row.id]);

  // Prefill Zendesk, listing, and serial from Zoho PO notes + line description.
  useZohoLinePrefill({
    row,
    setZendesk: core.setZendesk,
    setListingLink: core.setListingLink,
    setSerialInput,
  });

  const {
    serialSubmitting,
    submitSerial,
    enqueueSerial,
    deleteSerialUnit,
    replaceSerialUnit,
    setUnitGrade,
  } = useLineSerials({
    row,
    staffId,
    receivingType: core.receivingType,
    serialInput,
    setSerialInput,
    serialLookup,
    serialInputRef: serialRef,
  });

  const submitExtraSerial = useCallback(async (idx: number) => {
    const serial = (extraSerials[idx] ?? '').trim();
    if (!serial) return;
    await submitSerial(serial);
    setExtraSerials((xs) => xs.filter((_, j) => j !== idx));
  }, [extraSerials, submitSerial]);

  const {
    receiving,
    receiveResult,
    setReceiveResult,
    responseExpanded,
    setResponseExpanded,
    handleReceive,
  } = useReceiveAction(row, {
    qa,
    disp,
    cond,
    // One note buffer feeds the receive payload too — what's on the label is what's
    // received and what's saved.
    notes: labelNotes,
    zendesk: core.zendesk,
    listingLink: core.listingLink,
    serialInput,
    serialAbsent,
    serialAbsentReason,
    staffId,
  });

  const scanValue = core.poNumber || (row.receiving_id != null ? `RCV-${row.receiving_id}` : '');
  const isMultiQtyLine = (row.quantity_expected ?? 0) > 1;
  const labelConditionCode = isMultiQtyLine && unitLabelCondition ? unitLabelCondition : cond;

  const persistLabelNotes = useCallback(
    (notes: string) => {
      setLabelNotes(notes);
      void core.patch({ notes });
    },
    [core.patch],
  );

  // Shared carton-label editor (same SoT as Testing).
  const cartonLabel = useCartonLabelEditor(row, core, {
    conditionCode: labelConditionCode,
    notes: labelNotes,
    onPersistNotes: persistLabelNotes,
  });

  // As Listed disclosure — print-time override for the seller-defect phrase.
  const [asListedOverride, setAsListedOverride] = useState<{
    disclosure?: string;
    conditionCode?: string;
    corner?: string;
    date?: string;
  }>({});
  useEffect(() => setAsListedOverride({}), [row.id]);

  const asListedDraftDefaults: AsListedLabelDraft = useMemo(
    () => ({
      disclosure: asListedOverride.disclosure ?? labelNotes,
      conditionCode: asListedOverride.conditionCode ?? labelConditionCode,
      corner: asListedOverride.corner ?? cartonLabel.derivedPlatform,
      date: asListedOverride.date ?? cartonLabel.derivedDate,
    }),
    [
      asListedOverride,
      labelNotes,
      labelConditionCode,
      cartonLabel.derivedPlatform,
      cartonLabel.derivedDate,
    ],
  );

  const buildAsListedPayload = useCallback(
    (draft: AsListedLabelDraft) => ({
      disclosure: draft.disclosure.trim(),
      conditionCode: draft.conditionCode,
      corner: draft.corner.trim(),
      date: draft.date.trim() || null,
      receivingLineId: row.id ?? null,
      receivingId: row.receiving_id ?? null,
    }),
    [row.id, row.receiving_id],
  );

  const asListedPayload = useMemo(
    () => buildAsListedPayload(asListedDraftDefaults),
    [buildAsListedPayload, asListedDraftDefaults],
  );

  const ticketDigits = cartonLabel.derivedTicket;
  const ticketPayload = useMemo(
    () =>
      ticketDigits
        ? {
            ticketDigits,
            context: (row.sku || core.poNumber || '').trim() || null,
            platform: cartonLabel.derivedPlatform,
          }
        : null,
    [ticketDigits, row.sku, core.poNumber, cartonLabel.derivedPlatform],
  );

  const unitInput = useMemo(() => {
    const skuTrim = (row.sku || '').trim();
    if (!skuTrim) return null;
    return {
      sku: skuTrim,
      title: row.item_name ?? undefined,
      serialNumber: serialInput.trim() || undefined,
      condition: labelConditionCode,
    };
  }, [row.sku, row.item_name, serialInput, labelConditionCode]);

  const labelCtx: WorkspaceLabelContext = useMemo(
    () => ({
      hasCarton: row.receiving_id != null && row.receiving_id > 0,
      scanValue,
      sku: row.sku,
      receivingType: core.receivingType,
      disclosureNote: labelNotes,
      ticketDigits,
      cartonPayload: cartonLabel.defaultPayload,
      unitInput,
      asListedPayload,
      ticketPayload,
    }),
    [
      row.receiving_id,
      row.sku,
      scanValue,
      core.receivingType,
      labelNotes,
      ticketDigits,
      cartonLabel.defaultPayload,
      unitInput,
      asListedPayload,
      ticketPayload,
    ],
  );

  const labelOptions = useMemo(
    () => listAvailableLabelOptions(UNBOX_LABEL_KINDS, labelCtx),
    [labelCtx],
  );
  const labelSelectOptions = useMemo(() => labelOptionsForSelect(labelOptions), [labelOptions]);

  const [selectedLabelKind, setSelectedLabelKind] = useState<string>('carton');
  useEffect(() => {
    setSelectedLabelKind('carton');
  }, [row.id]);

  const activeLabelKind = resolveActiveLabelKind(selectedLabelKind, labelOptions, 'carton');
  const activeLabelFace = useMemo(
    () => workspaceLabelToFace(activeLabelKind, labelCtx),
    [activeLabelKind, labelCtx],
  );

  // Stamp the "label printed" marker + event so the row chips flip.
  const markLabelPrinted = useCallback(() => {
    markReceivingLabelPrinted(row.id);
  }, [row.id]);

  const printKind = useCallback(
    (kind: WorkspaceLabelKind | string) => {
      const k = kind as WorkspaceLabelKind;
      let didPrint = false;
      switch (k) {
        case 'carton':
          if (cartonLabel.defaultPayload) {
            printReceivingLabel(cartonLabel.defaultPayload);
            didPrint = true;
          }
          break;
        case 'unit':
          if (unitInput) {
            printProductLabel(unitInput);
            didPrint = true;
          }
          break;
        case 'as_listed':
          printAsListedLabel(asListedPayload);
          didPrint = true;
          break;
        case 'ticket_minimal':
          if (ticketPayload) {
            printTicketLabel(ticketPayload);
            didPrint = true;
          }
          break;
        default:
          break;
      }
      if (didPrint) markLabelPrinted();
      return didPrint;
    },
    [cartonLabel.defaultPayload, unitInput, asListedPayload, ticketPayload, markLabelPrinted],
  );

  /** Print the currently selected preview label (dock "Print only"). */
  const runPrintLabel = useCallback(() => {
    printKind(activeLabelKind);
  }, [printKind, activeLabelKind]);

  /**
   * Industry default for Print · Receive: always carton when available, else
   * the active selection / unit fallback.
   */
  const runPrimaryPrint = useCallback(() => {
    if (cartonLabel.defaultPayload) {
      printKind('carton');
      return;
    }
    printKind(activeLabelKind);
  }, [cartonLabel.defaultPayload, printKind, activeLabelKind]);

  const applyAsListedAndPrint = useCallback(
    (draft: AsListedLabelDraft) => {
      setAsListedOverride({
        disclosure: draft.disclosure,
        conditionCode: draft.conditionCode,
        corner: draft.corner,
        date: draft.date,
      });
      if ((draft.conditionCode || '') !== (labelConditionCode || '')) {
        setCond(draft.conditionCode);
        void core.patch({ condition_grade: draft.conditionCode });
      }
      if (draft.disclosure.trim() && draft.disclosure.trim() !== labelNotes) {
        persistLabelNotes(draft.disclosure.trim());
      }
      printAsListedLabel(buildAsListedPayload(draft));
      markLabelPrinted();
    },
    [labelConditionCode, labelNotes, core.patch, persistLabelNotes, buildAsListedPayload, markLabelPrinted],
  );

  const applyUnitAndPrint = useCallback(
    (draft: { title: string; color: string; condition: string }) => {
      const skuTrim = (row.sku || '').trim();
      if (!skuTrim) return;
      if ((draft.condition || '') !== (labelConditionCode || '')) {
        setCond(draft.condition);
        void core.patch({ condition_grade: draft.condition });
      }
      printProductLabel({
        sku: skuTrim,
        title: draft.title,
        serialNumber: serialInput.trim() || undefined,
        condition: draft.condition,
        color: draft.color,
      });
      markLabelPrinted();
    },
    [row.sku, labelConditionCode, serialInput, core.patch, markLabelPrinted],
  );

  // Back-compat aliases for callers still using the old carton field names.
  const labelPayload = cartonLabel.defaultPayload;
  const labelDraftDefaults = cartonLabel.draftDefaults;
  const buildLabelPayload = cartonLabel.buildPayload;
  const applyAndPrintLabel = useCallback(
    (draft: LabelEditDraft) => {
      if ((draft.conditionCode || '') !== (cond || '')) {
        setCond(draft.conditionCode);
      }
      cartonLabel.applyAndPrint(draft);
    },
    [cond, cartonLabel.applyAndPrint],
  );

  // Unfound, return, and sales-order-linked cartons have no Zoho PO to receive against.
  const isUnfound = shouldUseLocalReceiveOnly(row);

  const handlePrintAndReceive = useCallback(() => {
    runPrimaryPrint();
    handleReceive(isUnfound ? 'local_receive' : 'zoho_receive');
  }, [runPrimaryPrint, handleReceive, isUnfound]);

  const canPrintReview = labelOptions.length > 0;
  const canReceiveReview = row.receiving_id != null;
  // Zoho receive is only valid for matched cartons; unfound stays local-only.
  const canZohoReceive = canReceiveReview && !isUnfound;
  // Optional org gate: Receive stays blocked until the operator captures a serial
  // OR explicitly waives it (no-serial + reason). Default off — non-breaking.
  const requireSerialConfirmation =
    useSetting<boolean>('receiving', 'receiving.requireSerialConfirmation').value ?? false;
  const hasCapturedSerial =
    serialInput.trim().length > 0 ||
    (row.serials ?? []).some(
      (s) => String((s as { serial_number?: string | null }).serial_number ?? '').trim().length > 0,
    );
  const serialWaived = serialAbsent && Boolean(serialAbsentReason);
  const serialConfirmed = !requireSerialConfirmation || hasCapturedSerial || serialWaived;
  const combinedReviewDisabled = !canReceiveReview || !canPrintReview || !serialConfirmed;
  // Bench-visible reason for the disabled Receive bar. A hover `title` is
  // invisible to an operator standing at a station — the bar renders this
  // line above the pill so the blocker names itself.
  const combinedReviewDisabledReason = !canReceiveReview
    ? 'Link this carton to a shipment to receive'
    : !canPrintReview
      ? 'Add a PO number or SKU before printing and receiving'
      : !serialConfirmed
        ? 'Scan a serial — or mark “No serial” with a reason — to receive'
        : null;
  // itemTotal is PO-scoped (workspace nav / useReceivingWorkspaceBridge) so
  // "Receive all" never claims lines from a different PO on a mixed carton.
  const isSinglePoItem = itemTotal === 1;
  const receiveMenuLabel = isSinglePoItem ? 'Receive' : 'Receive all';
  const printReceivePrimaryLabel = isUnfound ? 'Receive locally' : receiveMenuLabel;
  // Unfound cartons have no Zoho/scan options in the menu — just print-only and
  // a local "receive all". Keep the menu copy honest so it matches what's shown.
  const splitMenuAriaLabel = isUnfound
    ? 'Print only, or receive all locally (no print)'
    : isSinglePoItem
      ? 'Print only, mark as scanned, or receive (no print)'
      : 'Print only, mark as scanned, or receive all (no print)';
  const splitMenuHoverTitle = isUnfound
    ? 'Hover for print-only or receive all locally — external inventory is not touched'
    : isSinglePoItem
      ? 'Hover for print-only, mark as scanned, or receive without print'
      : 'Hover for print-only, mark as scanned, or receive all without print';
  const receiveMenuTitle = isUnfound
    ? 'Unfound carton — no external PO to receive against; use Receive locally'
    : row.receiving_id == null
      ? 'Line must be linked to a shipment'
      : undefined;
  const printThenReceiveTitle =
    row.receiving_id == null && !scanValue.trim() && !(row.sku || '').trim()
      ? 'Need a shipment link or SKU to continue'
      : isUnfound
        ? 'Print label (if available), then receive locally — unfound carton, external inventory is not touched'
        : isSinglePoItem
          ? 'Print label (if available), then receive this line into inventory'
          : 'Print label (if available), then receive every open line on this PO';

  // Pair the carton with the shipped order a scanned serial matched. Fires for
  // ANY line once a return is detected (not just a pre-typed RETURN) — the server
  // has already persisted the link + carton display rep; this mirrors the order#
  // into the PO# field instantly for the label/scan value. Guarded so it writes
  // once and never overwrites an operator/Zoho-set PO#.
  useEffect(() => {
    if (serialLookup.state !== 'found') return;
    const orderNo = (serialLookup.matchedOrder?.order_id || '').trim();
    if (!orderNo) return;
    if (autoBoundOrderRef.current === orderNo) return;
    autoBoundOrderRef.current = orderNo;
    // Populate the listing link so the carton's listing chip opens the exact
    // marketplace listing (the import path sets this server-side; the serial
    // path sets it here since core.listingLink doesn't re-seed same-carton).
    const listingUrl = (serialLookup.matchedOrder?.listing_url || '').trim();
    if (listingUrl && !core.listingLink) core.setListingLink(listingUrl);
    if (core.poNumber) return; // never overwrite an operator/Zoho-set PO#
    void core.persistPoNumber(orderNo);
  }, [serialLookup.state, serialLookup.matchedOrder, core.poNumber, core.persistPoNumber, core.listingLink, core.setListingLink]);

  // Reset the auto-bind guard when the line changes.
  useEffect(() => {
    autoBoundOrderRef.current = null;
  }, [row.id]);

  // "File return claim" CTA: ensure the order is paired, then open the claim
  // modal pre-filled with the matched order + serial.
  const handleFileReturnClaim = useCallback(
    (matchedOrder: SerialMatchedOrder | null, explicitSerial?: string) => {
      const orderNo = (matchedOrder?.order_id || '').trim();
      const title = (matchedOrder?.product_title || '').trim();
      const sn = (explicitSerial ?? serialLookup.serial).trim();
      if (orderNo && !core.poNumber) {
        autoBoundOrderRef.current = orderNo;
        void core.persistPoNumber(orderNo);
      }
      const lines = ['Return received and matched to a previously shipped order.'];
      if (title) lines.push(`Item: ${title}.`);
      if (orderNo) lines.push(`Original order: ${orderNo}.`);
      if (matchedOrder?.tracking_number) lines.push(`Shipped tracking: ${matchedOrder.tracking_number}.`);
      if (sn) lines.push(`Serial: ${sn}.`);
      setReturnClaimPrefill(lines.join(' '));
      setClaimModalOpen(true);
    },
    [serialLookup.serial, core.poNumber, core.persistPoNumber],
  );

  // PO-number field commit: first try to IMPORT a sales order by this number
  // (resolves an `orders` row → classifies the carton as a return: type RETURN,
  // listing populated, order# as display rep, off the Unfound queue). If the
  // value isn't a sales order, fall back to the normal PO# persist. So the one
  // field handles both "type a PO#" and "import a return order#".
  const commitPoNumberOrImportOrder = useCallback(
    async (value: string) => {
      const trimmed = value.trim();
      const current = (row.zoho_purchaseorder_number || row.zoho_purchaseorder_id || '').trim();
      const fallbackPersistPo = () => {
        if (trimmed !== current) void core.persistPoNumber(trimmed);
      };
      if (!trimmed || row.receiving_id == null) {
        fallbackPersistPo();
        return;
      }
      try {
        const res = await fetch('/api/receiving/import-sales-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            order_number: trimmed,
            receiving_id: row.receiving_id,
            receiving_line_id: row.id,
          }),
        });
        const data = await res.json().catch(() => null);
        if (res.ok && data?.success && data.imported) {
          // Reflect the import: type → RETURN (drives the label + listing chip),
          // listing populated, PO editor closed. setReceivingType is the instant
          // local flip; the row patch below carries the durable type/source/PO#/
          // status so every surface re-seeds — listingLink doesn't re-seed from
          // the row, so set it here.
          core.setReceivingType('RETURN');
          const listingUrl = data.matched_order?.listing_url as string | undefined;
          if (listingUrl) core.setListingLink(listingUrl);
          core.setPoEditorOpen(false);
          autoBoundOrderRef.current = trimmed;
          toast.success(`Imported order ${data.matched_order?.order_id ?? trimmed} as a return`);
          // Apply the server's exact line patch optimistically — type→RETURN,
          // listing, carton source flip, order# display rep, and received status
          // all land in one merge. Replaces the old heavy /api/receiving-lines
          // refetch (one of the app's most expensive queries) with a zero-fetch
          // patch, so the workspace flips instantly and durably.
          if (data.line_patch) {
            dispatchUnboxRailLineUpdated(
              data.line_patch as Partial<ReceivingLineRow> & { id: number },
            );
          }
          return;
        }
      } catch {
        /* fall through to a plain PO# persist */
      }
      fallbackPersistPo();
    },
    [
      row.receiving_id,
      row.id,
      row.zoho_purchaseorder_number,
      row.zoho_purchaseorder_id,
      core.persistPoNumber,
      core.setReceivingType,
      core.setListingLink,
      core.setPoEditorOpen,
    ],
  );

  // Single durable choke point for the green-check no-serial waiver. Updates the
  // local controller state (the active-row control reflects instantly) AND
  // persists via markReceivingSerialAbsent, which optimistically patches the
  // shared bus so the Unbox stepper's Serial step flips on the same frame, then
  // stamps receiving_line_testing so the waiver survives refresh / another device.
  const commitSerialAbsent = useCallback(
    ({ absent, reason }: { absent: boolean; reason: string | null }) => {
      setSerialAbsent(absent);
      setSerialAbsentReason(reason);
      markReceivingSerialAbsent(row.id, { absent, reason });
    },
    [row.id],
  );

  return {
    ...core,
    // condition / qa / disposition
    qa, setQa, disp, setDisp,
    cond, setCond, unitLabelCondition, setUnitLabelCondition, isMultiQtyLine,
    // notes — one durable buffer: composes the label face AND is `receiving_lines.notes`
    labelNotes, setLabelNotes, prevLineNotes,
    // serial scanning
    serialInput, setSerialInput, serialRef,
    serialAbsent, setSerialAbsent, serialAbsentReason, setSerialAbsentReason, commitSerialAbsent,
    headerSerialEdit, setHeaderSerialEdit,
    serialLookup,
    serialSubmitting, submitSerial, enqueueSerial, deleteSerialUnit, replaceSerialUnit, setUnitGrade,
    extraSerials, setExtraSerials, submitExtraSerial,
    // receive / print
    receiving, receiveResult, setReceiveResult, responseExpanded, setResponseExpanded, handleReceive,
    scanValue, labelPayload, runPrintLabel, runPrimaryPrint, printKind, handlePrintAndReceive,
    // custom label print (Edit on the label preview)
    labelDraftDefaults, buildLabelPayload, applyAndPrintLabel,
    // workspace label kind selection (preview dropdown + dock pre-select)
    labelOptions, labelSelectOptions, selectedLabelKind, setSelectedLabelKind, activeLabelKind,
    activeLabelFace, unitInput,     asListedDraftDefaults, buildAsListedPayload, applyAsListedAndPrint,
    asListedPayload, ticketPayload, applyUnitAndPrint,
    canPrintReview, canReceiveReview, canZohoReceive, isUnfound, combinedReviewDisabled, combinedReviewDisabledReason, requireSerialConfirmation,
    receiveMenuLabel, receiveMenuTitle, printReceivePrimaryLabel, splitMenuAriaLabel, splitMenuHoverTitle, printThenReceiveTitle,
    // claim / RETURN flow
    claimModalOpen, setClaimModalOpen, returnClaimPrefill, setReturnClaimPrefill,
    handleFileReturnClaim,
    commitPoNumberOrImportOrder,
  };
}
