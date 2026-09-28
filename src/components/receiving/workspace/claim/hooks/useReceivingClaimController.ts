import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from '@/lib/toast';
import {
  CLAIM_TYPE_OPTIONS,
  randomId,
  type ClaimType,
} from '@/components/sidebar/receiving/receiving-sidebar-shared';
import { CLAIM_TYPE_FAMILY, defaultReceivingClaimType } from '@/lib/receiving-claim-type';
import type { HorizontalSliderItem } from '@/components/ui/HorizontalButtonSlider';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import {
  claimWizardStartStep,
  claimWizardStepStates,
  type ArchiveState,
  type ClaimModalMode,
  type ClaimWizardStep,
  type LinkCommitStatus,
  type LinkUpdateStatus,
  type FiledTicket,
  type LinkCandidate,
} from '../claim-types';
import { normalizeReceivingTicketEntityRefs } from '@/lib/support/ticket-refs';
import { useClaimTicketSearch } from './useClaimTicketSearch';
import { useClaimTemplate } from './useClaimTemplate';
import { useClaimSellerMessage } from './useClaimSellerMessage';
import { useClaimTicketReply } from './useClaimTicketReply';
import {
  nextAutoCreateFromEmptyTrackingFlag,
  shouldAutoCreateFromEmptyTrackingSeed,
} from './claim-empty-seed-create';

/** Prefer the server's field-level `details` (e.g. */
/**
 * Reads the operator's accumulated claim-CC history. Tolerates the legacy
 * single-email string this key used to hold (`receiving-claim:last-cc-email`)
 * so an existing stored value seeds the new list rather than being dropped.
 */
function readStoredCcEmails(storageKey: string): string[] {
  let stored: string | null;
  try {
    stored = window.localStorage.getItem(storageKey);
  } catch {
    return [];
  }
  if (!stored) return [];
  try {
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((v) => String(v ?? '').trim())
      .filter(Boolean)
      .filter((v, i, arr) => arr.indexOf(v) === i);
  } catch {
    // Not JSON — the legacy single-email string.
    const trimmed = stored.trim();
    return trimmed ? [trimmed] : [];
  }
}

function apiErrorText(data: unknown, fallback: string): string {
  const d = (data ?? {}) as { error?: unknown; details?: unknown };
  const details = typeof d.details === 'string' ? d.details.trim() : '';
  const error = typeof d.error === 'string' ? d.error.trim() : '';
  if (details && error && details !== error) return `${error}: ${details}`;
  return details || error || fallback;
}

export interface ClaimModalProps {
  open: boolean;
  row: ReceivingLineRow;
  /** Overrides the entity the claim is filed against. */
  lineIdOverride?: number | null;
  /** Seeds the "What happened?" note when the modal opens (RETURN match CTA). */
  prefillReason?: string;
  /**
   * Which wizard tab to land on when the modal opens. Defaults to `link`
   * (existing ticket). Create remains available via the mode combobox.
   */
  initialMode?: ClaimModalMode;
  onClose: () => void;
  /** Called with the formatted ticket number on success ("#12345"). */
  onTicketCreated: (ticketNumber: string) => void;
  /** Called after a committed ticket link is removed (clears Support chip). */
  onTicketUnlinked?: () => void;
}

