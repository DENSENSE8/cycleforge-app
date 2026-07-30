import type { LinearStepState } from '@/components/receiving/workspace/ReceivingProgressStepper';
import type { TicketCandidate } from '@/components/support/link/useTicketSearch';

/** 'create' files a fresh Zendesk ticket; 'link' attaches an existing one. */
export type ClaimModalMode = 'create' | 'link';

/**
 * Linear create-flow wizard. Each step owns exactly one job:
 *   photos  → acknowledge/select evidence photos
 *   compose → pick claim type + edit the full Zendesk subject + body
 *   review  → read-only all-in-one summary, then file + archive
 *   confirm → ticket-created + local-backup confirmation
 *   seller  → the seller-facing message
 * Link mode runs its own three-step wizard (see {@link LinkClaimStep}).
 */
export type CreateClaimStep = 'photos' | 'compose' | 'review' | 'confirm' | 'seller';

/** The fixed left-to-right order of the create-flow steps. */
export const CREATE_STEP_ORDER: readonly CreateClaimStep[] = [
  'photos',
  'compose',
  'review',
  'confirm',
  'seller',
] as const;

/**
 * Linear link-flow wizard — the "Link existing" tab. Mirrors the create-flow
 * wizard once a ticket is picked, so photos/subject/body/recipients render
 * and behave identically in either flow:
 *   find    → search + select an existing Zendesk ticket
 *   photos  → acknowledge/select evidence photos to attach to the ticket
 *   compose → edit the ticket subject (prefilled from the ticket's own title)
 *             + body + recipients, same as the create flow
 *   review  → read-only summary, then post the comment (+ photos) to the ticket
 *   linked  → update-posted confirmation + local-backup card
 *   seller  → the seller-facing message (skipped for a 'return' claim — see
 *             `sellerStepApplicable` on the controller)
 */
export type LinkClaimStep = 'find' | 'photos' | 'compose' | 'review' | 'linked' | 'seller';

/** The fixed left-to-right order of the link-flow steps. */
export const LINK_STEP_ORDER: readonly LinkClaimStep[] = [
  'find',
  'photos',
  'compose',
  'review',
  'linked',
  'seller',
] as const;

/** The ticket that has been filed or linked for the current claim. */
export interface FiledTicket {
  number: string;
  url: string | null;
  id: number | null;
}

/** Local-storage backup result, displayed on the confirm step (with a retry on failure). */
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

/** The five create-flow steps, in order, for the linear header stepper. */
export const CLAIM_WIZARD_STEPS = [
  { key: 'photos', label: 'Photos' },
  { key: 'compose', label: 'Ticket' },
  { key: 'review', label: 'Review' },
  { key: 'confirm', label: 'Filed' },
  { key: 'seller', label: 'Seller' },
] as const;

/** The link-flow steps, in order, for the linear header stepper. */
export const LINK_WIZARD_STEPS = [
  { key: 'find', label: 'Find' },
  { key: 'photos', label: 'Photos' },
  { key: 'compose', label: 'Ticket' },
  { key: 'review', label: 'Review' },
  { key: 'linked', label: 'Linked' },
  { key: 'seller', label: 'Seller' },
] as const;

export const SELLER_SKELETON_WIDTHS = ['92%', '88%', '76%', '84%', '68%', '56%'] as const;

/**
 * Derive the dot-stepper state for the linear create wizard. States are purely
 * positional: every step left of the current one is `done`, the current one is
 * `active`, the rest `pending`. (`filedTicket`/`mode` are accepted for symmetry
 * with the call site and future link-mode reuse.)
 */
export function claimWizardStepStates(
  createStep: CreateClaimStep,
  _filedTicket: FiledTicket | null,
  _mode: ClaimModalMode,
): Record<string, LinearStepState> {
  const curIdx = Math.max(0, CREATE_STEP_ORDER.indexOf(createStep));
  const states: Record<string, LinearStepState> = {};
  CREATE_STEP_ORDER.forEach((key, i) => {
    states[key] = i < curIdx ? 'done' : i === curIdx ? 'active' : 'pending';
  });
  return states;
}

/** Positional dot-stepper state for the linear link wizard (same rule as create). */
export function linkWizardStepStates(linkStep: LinkClaimStep): Record<string, LinearStepState> {
  const curIdx = Math.max(0, LINK_STEP_ORDER.indexOf(linkStep));
  const states: Record<string, LinearStepState> = {};
  LINK_STEP_ORDER.forEach((key, i) => {
    states[key] = i < curIdx ? 'done' : i === curIdx ? 'active' : 'pending';
  });
  return states;
}
