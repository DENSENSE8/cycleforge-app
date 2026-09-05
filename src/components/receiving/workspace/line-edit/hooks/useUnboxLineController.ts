'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, skipToken } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/lib/toast';
import {
  receivingPhotosQueryKey,
  receivingSiblingsQueryKey,
  type ReceivingSiblingsCache,
} from '@/lib/queries/receiving-queries';
import {
  deriveReceivingPhotoStageCounts,
  evaluateReceivingPhotoPolicy,
} from '@/lib/receiving/photo-policy';
import type { ReceivingPhotoPolicy } from '@/lib/settings/accessors';
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
import { refreshDomains } from '@/lib/refresh/bus';
import { REFRESH_BUNDLES } from '@/lib/refresh/domains';
import { UNBOX_SURFACE_ROUTE } from '@/lib/receiving/surface-path';
import { useSetting } from '@/hooks/useSettings';
import type { LabelEditDraft } from '../LabelEditPopover';
import type { AsListedLabelDraft } from '@/components/labels/AsListedEditPopover';
import { shouldUseLocalReceiveOnly } from '@/lib/receiving/intake-items-routing';
import { cartonLinesReadyForGr } from '@/lib/receiving/carton-readiness';
import { isUnreceiveSerialBlocking } from '@/lib/receiving/unreceive-serial-guard';
import type { PhotoPolicyOverrideCode } from '@/lib/receiving/exception-codes';
import { cartonLinesReadyForGr } from '@/lib/receiving/carton-readiness';
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
  {
    itemTotal,
    /** Unbox Claim push — opens `?claimView=1` (LineEditPanel wires setClaimView). */
    onOpenClaim,
  }: {
    itemTotal?: number;
    onOpenClaim?: (mode: 'create' | 'link') => void;
  } = {},
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
   * TWO durable buffers, one per GRAIN of text on this line (split 2026-07-31,
   * migration `2026-07-31b_receiving_lines_label_note.sql`):
   *
   *   itemNote  ← `receiving_line.notes`      — the operator's item note
   *               (Zoho / receive). On Unbox overview the live draft also
   *               drives the carton sticker center (preview + Print · Receive).
   *               Composed in the Notes dock ({@link LineNotesCard}).
   *   labelNote ← `receiving_line.label_note` — durable printed face center
   *               (Testing reprint + LabelEditPopover / As Listed). Stamped
   *               from itemNote on carton print so reprint stays aligned.
   *
   * They were one buffer until the split, so an operator could not write a note
   * that did not print, nor re-word a label without rewriting the record's
   * note. The migration backfills `label_note := notes`, so both start equal on
   * existing cartons; they diverge when LabelEditPopover edits without the dock
   * (overview still prefers the dock draft for live center).
   */
  const [itemNote, setItemNote] = useState(row.notes ?? '');
  const [labelNote, setLabelNote] = useState(row.label_note ?? '');
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
  /**
   * Opens the Unbox Claim push column (`?claimView=1`). Host provides
   * `onOpenClaim` (URL setter); without it this is a no-op (non-Unbox callers
   * should not use this controller path for claims).
   */
  const openClaimModal = useCallback(
    (mode: 'create' | 'link' = 'create') => {
      onOpenClaim?.(mode);
    },
    [onOpenClaim],
  );
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

  // Hydrate each buffer from its OWN durable column on line change AND whenever
  // the persisted value updates (own blur-save echo, another device, an external
  // edit) so the composer shows the saved note and the preview shows the saved
  // face. Separate effects: an item-note save must not re-seed the label face.
  useEffect(() => {
    setItemNote(row.notes ?? '');
  }, [row.id, row.notes]);
  useEffect(() => {
    setLabelNote(row.label_note ?? '');
  }, [row.id, row.label_note]);

  // Track the previous line's item note so the Notes composer can offer a
  // "repeat previous" prefill on multi-line cartons. The workspace stays
  // mounted across sibling-line switches within the same carton (see
  // ReceivingRightPane's carton-keyed remount), so a ref-captured value
  // naturally survives from one line to the next. Recent (History) itself
  // reads the DB via /api/receiving/recent-label-note — not this slot.
  const itemNoteLiveRef = useRef(itemNote);
  useEffect(() => {
    itemNoteLiveRef.current = itemNote;
  }, [itemNote]);
  const [prevLineNotes, setPrevLineNotes] = useState('');
  useEffect(() => {
    return () => {
      setPrevLineNotes(itemNoteLiveRef.current);
    };
  }, [row.id]);

  // Serial is per line; seed the label/receive buffer once when the active
  // line changes. Do NOT re-seed on every `row.serials` publish — optimistic
  // confirm used to clear then refill serialInput and bounce the workspace.
  const rowSerialsRef = useRef(row.serials);
  rowSerialsRef.current = row.serials;
  useEffect(() => {
    const localSerials = (rowSerialsRef.current ?? []) as Array<{ serial_number?: string | null }>;
    const latest = localSerials.length > 0
      ? String(localSerials[localSerials.length - 1]?.serial_number || '').trim()
      : '';
    setSerialInput(latest);
  }, [row.id]);

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
  // Clear any prior line's edit target so sibling switches don't carry it over.
  useEffect(() => {
    const handoff = takeSerialEditHandoff(row.id);
    setHeaderSerialEdit(handoff);
  }, [row.id]);

  // Sibling PO-line clicks keep the workspace mounted (carton-keyed remount only).
  // Re-focus the serial scan field on every line switch so the operator can keep
  // scanning without clicking into the input. Skip the carton's first paint
  // (SerialCard / stepper owns that).
  const skipSerialFocusOnMountRef = useRef(true);
  useEffect(() => {
    if (skipSerialFocusOnMountRef.current) {
      skipSerialFocusOnMountRef.current = false;
      return;
    }
    const focus = () => {
      const el = serialRef.current;
      if (!el || el.disabled) return;
      el.focus({ preventScroll: true });
    };
    focus();
    const t0 = globalThis.setTimeout(focus, 0);
    // PoLineRow body expand + click-focus on the sibling chrome can land after
    // the first tick — a short follow-up keeps the caret in Serial.
    const t1 = globalThis.setTimeout(focus, 50);
    return () => {
      globalThis.clearTimeout(t0);
      globalThis.clearTimeout(t1);
    };
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
    handleReceive: runReceive,
  } = useReceiveAction(row, {
    qa,
    disp,
    cond,
    // The receive payload carries the OPERATOR note, not the label face: this is
    // the text that lands on the record and gets pushed to the synced PO note.
    // The printed face (`labelNote`) is a print artifact and stays out of Zoho.
    notes: itemNote,
    zendesk: core.zendesk,
    listingLink: core.listingLink,
    serialInput,
    serialAbsent,
    serialAbsentReason,
    staffId,
  });

  // After local commit, pull the Inventory dossier so Information / Lines /
  // Activity trail match Zoho without waiting on a manual F5 Refresh.
  const handleReceive = useCallback(
    (
      receiveIntent: 'zoho_receive' | 'scan_only' | 'local_receive' | 'unreceive' = 'zoho_receive',
      options?: { photoPolicyOverride: PhotoPolicyOverrideCode },
    ): Promise<boolean> =>
      runReceive(receiveIntent, options).then((ok) => {
        if (ok) void core.refreshInventoryDossier();
        return ok;
      }),
    [runReceive, core.refreshInventoryDossier],
  );

  const scanValue =
    core.poNumber
    || (row.receiving_id != null ? `RCV-${row.receiving_id}` : '')
    || (row.tracking_number ?? '').trim();
  const isMultiQtyLine = (row.quantity_expected ?? 0) > 1;
  const labelConditionCode = isMultiQtyLine && unitLabelCondition ? unitLabelCondition : cond;

  /** Persist the PRINTED face text — `label_note`, never the operator's note. */
  const persistLabelNote = useCallback(
    (nextLabelNote: string) => {
      setLabelNote(nextLabelNote);
      void core.patch({ label_note: nextLabelNote });
    },
    [core.patch],
  );

  /** Persist the operator's item note — `notes` only (not `label_note`). */
  const persistItemNote = useCallback(
    (nextItemNote: string) => {
      setItemNote(nextItemNote);
      void core.patch({ notes: nextItemNote });
    },
    [core.patch],
  );

  // Shared carton-label editor (same SoT as Testing). Its `notes` field IS the
  // printed center slot, so it reads and writes `label_note`.
  const cartonLabel = useCartonLabelEditor(row, core, {
    conditionCode: labelConditionCode,
    notes: labelNote,
    onPersistNotes: persistLabelNote,
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
      // The disclosure IS printed text, so it seeds from the label face buffer.
      disclosure: asListedOverride.disclosure ?? labelNote,
      conditionCode: asListedOverride.conditionCode ?? labelConditionCode,
      corner: asListedOverride.corner ?? cartonLabel.derivedPlatform,
      date: asListedOverride.date ?? cartonLabel.derivedDate,
    }),
    [
      asListedOverride,
      labelNote,
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

  const { user: authUser } = useAuth();
  const unitInput = useMemo(() => {
    const skuTrim = (row.sku || '').trim();
    if (!skuTrim) return null;
    return {
      sku: skuTrim,
      title: row.item_name ?? undefined,
      serialNumber: serialInput.trim() || undefined,
      orgSlug: authUser?.organizationSlug ?? null,
      condition: labelConditionCode,
    };
  }, [row.sku, row.item_name, serialInput, labelConditionCode, authUser?.organizationSlug]);

  // Unbox overview: dock draft (`itemNote`) is the live carton face center —
  // preview + Print · Receive. Editor still seeds from `labelNote`; columns
  // stay separate (dock save patches `notes` only; print stamps `label_note`).
  const liveCartonPayload = useMemo(
    () =>
      cartonLabel.defaultPayload
        ? { ...cartonLabel.defaultPayload, notes: itemNote }
        : null,
    [cartonLabel.defaultPayload, itemNote],
  );

  const labelCtx: WorkspaceLabelContext = useMemo(
    () => ({
      hasCarton: row.receiving_id != null && row.receiving_id > 0,
      scanValue,
      sku: row.sku,
      receivingType: core.receivingType,
      // Availability of the As Listed kind keys off the PRINTED disclosure text,
      // not the operator's item note — the two are separate buffers now.
      disclosureNote: labelNote,
      ticketDigits,
      cartonPayload: liveCartonPayload,
      unitInput,
      asListedPayload,
      ticketPayload,
    }),
    [
      row.receiving_id,
      row.sku,
      scanValue,
      core.receivingType,
      labelNote,
      ticketDigits,
      liveCartonPayload,
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
  // Dock "Edit label" bumps this; UnboxLabelPreview opens the matching editor.
  const [labelEditorRequestId, setLabelEditorRequestId] = useState(0);
  const requestLabelEditor = useCallback(() => {
    setLabelEditorRequestId((n) => n + 1);
  }, []);
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
    markReceivingLabelPrinted(row.id, row.label_printed_at ?? null);
  }, [row.id, row.label_printed_at]);

  const printKind = useCallback(
    (kind: WorkspaceLabelKind | string) => {
      const k = kind as WorkspaceLabelKind;
      let didPrint = false;
      switch (k) {
        case 'carton':
          if (liveCartonPayload) {
            printReceivingLabel(liveCartonPayload);
            // Stamp label_note from what just printed so Testing / reprint /
            // LabelEditPopover stay aligned with the overview face.
            if (itemNote.trim() !== labelNote.trim()) {
              persistLabelNote(itemNote);
            }
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
    [
      liveCartonPayload,
      itemNote,
      labelNote,
      persistLabelNote,
      unitInput,
      asListedPayload,
      ticketPayload,
      markLabelPrinted,
    ],
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
    if (liveCartonPayload) {
      printKind('carton');
      return;
    }
    printKind(activeLabelKind);
  }, [liveCartonPayload, printKind, activeLabelKind]);

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
      // An edited disclosure is printed text — it persists to the label face,
      // leaving the operator's item note untouched.
      if (draft.disclosure.trim() && draft.disclosure.trim() !== labelNote) {
        persistLabelNote(draft.disclosure.trim());
      }
      printAsListedLabel(buildAsListedPayload(draft));
      markLabelPrinted();
    },
    [labelConditionCode, labelNote, core.patch, persistLabelNote, buildAsListedPayload, markLabelPrinted],
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
        orgSlug: authUser?.organizationSlug ?? null,
        condition: draft.condition,
        color: draft.color,
      });
      markLabelPrinted();
    },
    [row.sku, labelConditionCode, serialInput, core.patch, markLabelPrinted, authUser?.organizationSlug],
  );

  // Back-compat aliases for callers still using the old carton field names.
  // Overview preview/print center is dock-driven (`liveCartonPayload`).
  const labelPayload = liveCartonPayload;
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

  /**
   * Dogfood primary: print dialog + receive in one click. Face says Receive;
   * print opens synchronously so the browser dialog is not blocked by the
   * async receive. Already-received lines stay print-only (terminal routes
   * those separately).
   */
  const handlePrintAndReceive = useCallback(() => {
    runPrimaryPrint();
    void handleReceive(isUnfound ? 'local_receive' : 'zoho_receive');
  }, [runPrimaryPrint, handleReceive, isUnfound]);

  const canPrintReview = labelOptions.length > 0;
  const canReceiveReview = row.receiving_id != null;
  // Fully received ⇔ the line reached DONE. `received_done_at` is stamped by a
  // DB trigger on that transition, so EVERY write path gets it for free — this
  // bench, mark-received-po, the phone, and the Zoho-received reconcile — and
  // none of them can drift.
  //
  // Deliberately NOT `workflow_status === 'UNBOXED'`: that state is ambiguous.
  // `/api/receiving/match` advances a merely-linked line to UNBOXED, and a
  // failed Zoho receive parks a line there ("inventory committed, Zoho
  // pending"). Both must keep the Receive CTA — the first was never received,
  // the second needs a retry.
  // Stamp may still be a Date on a stale client patch — coerce before trim.
  const isReceived = Boolean(String(row.received_done_at ?? '').trim());
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
  const perUnitAbsentCount = (row.units ?? []).filter((u) => u.serial_absent).length;
  const expectedQty = row.quantity_expected ?? 0;
  const serialAccounted =
    (row.serials ?? []).filter((s) =>
      String((s as { serial_number?: string | null }).serial_number ?? '').trim(),
    ).length + perUnitAbsentCount;
  const serialWaived = serialAbsent && Boolean(serialAbsentReason);
  const unitsSatisfied =
    expectedQty > 0 ? serialAccounted >= expectedQty : hasCapturedSerial;
  const serialConfirmed =
    !requireSerialConfirmation || unitsSatisfied || serialWaived;
  // Org photo policy (`receiving.photoPolicy`, WS-PHOTO Plan 5) — same
  // settings-page cache as the serial gate above, so reading it costs no extra
  // request. Unknown/loading values degrade to 'optional' (never block on a
  // setting we can't see; the server gate is the backstop).
  const photoPolicyRaw = useSetting<ReceivingPhotoPolicy>('receiving', 'receiving.photoPolicy').value;
  const photoPolicy: ReceivingPhotoPolicy =
    photoPolicyRaw === 'require_one' || photoPolicyRaw === 'require_per_item'
      ? photoPolicyRaw
      : 'optional';
  // Preflight evidence = the carton photo list the entity-header photo pill
  // already keeps warm (same queryKey → same cache entry; rows carry
  // receivingLineId + caption = photo_type). Enabled only when the policy can
  // actually block, so the 'optional' default adds zero fetches.
  const photoPolicyQueryEnabled =
    photoPolicy !== 'optional' && row.receiving_id != null && row.receiving_id > 0;
  const { data: photoPolicyPhotos } = useQuery<{
    photos?: Array<{ id: number; receivingLineId: number | null; caption: string | null }>;
  }>({
    queryKey: receivingPhotosQueryKey(row.receiving_id ?? -1),
    queryFn: async () => {
      const res = await fetch(`/api/receiving-photos?receivingId=${row.receiving_id}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    enabled: photoPolicyQueryEnabled,
    staleTime: 10_000,
  });
  // Stage-bucketed counts from the shared derivation (the client twin of the
  // server gate's SQL assembly) — null while the policy is optional or the
  // photo list hasn't loaded, so readiness chrome can tell "0" from "unknown".
  const photoStageCounts = useMemo(
    () =>
      photoPolicyQueryEnabled && photoPolicyPhotos?.photos
        ? deriveReceivingPhotoStageCounts(photoPolicyPhotos.photos)
        : null,
    [photoPolicyQueryEnabled, photoPolicyPhotos],
  );
  /** THIS line's item-photo count; null = unknown (policy optional / not loaded). */
  const lineItemPhotoCount =
    photoStageCounts != null ? photoStageCounts.itemCountsByLineId.get(row.id) ?? 0 : null;
  // Mirror of the server gate (mark-received 409) through the SAME evaluator —
  // blocker copy is never re-derived here. Client scope: carton stage counts +
  // THIS line's item count; sibling-line gaps are the server gate's job.
  // Degrade-not-block: while the photo list is unknown the control stays
  // enabled and a server 409 renders in the receive feedback region.
  const photoPolicyDisabledReason = useMemo(() => {
    if (!photoStageCounts) return null;
    const verdict = evaluateReceivingPhotoPolicy({
      policy: photoPolicy,
      cartonPhotoCounts: photoStageCounts.cartonPhotoCounts,
      linePhotoCounts: [{ lineId: row.id, sku: row.sku ?? null, itemCount: lineItemPhotoCount ?? 0 }],
    });
    return verdict.ok ? null : verdict.blockers[0] ?? null;
  }, [photoStageCounts, photoPolicy, row.id, row.sku, lineItemPhotoCount]);

  const siblingReceivingId = row.receiving_id ?? 0;
  const { data: siblingCache } = useQuery<ReceivingSiblingsCache<ReceivingLineRow>>({
    queryKey: receivingSiblingsQueryKey(siblingReceivingId),
    queryFn: skipToken,
    enabled: siblingReceivingId > 0,
  });
  const siblingLines = siblingCache?.receiving_lines;
  const linesReadyForGr = cartonLinesReadyForGr(
    siblingLines && siblingLines.length > 0 ? siblingLines : [row],
  );

  // Once received the primary action is print-only, so the receive-side gates
  // (shipment link, serial confirmation, photo policy) must stop blocking it —
  // otherwise a received line with no serial could never reprint its label.
  const combinedReviewDisabled = isReceived
    ? !canPrintReview
    : !canReceiveReview ||
      !canPrintReview ||
      !serialConfirmed ||
      photoPolicyDisabledReason != null ||
      !linesReadyForGr;
  // Bench-visible reason for the disabled Receive bar. A hover `title` is
  // invisible to an operator standing at a station — the bar renders this
  // line above the pill so the blocker names itself.
  const combinedReviewDisabledReason = isReceived
    ? null
    : !canReceiveReview
      ? // Unfound stubs / cold load have no shipment to link — never paint the
        // matched-carton "link shipment" prompt over a loading unfound bench.
        isUnfound
          ? null
          : 'Link this carton to a shipment to receive'
      : !serialConfirmed
        ? 'Scan a serial — or mark “No serial” with a reason — to receive'
        : !linesReadyForGr
          ? 'Finish remaining qty or mark leftovers SHORT / OVER / DAMAGED / WRONG_ITEM'
          : photoPolicyDisabledReason;
  // itemTotal is PO-scoped (workspace nav / useReceivingWorkspaceBridge) so
  // "Receive all" never claims lines from a different PO on a mixed carton.
  const isSinglePoItem = itemTotal === 1;
  // Re-receive stays reachable in the split menu — a bounce-back (line pulled
  // into testing, corrected qty) is a real flow — but it names itself so the
  // operator can't mistake it for the first receive.
  const receiveMenuLabel = isReceived
    ? 'Receive again'
    : isSinglePoItem
      ? 'Receive'
      : 'Receive all';
  // Unreceive mirrors Receive-all scope: single-line PO → "Unreceive", else all.
  const canUnreceive =
    isReceived || Number(row.quantity_received ?? 0) > 0;
  const unreceiveMenuLabel = isSinglePoItem ? 'Unreceive' : 'Unreceive all';
  // Server 409s the same statuses — surface before click so the menu is honest.
  const unreceiveBlockedBySerial = (row.serials ?? []).some((s) =>
    isUnreceiveSerialBlocking(
      (s as { current_status?: string | null }).current_status,
    ),
  );
  const unreceiveMenuDisabled = !canReceiveReview || unreceiveBlockedBySerial;
  const unreceiveMenuTitle = unreceiveBlockedBySerial
    ? 'Cannot unreceive — a unit is in fulfillment, outbound, or hold'
    : !canReceiveReview
      ? 'Line must be linked to a shipment'
      : isUnfound
        ? 'Undo local receive — quantities and received stamp clear; inventory is not touched'
        : 'Undo website receive — quantities and received stamp clear; linked inventory PO is marked unreceived';
  // Face stays receive-noun (dogfood era). Click still print-then-receive;
  // received lines collapse to print-only (terminal routes those separately).
  const printReceivePrimaryLabel = isReceived
    ? 'Print label'
    : isUnfound
      ? 'Receive locally'
      : receiveMenuLabel;
  // Unfound cartons have no Zoho/scan options in the menu — just print-only and
  // a local "receive all". Keep the menu copy honest so it matches what's shown.
  // When Unreceive is available, name it in the split affordance — after receive
  // the primary is Print-only and undo used to be buried with no menu hint.
  const splitMenuAriaLabel = isUnfound
    ? 'Print only, or receive all locally (no print)'
    : canUnreceive
      ? isSinglePoItem
        ? 'Print only, receive again, or unreceive'
        : 'Print only, receive all again, or unreceive all'
      : isSinglePoItem
        ? 'Print only, or receive without print'
        : 'Print only, or receive all without print';
  const splitMenuHoverTitle = isUnfound
    ? 'More options: print-only or receive all locally — external inventory is not touched'
    : canUnreceive
      ? isSinglePoItem
        ? 'More options: print-only, receive again, or unreceive'
        : 'More options: print-only, receive all again, or unreceive all'
      : isSinglePoItem
        ? 'More options: print-only or receive without print'
        : 'More options: print-only or receive all without print';
  const receiveMenuTitle = isUnfound
    ? 'Unfound carton — no external PO to receive against; use Receive locally'
    : row.receiving_id == null
      ? 'Line must be linked to a shipment'
      : undefined;
  const printThenReceiveTitle = isReceived
    ? 'Already received — print the package label'
    : row.receiving_id == null && !scanValue.trim() && !(row.sku || '').trim()
      ? 'Need a shipment link or SKU to continue'
      : isUnfound
        ? 'Print the label and receive locally — unfound carton, external inventory is not touched'
        : isSinglePoItem
          ? 'Print the label and receive this line'
          : 'Print the label and receive every open line on this PO';

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
      openClaimModal('create');
    },
    [serialLookup.serial, core.poNumber, core.persistPoNumber, openClaimModal],
  );

  // PO-number field commit: (1) try sales-order return import, (2) resolve
  // against the local Zoho PO mirror and relink (claims/imports lines), (3)
  // fall back to a plain PO# stamp only when neither resolves.
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
          core.setReceivingType('RETURN');
          const listingUrl = data.matched_order?.listing_url as string | undefined;
          if (listingUrl) core.setListingLink(listingUrl);
          core.setPoEditorOpen(false);
          autoBoundOrderRef.current = trimmed;
          toast.success(`Imported order ${data.matched_order?.order_id ?? trimmed} as a return`);
          if (data.line_patch) {
            dispatchUnboxRailLineUpdated(
              data.line_patch as Partial<ReceivingLineRow> & { id: number },
            );
          }
          return;
        }
      } catch {
        /* fall through to mirror resolve / plain PO# persist */
      }

      // Resolve against the local Zoho PO mirror — exact PO# / reference hit →
      // relink (adopts/claims/imports lines). Avoids stamp-only "fake found".
      try {
        const searchRes = await fetch(
          `/api/receiving/po-search?q=${encodeURIComponent(trimmed)}`,
        );
        const searchBody = (await searchRes.json().catch(() => null)) as {
          success?: boolean;
          candidates?: Array<{
            zoho_purchaseorder_id: string;
            zoho_purchaseorder_number: string | null;
            reference_number: string | null;
          }>;
        } | null;
        const norm = (s: string | null | undefined) =>
          String(s || '')
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '');
        const want = norm(trimmed);
        const hit = (searchBody?.candidates ?? []).find((c) => {
          return (
            norm(c.zoho_purchaseorder_number) === want ||
            norm(c.reference_number) === want ||
            norm(c.zoho_purchaseorder_id) === want
          );
        });
        if (hit && row.receiving_id != null) {
          const relinkRes = await fetch('/api/receiving/relink', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              receiving_id: row.receiving_id,
              line_id: row.id > 0 ? row.id : undefined,
              zoho_purchaseorder_id: hit.zoho_purchaseorder_id,
              zoho_purchaseorder_number: hit.zoho_purchaseorder_number,
              scope: 'both',
            }),
          });
          const relinkBody = (await relinkRes.json().catch(() => null)) as {
            success?: boolean;
            error?: string;
            receiving_id?: number;
            paired_onto?: number;
            lines_imported?: number;
            zoho_purchaseorder_number?: string | null;
          } | null;
          if (relinkRes.ok && relinkBody?.success) {
            const poLabel =
              hit.zoho_purchaseorder_number || hit.zoho_purchaseorder_id;
            const imported = Number(relinkBody.lines_imported ?? 0);
            core.setPoEditorOpen(false);
            autoBoundOrderRef.current = trimmed;
            dispatchUnboxRailLineUpdated({
              id: row.id,
              zoho_purchaseorder_id: hit.zoho_purchaseorder_id,
              zoho_purchaseorder_number: hit.zoho_purchaseorder_number,
              receiving_source: 'zoho_po',
            });
            toast.success(
              imported > 0
                ? `Linked purchase order ${poLabel} · ${imported} line${imported === 1 ? '' : 's'}`
                : `Linked purchase order ${poLabel}`,
            );
            refreshDomains(REFRESH_BUNDLES.receivingWrite);
            const winnerId =
              relinkBody.paired_onto ??
              (typeof relinkBody.receiving_id === 'number'
                ? relinkBody.receiving_id
                : null);
            if (winnerId != null && winnerId !== row.receiving_id) {
              window.location.assign(
                `${UNBOX_SURFACE_ROUTE}?openReceivingId=${winnerId}`,
              );
            }
            return;
          }
          toast.error(relinkBody?.error || 'PO link failed');
          return;
        }
      } catch {
        /* fall through to plain PO# persist */
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
      // Snapshot BEFORE the local setState pair, or the revert would restore
      // the value we are about to write rather than the one on record.
      const previous = { serial_absent: serialAbsent, serial_absent_reason: serialAbsentReason };
      setSerialAbsent(absent);
      setSerialAbsentReason(reason);
      markReceivingSerialAbsent(row.id, { absent, reason }, previous);
    },
    [row.id, serialAbsent, serialAbsentReason],
  );

  return {
    ...core,
    // condition / qa / disposition
    qa, setQa, disp, setDisp,
    cond, setCond, unitLabelCondition, setUnitLabelCondition, isMultiQtyLine,
    // notes — TWO durable buffers, one per grain (2026-07-31 split):
    //   itemNote  = `receiving_line.notes` — operator note; Unbox overview live center
    //   labelNote = `receiving_line.label_note` — durable printed face (stamped on carton print)
    itemNote, setItemNote, persistItemNote,
    labelNote, setLabelNote, persistLabelNote,
    prevLineNotes,
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
    setLabelCornerMode: cartonLabel.setCornerMode,
    patchLabelOverride: cartonLabel.patchLabelOverride,
    // workspace label kind selection (preview dropdown + dock pre-select)
    labelOptions, labelSelectOptions, selectedLabelKind, setSelectedLabelKind, activeLabelKind,
    labelEditorRequestId, requestLabelEditor,
    activeLabelFace, unitInput,     asListedDraftDefaults, buildAsListedPayload, applyAsListedAndPrint,
    asListedPayload, ticketPayload, applyUnitAndPrint,
    canPrintReview, canReceiveReview, canZohoReceive, isUnfound, isReceived, canUnreceive, combinedReviewDisabled, combinedReviewDisabledReason, requireSerialConfirmation,
    photoPolicy, lineItemPhotoCount,
    receiveMenuLabel, receiveMenuTitle, unreceiveMenuLabel, unreceiveMenuTitle, unreceiveMenuDisabled, printReceivePrimaryLabel, splitMenuAriaLabel, splitMenuHoverTitle, printThenReceiveTitle,
    // claim / RETURN flow
    openClaimModal,
    returnClaimPrefill, setReturnClaimPrefill,
    handleFileReturnClaim,
    commitPoNumberOrImportOrder,
  };
}
