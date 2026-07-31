import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from '@/lib/toast';
import {
  CLAIM_TYPE_OPTIONS,
  randomId,
  type ClaimType,
} from '@/components/sidebar/receiving/receiving-sidebar-shared';
import { defaultReceivingClaimType } from '@/lib/receiving-claim-type';
import type { HorizontalSliderItem } from '@/components/ui/HorizontalButtonSlider';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import {
  claimWizardOrderForMode,
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
import { useClaimPhotos } from './useClaimPhotos';
import { useClaimTicketSearch } from './useClaimTicketSearch';
import { useClaimTemplate } from './useClaimTemplate';
import { useClaimSellerMessage } from './useClaimSellerMessage';
import { useClaimTicketReply } from './useClaimTicketReply';

/**
 * Prefer the server's field-level `details` (e.g. a Zod issue string like
 * "receivingId: Expected number, received string") over the generic `error`
 * ("Validation failed"), so a rejected request says exactly WHAT is wrong
 * instead of an opaque wall. Matches the house pattern used across admin/
 * favorites API callers (`details || error || fallback`).
 */
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
  /**
   * Overrides the entity the claim is filed against. Default (`undefined`) keeps
   * today's behavior: `lineId = row.id`. Pass `null` to file a CARTON-level claim
   * (`entityType='RECEIVING'`, sets `receiving.zendesk_ticket`) — used for unfound
   * triage cartons whose rail row is a synthetic stub with no real receiving_line.
   */
  lineIdOverride?: number | null;
  /** Seeds the "What happened?" note when the modal opens (RETURN match CTA). */
  prefillReason?: string;
  /**
   * Which wizard tab to land on when the modal opens. Defaults to `create`
   * (New ticket). Station Ticket empty-state "Link ticket" passes `link`.
   */
  initialMode?: ClaimModalMode;
  onClose: () => void;
  /** Called with the formatted ticket number on success ("#12345"). */
  onTicketCreated: (ticketNumber: string) => void;
  /** Called after a committed ticket link is removed (clears Support chip). */
  onTicketUnlinked?: () => void;
}

/**
 * The make-a-claim controller. Owns the wizard/mode state and the create/link
 * submit flows, and composes the four single-responsibility sub-hooks
 * ({@link useClaimPhotos}, {@link useClaimTicketSearch}, {@link useClaimTemplate},
 * {@link useClaimSellerMessage}). Returns one bag consumed by the presentational
 * sections so the modal file itself stays a thin composition layer.
 */
