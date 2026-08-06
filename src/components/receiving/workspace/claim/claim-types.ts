import type { LinearStepState } from '@/components/receiving/workspace/ReceivingProgressStepper';
import type { TicketCandidate } from '@/components/support/link/useTicketSearch';

/** 'create' files a fresh Zendesk ticket; 'link' attaches an existing one. */
export type ClaimModalMode = 'create' | 'link';

/**
 * Claim scroll sections. Create starts at `photos` (skips `find`);
 * link starts at `find`. Ticket (`compose`) is editable details only.
 * Pre-file photo-backup copy lives on the sticky File footer (not a section).
 * Success is always `filed`.
 */
export type ClaimWizardStep = 'find' | 'photos' | 'compose' | 'filed' | 'seller';

/** Full top-to-bottom order (create filters out `find`). */
const CLAIM_WIZARD_STEP_ORDER: readonly ClaimWizardStep[] = [
  'find',
  'photos',
  'compose',
  'filed',
  'seller',
] as const;

/** Opening step for the given mode. */
export function claimWizardStartStep(mode: ClaimModalMode): ClaimWizardStep {
  return mode === 'link' ? 'find' : 'photos';
}

/** Step order visible for the active mode (create omits Find). */
function claimWizardOrderForMode(mode: ClaimModalMode): readonly ClaimWizardStep[] {
  return mode === 'link'
    ? CLAIM_WIZARD_STEP_ORDER
    : CLAIM_WIZARD_STEP_ORDER.filter((s) => s !== 'find');
}

/** The ticket that has been filed or linked for the current claim. */
export interface FiledTicket {
  number: string;
  url: string | null;
  id: number | null;
}

/**
 * Link-commit sub-flow: idle → linking (in-flight) → committed (persistent).
 * Independent of {@link LinkUpdateStatus} and of the `unlinking` boolean.
 */
export type LinkCommitStatus = 'idle' | 'linking' | 'committed';

/**
 * Post-link update sub-flow: idle → posting (in-flight) → posted (persistent).
 * Only meaningful after {@link LinkCommitStatus} is `'committed'`.
 */
export type LinkUpdateStatus = 'idle' | 'posting' | 'posted';

/** Local-storage backup result, displayed on the filed step (with a retry on failure). */
export interface ArchiveState {
  /** True when every photo archived cleanly (no warning / partial). */
  ok: boolean;
  copied: number;
  total: number;
  /** Folder the photos landed in (the ticket #), or null. */
  folder: string | null;
  /** Warning text when the backup failed or was partial. */
  warning: string | null;
}

/**
 * Slim ticket shape returned by GET /api/receiving/zendesk-claim/link.
 *
 * Now an alias of the shared {@link TicketCandidate}: both endpoints return the
 * same server shape (`TicketLinkCandidate` in src/lib/zendesk-link-candidates.ts),
 * and keeping two structurally-identical interfaces meant the shared TicketPicker
 * could only be reused across a cast. The local name stays so the claim-flow call
 * sites read unchanged.
 */
export type LinkCandidate = TicketCandidate;

/** A carton photo eligible to attach to the Zendesk ticket. */
export interface ClaimPhoto {
  id: number;
  url: string;
  /** Line the photo primary-links (item evidence) — null for carton-scoped shots. */
  receivingLineId: number | null;
  /** Raw `photo_type` (the list API's `caption`) — stage via `stageFromPhotoType`. */
  photoType: string | null;
}

interface ClaimWizardStepDef {
  key: ClaimWizardStep;
  label: string;
}

/** Scroll-spy defs for the active mode (Seller omitted when not applicable). */
export function claimWizardStepsForMode(
  mode: ClaimModalMode,
  sellerStepApplicable: boolean,
): ClaimWizardStepDef[] {
  const filedLabel = mode === 'link' ? 'Linked' : 'Filed';
  const steps: ClaimWizardStepDef[] =
    mode === 'link'
      ? [
          { key: 'find', label: 'Find' },
          { key: 'photos', label: 'Photos' },
          { key: 'compose', label: 'Ticket' },
          { key: 'filed', label: filedLabel },
          { key: 'seller', label: 'Seller' },
        ]
      : [
          { key: 'photos', label: 'Photos' },
          { key: 'compose', label: 'Ticket' },
          { key: 'filed', label: filedLabel },
          { key: 'seller', label: 'Seller' },
        ];
  return steps.filter((s) => s.key !== 'seller' || sellerStepApplicable);
}

/** DOM id for a claim scroll section (`claim-section-photos`, …). */
export function claimSectionDomId(step: ClaimWizardStep): string {
  return `claim-section-${step}`;
}

export const SELLER_SKELETON_WIDTHS = ['92%', '88%', '76%', '84%', '68%', '56%'] as const;

/**
 * Derive positional step states for the active mode (legacy helper for any
 * remaining stepper consumers).
 */
export function claimWizardStepStates(
  step: ClaimWizardStep,
  mode: ClaimModalMode,
): Record<string, LinearStepState> {
  const order = claimWizardOrderForMode(mode);
  const curIdx = Math.max(0, order.indexOf(step));
  const states: Record<string, LinearStepState> = {};
  order.forEach((key, i) => {
    states[key] = i < curIdx ? 'done' : i === curIdx ? 'active' : 'pending';
  });
  return states;
}
