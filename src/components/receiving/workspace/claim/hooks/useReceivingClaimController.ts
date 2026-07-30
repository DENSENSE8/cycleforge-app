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
  claimWizardStepStates,
  linkWizardStepStates,
  CREATE_STEP_ORDER,
  LINK_STEP_ORDER,
  type ArchiveState,
  type ClaimModalMode,
  type CreateClaimStep,
  type LinkClaimStep,
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
  const [createStep, setCreateStep] = useState<CreateClaimStep>('photos');
  const [linkStep, setLinkStep] = useState<LinkClaimStep>('find');
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

  // ── Dry-run test state (no Zendesk ticket / local backup / DB side-effects) ─
  // True once the operator filed via the dry-run path: the confirm/seller steps
  // render against the '#TEST' sentinel and suppress any real side-effect.
  const [isDryRun, setIsDryRun] = useState(false);
  const [testCreating, setTestCreating] = useState(false);
  const [testResult, setTestResult] = useState<{
    subject: string;
    description: string;
    attachCount: number;
  } | null>(null);
  const [testSellerLoading, setTestSellerLoading] = useState(false);
  const [testSellerPreview, setTestSellerPreview] = useState<{ message: string; model: string } | null>(
    null,
  );
  // Local backup result — set by both the auto-backup on ticket creation and the
  // manual "Back up locally" action, so the confirm step can DISPLAY whether the
  // backup landed (and offer a retry when it failed/was partial).
  const [archiveState, setArchiveState] = useState<ArchiveState | null>(null);
  // Stable per-submission idempotency key — generated on open and reused across
  // retries so a failed-then-retried submit never files two tickets.
  const idempotencyKey = useRef('');

  // ── Link-flow submit state ───────────────────────────────────────────────
  const [linking, setLinking] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [linkCommitted, setLinkCommitted] = useState(false);
  // The Photos → Ticket → Review sub-flow that runs after a ticket is linked
  // (mirrors the create flow's submit): posts the comment + attaches photos to
  // the EXISTING ticket rather than filing a new one.
  const [linkUpdating, setLinkUpdating] = useState(false);
  const [linkUpdatePosted, setLinkUpdatePosted] = useState(false);

  // ── Composed sub-hooks ───────────────────────────────────────────────────
  const photos = useClaimPhotos(open, receivingId);
  const template = useClaimTemplate({
    open,
    // Keep the preview warm across every pre-file/pre-update step so Review
    // can render it — the create and link Photos/Ticket/Review steps share
    // this exact gate.
    active:
      (mode === 'create' &&
        (createStep === 'photos' || createStep === 'compose' || createStep === 'review')) ||
      (mode === 'link' &&
        (linkStep === 'photos' || linkStep === 'compose' || linkStep === 'review')),
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
  // The seller step is the last step of EITHER wizard — gate the seller hook's
  // auto-draft on whichever mode is active so a link-mode selection no longer
  // drafts prematurely (it only drafts once we actually reach the seller step).
  const sellerActive = mode === 'create' ? createStep === 'seller' : linkStep === 'seller';
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
    setCreateStep('photos');
    setLinkStep('find');
    setFiledTicket(null);
    setLinkCommitted(false);
    setLinkUpdatePosted(false);
    setTestResult(null);
    setTestSellerPreview(null);
    setArchiveState(null);
    setIsDryRun(false);
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
    () => claimWizardStepStates(createStep, filedTicket, mode),
    [createStep, filedTicket, mode],
  );
  const linkStepStates = useMemo(() => linkWizardStepStates(linkStep), [linkStep]);
  const sellerStepReady = !!filedTicket || mode === 'link';
  // The compose draft must be complete before Review/Submit are reachable.
  const composeComplete = !!template.subject.trim() && !!template.description.trim();
  // A 'return' claim has no marketplace seller to message — the seller step
  // (and its dot on the stepper) is skipped entirely for either wizard.
  const sellerStepApplicable = claimType !== 'return';

  // ── Linear wizard navigation (create mode) ───────────────────────────────
  // A step is reachable when every step before it is satisfied: confirm/seller
  // require a filed ticket; review requires a complete compose draft; seller
  // is also skipped entirely for a 'return' claim.
  const isCreateStepDisabled = (key: string): boolean => {
    const target = key as CreateClaimStep;
    if (target === 'seller') return !filedTicket || !sellerStepApplicable;
    if (target === 'confirm') return !filedTicket;
    if (target === 'review') return !composeComplete && !filedTicket;
    return false;
  };

  const goToStep = (next: CreateClaimStep) => {
    if (isCreateStepDisabled(next)) return;
    setCreateStep(next);
  };

  /** Footer "Back" — one step left in the create order (no-op on the first). */
  const goBack = () => {
    const idx = CREATE_STEP_ORDER.indexOf(createStep);
    if (idx > 0) setCreateStep(CREATE_STEP_ORDER[idx - 1]);
  };

  /** Footer "Next" — photos → compose → review (Submit lives on review). */
  const goNext = () => {
    if (createStep === 'photos') {
      setCreateStep('compose');
    } else if (createStep === 'compose') {
      if (composeComplete) setCreateStep('review');
    }
  };

  // ── Link-flow navigation (link mode) ─────────────────────────────────────
  // photos/compose/review are only reachable once a ticket is linked; linked
  // additionally requires the update (comment + photos) to have been posted;
  // seller requires both AND is skipped entirely for a 'return' claim.
  const isLinkStepDisabled = (key: string): boolean => {
    const target = key as LinkClaimStep;
    if (target === 'find') return false;
    if (!linkCommitted) return true;
    if (target === 'review') return !composeComplete;
    if (target === 'linked') return !linkUpdatePosted;
    if (target === 'seller') return !linkUpdatePosted || !sellerStepApplicable;
    return false;
  };

  const handleLinkStepClick = (key: string) => {
    if (isLinkStepDisabled(key)) return;
    setLinkStep(key as LinkClaimStep);
  };

  /** Link "Back" — one step left in the link order (no-op on the first). */
  const goLinkBack = () => {
    const idx = LINK_STEP_ORDER.indexOf(linkStep);
    if (idx > 0) setLinkStep(LINK_STEP_ORDER[idx - 1]);
  };

  /** Link "Next" — photos → compose → review (Post to ticket lives on review). */
  const goLinkNext = () => {
    if (linkStep === 'photos') {
      setLinkStep('compose');
    } else if (linkStep === 'compose') {
      if (composeComplete) setLinkStep('review');
    }
  };

  // ── Wizard navigation ────────────────────────────────────────────────────
  const handleModeChange = (next: ClaimModalMode) => {
    setMode(next);
    if (next === 'link') {
      // Resume wherever the link sub-flow left off; a fresh link starts at Find.
      seller.resetBootstrap();
      if (!linkCommitted) {
        setLinkStep('find');
      } else if (!linkUpdatePosted) {
        setLinkStep('photos');
      } else {
        setLinkStep('linked');
      }
    } else {
      setCreateStep(filedTicket ? 'confirm' : 'photos');
    }
  };

  const handleClaimStepClick = (key: string) => {
    goToStep(key as CreateClaimStep);
  };

  /**
   * Confirmation → seller, for whichever wizard is active. In a real create flow
   * the seller hook auto-bootstraps; for a dry run ('#TEST') the hook skips its
   * fetch, so we draft a throwaway preview here instead.
   */
  const continueToSeller = () => {
    if (mode === 'link') {
      setLinkStep('seller');
      return;
    }
    setCreateStep('seller');
    if (filedTicket?.number === '#TEST') void draftTestSellerMessage();
  };

  const selectLinkTicket = (t: LinkCandidate | null) => {
    if (!t) {
      search.setSelectedTicket(null);
      if (mode === 'link') {
        setFiledTicket(null);
        setLinkCommitted(false);
        seller.resetDraftState();
      }
      return;
    }
    const ticketChanged = search.selectedTicket?.id !== t.id;
    search.setSelectedTicket(t);
    if (mode === 'link') {
      setFiledTicket({ number: `#${t.id}`, url: t.url, id: t.id });
      setLinkCommitted(false);
      if (ticketChanged) {
        seller.resetDraftState();
        setLinkUpdatePosted(false);
      }
    }
  };

  const deselectLinkedTicket = () => {
    search.setSelectedTicket(null);
    setFiledTicket(null);
    setLinkCommitted(false);
    setLinkUpdatePosted(false);
    seller.resetDraftState();
    // Deselecting / unlinking always returns to the picker step.
    setLinkStep('find');
  };

  const handleBannerUnlink = () => {
    if (linkCommitted) {
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
      setCreateStep('confirm');
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

  // ── Dry-run tests: rehearse the flow without filing/saving anything ───────
  const submitTestCreate = async () => {
    if (testCreating || submitting || !receivingId) return;
    setTestCreating(true);
    try {
      const res = await fetch('/api/receiving/zendesk-claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dryRun: true,
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
        toast.error(apiErrorText(data, 'Test create failed'));
        return;
      }
      setTestResult({
        subject: String(data.subject ?? ''),
        description: String(data.description ?? ''),
        attachCount: Number(data.attachCount ?? 0),
      });
      toast.success('Test create OK — no ticket was filed');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Network error');
    } finally {
      setTestCreating(false);
    }
  };

  const submitTestSeller = async () => {
    if (testSellerLoading || !receivingId) return;
    const subject = template.readSubject().trim();
    const description = template.readDescription().trim();
    if (!subject || !description) {
      toast.error('Add a subject and body before testing the seller message');
      return;
    }
    setTestSellerLoading(true);
    try {
      const res = await fetch('/api/receiving/zendesk-claim/assist-seller', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dryRun: true,
          receivingId,
          lineId,
          claimType,
          reason: reason.trim(),
          subject,
          description,
          zendeskTicketNumber: '#TEST',
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        toast.error(apiErrorText(data, 'Test seller message failed'));
        return;
      }
      setTestSellerPreview({
        message: typeof data.sellerMessage === 'string' ? data.sellerMessage : '',
        model: typeof data.model === 'string' ? data.model : '',
      });
      if (data.linksStripped) {
        toast.warning('Links were removed (marketplace TOS)', { duration: 5000 });
      }
      toast.success('Test seller message drafted — not saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Network error');
    } finally {
      setTestSellerLoading(false);
    }
  };

  const clearTestOutputs = () => {
    setTestResult(null);
    setTestSellerPreview(null);
  };

  // Dry-run "File ticket": exercise the REAL Review → Confirm → Seller arc with
  // zero side-effects. The endpoint short-circuits on `dryRun` (returns the
  // assembled subject/body + a '#TEST' ticket; no Zendesk/local/DB writes), so we
  // land on the confirm step with a synthetic ticket + local backup result to inspect.
  const submitDryRun = async () => {
    if (testCreating || submitting || !receivingId) return;
    const subject = template.readSubject().trim();
    const description = template.readDescription().trim();
    if (!subject || !description) return;
    setTestCreating(true);
    try {
      const res = await fetch('/api/receiving/zendesk-claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dryRun: true,
          receivingId,
          lineId,
          claimType,
          reason: reason.trim(),
          subject,
          description,
          attachPhotoIds: [...photos.selectedPhotoIds],
          notePublic,
          ccEmails,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        toast.error(apiErrorText(data, 'Dry run failed'));
        return;
      }
      const attachCount = Number(data.attachCount ?? photos.selectedPhotoIds.size);
      setIsDryRun(true);
      setFiledTicket({ number: '#TEST', url: null, id: null });
      // Synthesise the local backup result the real backup would have produced,
      // so the confirmation's backup card renders exactly as it would in production.
      setArchiveState({
        ok: true,
        copied: photos.photos.length,
        total: photos.photos.length,
        folder: 'TEST',
        warning: null,
      });
      setCreateStep('confirm');
      toast.success(`Dry run OK — no ticket filed (${attachCount} would attach)`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Network error');
    } finally {
      setTestCreating(false);
    }
  };

  // Draft a seller-message PREVIEW for the '#TEST' sentinel via Hermes dry-run.
  // Nothing is persisted (the seller hook also recognises '#TEST'); this just
  // fills the seller step so the operator can rehearse it end-to-end.
  const draftTestSellerMessage = async () => {
    if (!receivingId) return;
    const subject = template.readSubject().trim();
    const description = template.readDescription().trim();
    if (!subject || !description) return;
    setTestSellerLoading(true);
    try {
      const res = await fetch('/api/receiving/zendesk-claim/assist-seller', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dryRun: true,
          receivingId,
          lineId,
          claimType,
          reason: reason.trim(),
          subject,
          description,
          zendeskTicketNumber: '#TEST',
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success && typeof data.sellerMessage === 'string') {
        seller.setSellerMessage(data.sellerMessage);
      }
    } catch {
      /* best-effort preview — the step still renders without a draft */
    } finally {
      setTestSellerLoading(false);
    }
  };

  // ── Link flow: attach an existing ticket to this carton/line ─────────────
  const submitLink = async () => {
    if (linking || !search.selectedTicket || !receivingId) return;
    const selected = search.selectedTicket;
    setLinking(true);
    try {
      const res = await fetch('/api/receiving/zendesk-claim/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receivingId, lineId, ticketId: selected.id }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        toast.error(apiErrorText(data, 'Could not link the ticket'));
        return;
      }
      const url = typeof data.ticketUrl === 'string' ? data.ticketUrl : null;
      toast.success(`Linked ${data.ticketNumber}`, {
        action: url
          ? { label: 'Open', onClick: () => window.open(url, '_blank', 'noopener') }
          : undefined,
      });
      onTicketCreated(String(data.ticketNumber));
      setLinkCommitted(true);
      setLinkUpdatePosted(false);
      setFiledTicket({ number: String(data.ticketNumber), url, id: selected.id });
      // Land on Photos — same Photos → Ticket → Review arc the create flow
      // runs, ending in a comment (+ attached photos) posted to THIS ticket.
      seller.resetBootstrap();
      setLinkStep('photos');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLinking(false);
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
    if (linkUpdating || !filedTicket?.id || !receivingId) return;
    setLinkUpdating(true);
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
        return;
      }
      toast.success(
        notePublic
          ? `Ticket ${filedTicket.number} updated — customer emailed`
          : `Ticket ${filedTicket.number} updated`,
      );
      setLinkUpdatePosted(true);
      setLinkStep('linked');
      // Mirror the create flow's auto-backup so the "Linked" confirmation
      // shows the same local-backup card either way.
      void archiveToNas();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLinkUpdating(false);
    }
  };

  return {
    // props passthrough
    row,
    open,
    onClose,
    // wizard
    mode,
    createStep,
    setCreateStep,
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
    linkStep,
    linkStepStates,
    sellerStepReady,
    sellerStepApplicable,
    composeComplete,
    handleModeChange,
    handleClaimStepClick,
    handleLinkStepClick,
    isCreateStepDisabled,
    isLinkStepDisabled,
    goToStep,
    goBack,
    goNext,
    goLinkBack,
    goLinkNext,
    continueToSeller,
    selectLinkTicket,
    handleBannerUnlink,
    // create flow
    submitting,
    draftBody,
    submitInternal,
    archiveToNas,
    // dry-run tests
    isDryRun,
    testCreating,
    testResult,
    testSellerLoading,
    testSellerPreview,
    submitTestCreate,
    submitTestSeller,
    clearTestOutputs,
    submitDryRun,
    archiveState,
    // link flow
    linking,
    unlinking,
    linkCommitted,
    submitLink,
    linkUpdating,
    linkUpdatePosted,
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