/** The make-a-claim controller. */
export function useReceivingClaimController({
  open,
  row,
  lineIdOverride,
  prefillReason,
  initialMode = 'link',
  onClose,
  onTicketCreated,
  onTicketUnlinked,
}: ClaimModalProps) {
  const LAST_CC_EMAIL_STORAGE_KEY = 'receiving-claim:cc-emails';
  const receivingId = row.receiving_id;
  // `undefined` override = default to the row's own line; an explicit value (incl.
  const rawLineId = lineIdOverride !== undefined ? lineIdOverride : row.id;
  const { lineId } = normalizeReceivingTicketEntityRefs({
    lineId: rawLineId,
    receivingId,
  });
  // A real PO# (number or id) — when present, 'unfound' is neither defaulted nor
  // offered, even if the carton came in as an unmatched scan.
  const hasPo = !!(row.zoho_purchaseorder_number || row.zoho_purchaseorder_id);
  // Default: carrier RETURNED → RTS; return intake → 'return'; unmatched w/o PO
  // → 'unfound'; a QC fail → its claim; a short line → 'missing'; otherwise
  // 'damage'. (`shipment_status` is the line-row alias of STN
  // `latest_status_category`.) The type is the ticket's recorded reason.
  const initialClaimType: ClaimType = defaultReceivingClaimType({
    shipmentStatus: row.shipment_status,
    receivingType: row.receiving_type,
    cartonIntakeType: row.carton_intake_type,
    intakeType: row.intake_type,
    receivingSource: row.receiving_source,
    hasPo,
    qaStatus: row.qa_status,
    quantityReceived: row.id > 0 ? row.quantity_received : null,
    quantityExpected: row.id > 0 ? row.quantity_expected : null,
  });

  // ── Wizard / mode state ──────────────────────────────────────────────────
  const [claimType, setClaimType] = useState<ClaimType>(initialClaimType);
  const [mode, setMode] = useState<ClaimModalMode>(initialMode);
  const [step, setStep] = useState<ClaimWizardStep>(() => claimWizardStartStep(initialMode));
  const [filedTicket, setFiledTicket] = useState<FiledTicket | null>(null);
  const [reason, setReason] = useState('');
  /** True only after empty tracking-seeded Link search auto-flipped to Create. */
  const [autoCreateFromEmptyTracking, setAutoCreateFromEmptyTracking] = useState(false);

  // ── Recipients (opening comment) ───────────────────────────────────────── Default is a public reply + CC.
  const [ccEmails, setCcEmails] = useState<string[]>([]);
  const [notePublic, setNotePublic] = useState(true);

  // ── Create-flow submit state ─────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);
  const [draftBody, setDraftBody] = useState<string | null>(null);
  const [archiveSubmitting, setArchiveSubmitting] = useState(false);

  // Local backup result — set by both the auto-backup on ticket creation and the
  // manual "Back up locally" action, so the confirm step can DISPLAY whether the
  // backup landed (and offer a retry when it failed/was partial).
  const [archiveState, setArchiveState] = useState<ArchiveState | null>(null);
  // Stable per-submission idempotency key — generated on open and reused across
  // retries so a failed-then-retried submit never files two tickets.
  const idempotencyKey = useRef('');

  // ── Link-flow submit state ───────────────────────────────────────────────
  const [linkCommitStatus, setLinkCommitStatus] = useState<LinkCommitStatus>('idle');
  const [unlinking, setUnlinking] = useState(false);
  // The Ticket → Review sub-flow that runs after a ticket is linked (mirrors
  // the create flow's submit): posts the comment to the EXISTING ticket rather
  // than filing a new one.
  const [linkUpdateStatus, setLinkUpdateStatus] = useState<LinkUpdateStatus>('idle');

  // ── Composed sub-hooks ───────────────────────────────────────────────────
  const trackingSeed =
    typeof row.tracking_number === 'string' ? row.tracking_number.trim() : '';
  const search = useClaimTicketSearch({
    open,
    enabled: mode === 'link',
    receivingId,
    lineId,
    // Seed Link with carton tracking so Zendesk search runs without typing
    // (id-vs-search SoT: carrier tracking never calls getTicket).
    initialQuery: trackingSeed || null,
  });
  const template = useClaimTemplate({
    open,
    // Create and Link both mount compose — keep the claim-type template warm
    // so Link shows the Unfound body before a ticket is picked.
    active: open,
    receivingId,
    lineId,
    claimType,
    initialSourcePlatform: row.source_platform ?? null,
    initialReceivingType:
      row.carton_intake_type || row.receiving_type || row.intake_type || null,
    initialIsReturn:
      String(row.carton_intake_type || row.receiving_type || '')
        .trim()
        .toUpperCase() === 'RETURN'
        ? true
        : null,
    initialReturnPlatform: null,
    // Link: once a ticket is picked, replace Subject with that ticket's title.
    // Body stays the generated claim-type template unless the operator edits.
    linkedTicketId:
      mode === 'link'
        ? (search.selectedTicket?.id ?? filedTicket?.id ?? null)
        : null,
    linkedTicketSubject:
      mode === 'link' ? (search.selectedTicket?.subject ?? null) : null,
  });
  // Gate the seller hook's auto-draft on reaching the seller step.
  const sellerActive = step === 'seller';
  const seller = useClaimSellerMessage({
    open,
    mode,
    sellerActive,
    filedTicket,
    receivingId,
    lineId,
    claimType,
    reason,
    readSubject: template.readSubject,
    readDescription: template.readDescription,
    onClose,
  });
  const reply = useClaimTicketReply({ open, ticketId: filedTicket?.id ?? null });

  // Open-time seeds only — read via refs so a live Type/Platform save (which
  // updates row → defaultReceivingClaimType) cannot re-run this and bounce
  // mode back to Link (re-firing ticket search) or wipe operator Claim picks.
  const openSeedRef = useRef({
    claimType: initialClaimType,
    mode: initialMode,
    prefillReason,
  });
  openSeedRef.current = {
    claimType: initialClaimType,
    mode: initialMode,
    prefillReason,
  };

  // Reset controller-owned cells when the panel opens or the carton/line
  // changes — never when derived defaults drift mid-session.
  useEffect(() => {
    if (!open) return;
    const seed = openSeedRef.current;
    setReason(seed.prefillReason ?? '');
    setDraftBody(null);
    setClaimType(seed.claimType);
    setNotePublic(true);
    setCcEmails(readStoredCcEmails(LAST_CC_EMAIL_STORAGE_KEY));
    // `crypto.randomUUID` only exists in a secure context (HTTPS / localhost);
    // over a plain-HTTP LAN IP it's undefined. `randomId` falls back safely.
    idempotencyKey.current = randomId();
    setMode(seed.mode);
    setStep(claimWizardStartStep(seed.mode));
    setFiledTicket(null);
    setLinkCommitStatus('idle');
    setLinkUpdateStatus('idle');
    setArchiveState(null);
    setAutoCreateFromEmptyTracking(false);
  }, [open, receivingId, lineId]);

  // Remember every CC email ever entered (accumulated, not just this session's
  // set) so the next claim on any carton auto-fills from the operator's full
  // history — removing a chip from the current form doesn't forget it.
  useEffect(() => {
    if (!open || !ccEmails.length) return;
    try {
      const known = new Set(readStoredCcEmails(LAST_CC_EMAIL_STORAGE_KEY));
      let changed = false;
      for (const email of ccEmails) {
        const trimmed = email.trim();
        if (trimmed && !known.has(trimmed)) {
          known.add(trimmed);
          changed = true;
        }
      }
      if (changed) {
        window.localStorage.setItem(LAST_CC_EMAIL_STORAGE_KEY, JSON.stringify([...known]));
      }
    } catch {
      // Best-effort only.
    }
  }, [ccEmails, open]);

  // Hide 'unfound' once a real PO# is present — an order with a PO can't be
  // "unfound". Every other claim type (incl. 'return') stays available. Each
  // carries its family (Investigation · Vendor claim · Other) as its group.
  const claimTypeItems = useMemo<Array<HorizontalSliderItem & { group: string }>>(
    () =>
      CLAIM_TYPE_OPTIONS.filter((opt) => opt.value !== 'unfound' || !hasPo).map((opt) => ({
        id: opt.value,
        label: opt.label,
        group: CLAIM_TYPE_FAMILY[opt.value],
      })),
    [hasPo],
  );
  const claimStepStates = useMemo(
    () => claimWizardStepStates(step, mode),
    [step, mode],
  );
  const sellerStepReady = !!filedTicket || mode === 'link';
  // The compose draft must be complete before Review/Submit are reachable.
  const composeComplete = !!template.subject.trim() && !!template.description.trim();
  // A 'return' claim has no marketplace seller to message — the seller step
  // (and its dot on the stepper) is skipped entirely for either wizard.
  const sellerStepApplicable = claimType !== 'return';

  // ── Section navigation (scroll-spy) ────────────────────────────────────── Create:
  const isStepDisabled = (key: string): boolean => {
    const target = key as ClaimWizardStep;
    if (mode === 'create') {
      if (target === 'seller') return !filedTicket || !sellerStepApplicable;
      if (target === 'filed') return !filedTicket;
      return false;
    }
    if (target === 'find' || target === 'compose') return false;
    if (target === 'filed') return linkUpdateStatus !== 'posted';
    if (target === 'seller') return linkUpdateStatus !== 'posted' || !sellerStepApplicable;
    return false;
  };

  const goToStep = (next: ClaimWizardStep) => {
    if (isStepDisabled(next)) return;
    setStep(next);
  };

  // ── Wizard navigation ────────────────────────────────────────────────────
  const handleModeChange = (next: ClaimModalMode) => {
    setMode(next);
    setAutoCreateFromEmptyTracking(
      nextAutoCreateFromEmptyTrackingFlag({ prev: false, event: 'mode-change' }),
    );
    // Clear link pick / commit state; keep claim type + template (shared compose).
    search.setSelectedTicket(null);
    setFiledTicket(null);
    setLinkCommitStatus('idle');
    setLinkUpdateStatus('idle');
    seller.resetBootstrap();
    seller.resetDraftState();
    setStep(next === 'link' ? 'find' : 'compose');
  };

  const handleStepClick = (key: string) => {
    goToStep(key as ClaimWizardStep);
  };

  /** Filed → seller. */
  const continueToSeller = () => {
    setStep('seller');
  };

  const selectLinkTicket = (t: LinkCandidate | null) => {
    if (!t) {
      search.setSelectedTicket(null);
      if (mode === 'link') {
        setFiledTicket(null);
        setLinkCommitStatus('idle');
        seller.resetDraftState();
      }
      return;
    }
    const ticketChanged = search.selectedTicket?.id !== t.id;
    search.setSelectedTicket(t);
    if (mode === 'link') {
      setFiledTicket({ number: `#${t.id}`, url: t.url, id: t.id });
      setLinkCommitStatus('idle');
      if (ticketChanged) {
        seller.resetDraftState();
        setLinkUpdateStatus('idle');
      }
    }
  };

  // Sole tracking suggestion → auto-pick so Subject replaces without an extra click.
  // Multi-hit lists still require an explicit pick.
  useEffect(() => {
    if (!open || mode !== 'link') return;
    if (search.selectedTicket) return;
    if (!search.seededQuery) return;
    if (search.ticketQuery.trim() !== search.seededQuery) return;
    if (search.searchLoading || search.searchError) return;
    if (search.ticketResults.length !== 1) return;
    const sole = search.ticketResults[0];
    if (!sole || sole.linkedToThis) return;
    selectLinkTicket(sole);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selectLinkTicket closes over mode/search
  }, [
    open,
    mode,
    search.selectedTicket,
    search.seededQuery,
    search.ticketQuery,
    search.searchLoading,
    search.searchError,
    search.ticketResults,
  ]);

  // Empty tracking-seeded Link search → Create once per open (friendly path).
  // In-surface helper copy (ClaimEmptySeedCreateHelper) explains the flip;
  // no toast — easy to miss beside the caption.
  const emptySeedFlipKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!open) {
      emptySeedFlipKeyRef.current = null;
      setAutoCreateFromEmptyTracking(
        nextAutoCreateFromEmptyTrackingFlag({ prev: false, event: 'closed' }),
      );
      return;
    }
    const flipKey = `${receivingId ?? 'x'}:${search.seededQuery}`;
    if (
      !shouldAutoCreateFromEmptyTrackingSeed({
        open,
        mode,
        seededQuery: search.seededQuery,
        ticketQuery: search.ticketQuery,
        searchLoading: search.searchLoading,
        searchError: search.searchError,
        resultCount: search.ticketResults.length,
        hasSelectedTicket: search.selectedTicket != null,
        alreadyFlippedKey: emptySeedFlipKeyRef.current,
        flipKey,
      })
    ) {
      return;
    }
    emptySeedFlipKeyRef.current = flipKey;
    handleModeChange('create');
    // After mode-change clears the flag, re-set so Create paints the helper.
    setAutoCreateFromEmptyTracking(
      nextAutoCreateFromEmptyTrackingFlag({
        prev: false,
        event: 'empty-seed-flip',
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleModeChange stable enough via mode/search
  }, [
    open,
    mode,
    receivingId,
    search.seededQuery,
    search.ticketQuery,
    search.searchLoading,
    search.searchError,
    search.ticketResults,
    search.selectedTicket,
  ]);

  const deselectLinkedTicket = () => {
    search.setSelectedTicket(null);
    setFiledTicket(null);
    setLinkCommitStatus('idle');
    setLinkUpdateStatus('idle');
    seller.resetDraftState();
    // Deselecting / unlinking always returns to the picker step.
    setStep('find');
  };

  const handleBannerUnlink = () => {
    if (linkCommitStatus === 'committed') {
      void unlinkCommittedTicket();
      return;
    }
    void seller.clearPersistedSellerDraft();
    deselectLinkedTicket();
  };

  // ── Create flow: file a fresh internal ticket ────────────────────────────
  const submitInternal = async () => {
    if (submitting || !receivingId || filedTicket) return;
    setSubmitting(true);
    setDraftBody(null);
    try {
      const res = await fetch('/api/receiving/zendesk-claim', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey.current,
        },
        body: JSON.stringify({
          receivingId,
          lineId,
          claimType,
          reason: reason.trim(),
          subject: template.readSubject().trim(),
          description: template.readDescription().trim(),
          notePublic,
          ccEmails,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setDraftBody(data?.draftBody ?? null);
        toast.error(apiErrorText(data, 'Could not file the claim'));
        return;
      }
      const ticketNumber = data.ticketNumber ? String(data.ticketNumber) : '';
      const ticketUrl = typeof data.ticketUrl === 'string' ? data.ticketUrl : null;
      const ticketId =
        ticketNumber && /^#?(\d+)$/.test(ticketNumber.replace(/\s+/g, ''))
          ? Number(ticketNumber.replace(/^#/, ''))
          : null;

      if (ticketNumber) {
        toast.success(`Internal ticket ${ticketNumber} filed`, {
          action: ticketUrl
            ? { label: 'Open', onClick: () => window.open(ticketUrl, '_blank', 'noopener') }
            : undefined,
        });
        onTicketCreated(ticketNumber);
      } else {
        toast.success('Claim filed — continue to seller message when the ticket # is assigned');
      }
      // Capture the auto-backup result so the confirm step DISPLAYS the local
      // backup status — and a retry when it failed/was partial.
      const archiveWarning = data.archiveWarning ? String(data.archiveWarning) : null;
      setArchiveState({
        ok: data.archiveOk === true && !archiveWarning,
        copied: Number(data.archiveCopied ?? 0),
        total: Number(data.archiveTotal ?? 0),
        folder:
          typeof data.archiveFolder === 'string' && data.archiveFolder
            ? data.archiveFolder
            : ticketNumber.replace(/^#/, '') || null,
        warning: archiveWarning,
      });
      if (archiveWarning) {
        toast.warning(archiveWarning, { duration: 8000 });
      }
      if (typeof data.sharePackUrl === 'string' && data.sharePackUrl) {
        const shareUrl = data.sharePackUrl;
        toast.success('Share pack ready for vendor', {
          duration: 10000,
          action: {
            label: 'Copy link',
            onClick: () => void navigator.clipboard.writeText(shareUrl),
          },
        });
      }

      // Land on the confirmation step — the operator reviews the ticket result
      // AND the local backup result there before continuing to the seller message.
      setFiledTicket({
        number: ticketNumber || 'pending',
        url: ticketUrl,
        id: ticketId,
      });
      setStep('filed');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSubmitting(false);
    }
  };

  // Save the carton's photos to a local-storage folder.
  const archiveToNas = async () => {
    if (archiveSubmitting || submitting || !receivingId) return;
    const folder =
      filedTicket?.number?.replace(/^#/, '').trim() ||
      String(row.zoho_purchaseorder_number || '').trim() ||
      `RCV-${receivingId}`;
    setArchiveSubmitting(true);
    try {
      const res = await fetch('/api/receiving/zendesk-claim/archive-only', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receivingId,
          lineId,
          ticketNumber: folder,
          claimType,
          reason: reason.trim(),
          subject: template.readSubject().trim(),
          description: template.readDescription().trim(),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        toast.error(apiErrorText(data, 'Could not back up claim photos'));
        return;
      }
      // Display the backup result on the seller step (folder + counts), and a
      // retry affordance when it was partial.
      const warning = data.archiveWarning ? String(data.archiveWarning) : null;
      setArchiveState({
        ok: !warning,
        copied: Number(data.copied ?? 0),
        total: Number(data.total ?? 0),
        folder: typeof data.folderName === 'string' ? data.folderName : null,
        warning,
      });
      if (warning) toast.warning(warning, { duration: 8000 });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Network error');
    } finally {
      setArchiveSubmitting(false);
    }
  };

  // ── Link flow: attach ticket + post template body as one CTA ─────────────
  /** Link-only (no Chat flip). Prefer {@link submitLinkAndUpdate} from the footer. */
  const submitLink = async (): Promise<{
    ok: boolean;
    ticketNumber?: string;
    ticketId?: number;
    ticketUrl?: string | null;
  }> => {
    if (linkCommitStatus === 'linking' || !search.selectedTicket || !receivingId) {
      return { ok: false };
    }
    if (linkCommitStatus === 'committed' && filedTicket?.id === search.selectedTicket.id) {
      return {
        ok: true,
        ticketNumber: filedTicket.number,
        ticketId: filedTicket.id ?? search.selectedTicket.id,
        ticketUrl: filedTicket.url,
      };
    }
    const selected = search.selectedTicket;
    setLinkCommitStatus('linking');
    try {
      const res = await fetch('/api/receiving/zendesk-claim/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receivingId, lineId, ticketId: selected.id, claimType }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        toast.error(apiErrorText(data, 'Could not link the ticket'));
        setLinkCommitStatus('idle');
        return { ok: false };
      }
      const url = typeof data.ticketUrl === 'string' ? data.ticketUrl : null;
      const ticketNumber = String(data.ticketNumber);
      setLinkCommitStatus('committed');
      setLinkUpdateStatus('idle');
      setFiledTicket({ number: ticketNumber, url, id: selected.id });
      seller.resetBootstrap();
      return { ok: true, ticketNumber, ticketId: selected.id, ticketUrl: url };
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Network error');
      setLinkCommitStatus('idle');
      return { ok: false };
    }
  };

  const unlinkCommittedTicket = async () => {
    if (unlinking || !filedTicket?.id || !receivingId) return;
    setUnlinking(true);
    try {
      const sp = new URLSearchParams({
        receivingId: String(receivingId),
        ticketId: String(filedTicket.id),
      });
      if (lineId != null) sp.set('lineId', String(lineId));
      const res = await fetch(`/api/receiving/zendesk-claim/link?${sp}`, { method: 'DELETE' });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        toast.error(apiErrorText(data, 'Could not unlink the ticket'));
        return;
      }
      await seller.clearPersistedSellerDraft();
      deselectLinkedTicket();
      onTicketUnlinked?.();
      toast.success('Ticket unlinked');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not unlink the ticket');
    } finally {
      setUnlinking(false);
    }
  };

  // Posts the composed subject/body as a comment on the linked ticket.
  const submitLinkUpdate = async (ticketOverride?: {
    id: number;
    number: string;
  }): Promise<boolean> => {
    const ticketId = ticketOverride?.id ?? filedTicket?.id ?? search.selectedTicket?.id ?? null;
    const ticketNumber =
      ticketOverride?.number ??
      filedTicket?.number ??
      (ticketId != null ? `#${ticketId}` : '');
    if (linkUpdateStatus === 'posting' || ticketId == null || !receivingId) return false;
    setLinkUpdateStatus('posting');
    try {
      const res = await fetch('/api/receiving/zendesk-claim/thread', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketId,
          receivingId,
          lineId,
          claimType,
          body: template.readDescription().trim(),
          subject: template.readSubject().trim(),
          public: notePublic,
          emailCcs: notePublic && ccEmails.length ? ccEmails : undefined,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        toast.error(apiErrorText(data, 'Could not update the ticket'));
        setLinkUpdateStatus('idle');
        return false;
      }
      toast.success(
        notePublic
          ? `Ticket ${ticketNumber} updated — customer emailed`
          : `Ticket ${ticketNumber} updated`,
      );
      const archiveWarning = data.archiveWarning ? String(data.archiveWarning) : null;
      setArchiveState({
        ok: data.archiveOk === true && !archiveWarning,
        copied: Number(data.archiveCopied ?? 0),
        total: Number(data.archiveTotal ?? 0),
        folder:
          typeof data.archiveFolder === 'string' && data.archiveFolder
            ? data.archiveFolder
            : ticketNumber.replace(/^#/, '') || null,
        warning: archiveWarning,
      });
      if (archiveWarning) {
        toast.warning(archiveWarning, { duration: 8000 });
      }
      setLinkUpdateStatus('posted');
      setStep('filed');
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Network error');
      setLinkUpdateStatus('idle');
      return false;
    }
  };

  /**
   * One Link CTA: attach the ticket, post the template body, NAS
   * archive in the thread request, then flip Displays to Chat via
   * {@link onTicketCreated}. Never calls onTicketCreated after link-only.
   */
  const submitLinkAndUpdate = async () => {
    if (
      linkCommitStatus === 'linking' ||
      linkUpdateStatus === 'posting' ||
      !search.selectedTicket ||
      !receivingId ||
      !composeComplete
    ) {
      return;
    }
    const linked = await submitLink();
    if (!linked.ok || linked.ticketId == null || !linked.ticketNumber) return;
    const posted = await submitLinkUpdate({
      id: linked.ticketId,
      number: linked.ticketNumber,
    });
    if (!posted) return;
    const number = linked.ticketNumber;
    onTicketCreated(number.startsWith('#') ? number : `#${number}`);
  };

  return {
    // props passthrough
    row,
    open,
    onClose,
    // wizard
    mode,
    step,
    setStep,
    filedTicket,
    autoCreateFromEmptyTracking,
    claimType,
    setClaimType,
    reason,
    // recipients (opening comment)
    ccEmails,
    setCcEmails,
    notePublic,
    setNotePublic,
    archiveSubmitting,
    claimTypeItems,
    claimStepStates,
    sellerStepReady,
    sellerStepApplicable,
    composeComplete,
    handleModeChange,
    handleStepClick,
    isStepDisabled,
    goToStep,
    continueToSeller,
    selectLinkTicket,
    handleBannerUnlink,
    // create flow
    submitting,
    draftBody,
    submitInternal,
    archiveToNas,
    archiveState,
    // link flow
    linkCommitStatus,
    unlinking,
    submitLink,
    submitLinkAndUpdate,
    linkUpdateStatus,
    submitLinkUpdate,
    // sub-hooks
    template,
    search,
    seller,
    reply,
  };
}

export type ReceivingClaimController = ReturnType<typeof useReceivingClaimController>;