export function useReceivingClaimController({
  open,
  row,
  lineIdOverride,
  prefillReason,
  initialMode = 'create',
  onClose,
  onTicketCreated,
  onTicketUnlinked,
}: ClaimModalProps) {
  const LAST_CC_EMAIL_STORAGE_KEY = 'receiving-claim:cc-emails';
  const receivingId = row.receiving_id;
  // `undefined` override = default to the row's own line; an explicit value
  // (incl. `null` for a carton-level claim) wins. Placeholder / unfound stub
  // ids (`id = -receiving_id`) normalize to null so link/create POST never
  // sends a non-positive lineId that Zod rejects as "Validation failed".
  const rawLineId = lineIdOverride !== undefined ? lineIdOverride : row.id;
  const { lineId } = normalizeReceivingTicketEntityRefs({
    lineId: rawLineId,
    receivingId,
  });
  // A real PO# (number or id) — when present, 'unfound' is neither defaulted nor
  // offered, even if the carton came in as an unmatched scan.
  const hasPo = !!(row.zoho_purchaseorder_number || row.zoho_purchaseorder_id);
  // Default: carrier RETURNED → RTS; return intake → 'return'; unmatched w/o PO
  // → 'unfound'; otherwise 'damage'. (`shipment_status` is the line-row alias of
  // STN `latest_status_category`.)
  const initialClaimType: ClaimType = defaultReceivingClaimType({
    shipmentStatus: row.shipment_status,
    receivingType: row.receiving_type,
    cartonIntakeType: row.carton_intake_type,
    intakeType: row.intake_type,
    receivingSource: row.receiving_source,
    hasPo,
  });

  // ── Wizard / mode state ──────────────────────────────────────────────────
  const [claimType, setClaimType] = useState<ClaimType>(initialClaimType);
  const [mode, setMode] = useState<ClaimModalMode>('create');
  const [step, setStep] = useState<ClaimWizardStep>('photos');
  const [filedTicket, setFiledTicket] = useState<FiledTicket | null>(null);
  const [reason, setReason] = useState('');

  // ── Recipients (opening comment) ─────────────────────────────────────────
  // Default is a public reply + CC. `notePublic` files the opening comment as a
  // public reply and enables CC'ing collaborator emails (a vendor, a teammate).
  // CCs are only meaningful on a public comment, so the UI hides them when
  // internal-note is selected and the server ignores them there too.
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
  // The Photos → Ticket → Review sub-flow that runs after a ticket is linked
  // (mirrors the create flow's submit): posts the comment + attaches photos to
  // the EXISTING ticket rather than filing a new one.
  const [linkUpdateStatus, setLinkUpdateStatus] = useState<LinkUpdateStatus>('idle');

  // ── Composed sub-hooks ───────────────────────────────────────────────────
  const photos = useClaimPhotos(open, receivingId);
  const template = useClaimTemplate({
    open,
    // Keep the preview warm across every pre-file/pre-update step so Review
    // can render it — Photos/Ticket/Review share this exact gate in both modes.
    active: step === 'photos' || step === 'compose' || step === 'review',
    receivingId,
    lineId,
    claimType,
    linkedTicketId: mode === 'link' ? filedTicket?.id ?? null : null,
  });
  const search = useClaimTicketSearch({
    open,
    enabled: mode === 'link',
    receivingId,
    lineId,
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

  // Reset the controller-owned cells each time the modal opens. Sub-hooks reset
  // their own state on `open`.
  useEffect(() => {
    if (!open) return;
    setReason(prefillReason ?? '');
    setDraftBody(null);
    setClaimType(initialClaimType);
    setNotePublic(true);
    setCcEmails(readStoredCcEmails(LAST_CC_EMAIL_STORAGE_KEY));
    // `crypto.randomUUID` only exists in a secure context (HTTPS / localhost);
    // over a plain-HTTP LAN IP it's undefined. `randomId` falls back safely.
    idempotencyKey.current = randomId();
    setMode(initialMode);
    setStep(claimWizardStartStep(initialMode));
    setFiledTicket(null);
    setLinkCommitStatus('idle');
    setLinkUpdateStatus('idle');
    setArchiveState(null);
  }, [open, receivingId, lineId, initialClaimType, prefillReason, initialMode]);

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

  // ── Derived view-model ───────────────────────────────────────────────────
  // Hide 'unfound' once a real PO# is present — an order with a PO can't be
  // "unfound". Every other claim type (incl. 'return') stays available.
  const claimTypeItems = useMemo<HorizontalSliderItem[]>(
    () =>
      CLAIM_TYPE_OPTIONS.filter((opt) => opt.value !== 'unfound' || !hasPo).map((opt) => ({
        id: opt.value,
        label: opt.label,
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

  // ── Linear wizard navigation ─────────────────────────────────────────────
  // Create: filed/seller require a filed ticket; review needs compose (or filed).
  // Link: photos+ only after commit; filed/seller after update posted; seller
  // skipped for 'return'.
  const isStepDisabled = (key: string): boolean => {
    const target = key as ClaimWizardStep;
    if (mode === 'create') {
      if (target === 'seller') return !filedTicket || !sellerStepApplicable;
      if (target === 'filed') return !filedTicket;
      if (target === 'review') return !composeComplete && !filedTicket;
      return false;
    }
    if (target === 'find') return false;
    if (linkCommitStatus !== 'committed') return true;
    if (target === 'review') return !composeComplete;
    if (target === 'filed') return linkUpdateStatus !== 'posted';
    if (target === 'seller') return linkUpdateStatus !== 'posted' || !sellerStepApplicable;
    return false;
  };

  const goToStep = (next: ClaimWizardStep) => {
    if (isStepDisabled(next)) return;
    setStep(next);
  };

  /** Footer "Back" — one step left in the mode order (no-op on the first). */
  const goBack = () => {
    const order = claimWizardOrderForMode(mode);
    const idx = order.indexOf(step);
    if (idx > 0) setStep(order[idx - 1]);
  };

  /** Footer "Next" — photos → compose → review (Submit lives on review). */
  const goNext = () => {
    if (step === 'photos') {
      setStep('compose');
    } else if (step === 'compose') {
      if (composeComplete) setStep('review');
    }
  };

  // ── Wizard navigation ────────────────────────────────────────────────────
  const handleModeChange = (next: ClaimModalMode) => {
    setMode(next);
    if (next === 'link') {
      // Resume wherever the link sub-flow left off; a fresh link starts at Find.
      seller.resetBootstrap();
      if (linkCommitStatus !== 'committed') {
        setStep('find');
      } else if (linkUpdateStatus !== 'posted') {
        setStep('photos');
      } else {
        setStep('filed');
      }
    } else {
      setStep(filedTicket ? 'filed' : 'photos');
    }
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
          attachPhotoIds: [...photos.selectedPhotoIds],
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

  // Save the carton's photos to a local-storage folder. The folder is the
  // filed/linked ticket # when we have one, else the PO#, else a receiving
  // fallback — so the operator can back up before OR after a ticket exists.
  // No free-text target.
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

  // ── Link flow: attach an existing ticket to this carton/line ─────────────
  const submitLink = async () => {
    if (linkCommitStatus === 'linking' || !search.selectedTicket || !receivingId) return;
    const selected = search.selectedTicket;
    setLinkCommitStatus('linking');
    try {
      const res = await fetch('/api/receiving/zendesk-claim/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receivingId, lineId, ticketId: selected.id }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        toast.error(apiErrorText(data, 'Could not link the ticket'));
        setLinkCommitStatus('idle');
        return;
      }
      const url = typeof data.ticketUrl === 'string' ? data.ticketUrl : null;
      toast.success(`Linked ${data.ticketNumber}`, {
        action: url
          ? { label: 'Open', onClick: () => window.open(url, '_blank', 'noopener') }
          : undefined,
      });
      onTicketCreated(String(data.ticketNumber));
      setLinkCommitStatus('committed');
      setLinkUpdateStatus('idle');
      setFiledTicket({ number: String(data.ticketNumber), url, id: selected.id });
      // Land on Photos — same Photos → Ticket → Review arc the create flow
      // runs, ending in a comment (+ attached photos) posted to THIS ticket.
      seller.resetBootstrap();
      setStep('photos');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Network error');
      setLinkCommitStatus('idle');
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

  // Link flow's Review step "submit": posts the composed subject/body as a
  // comment on the ALREADY-LINKED ticket, attaching the selected photos —
  // the same subject/body/recipients/photo-selection UI as the create flow,
  // but updating the existing ticket instead of filing a new one.
  const submitLinkUpdate = async () => {
    if (linkUpdateStatus === 'posting' || !filedTicket?.id || !receivingId) return;
    setLinkUpdateStatus('posting');
    try {
      const res = await fetch('/api/receiving/zendesk-claim/thread', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketId: filedTicket.id,
          receivingId,
          body: template.readDescription().trim(),
          subject: template.readSubject().trim(),
          public: notePublic,
          emailCcs: notePublic && ccEmails.length ? ccEmails : undefined,
          attachPhotoIds: [...photos.selectedPhotoIds],
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        toast.error(apiErrorText(data, 'Could not update the ticket'));
        setLinkUpdateStatus('idle');
        return;
      }
      toast.success(
        notePublic
          ? `Ticket ${filedTicket.number} updated — customer emailed`
          : `Ticket ${filedTicket.number} updated`,
      );
      setLinkUpdateStatus('posted');
      setStep('filed');
      // Mirror the create flow's auto-backup so the filed confirmation
      // shows the same local-backup card either way.
      void archiveToNas();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Network error');
      setLinkUpdateStatus('idle');
    }
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
    goBack,
    goNext,
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
    linkUpdateStatus,
    submitLinkUpdate,
    // sub-hooks
    photos,
    template,
    search,
    seller,
    reply,
  };
}

export type ReceivingClaimController = ReturnType<typeof useReceivingClaimController>;
