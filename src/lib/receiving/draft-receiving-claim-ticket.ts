/**
 * Hermes rewrite of a receiving-claim ticket template.
 *
 * Builds (or accepts) the deterministic Zendesk template, then routes the
 * rewrite through {@link draftTicketWithLlm} (Hermes forced tool-call). Nothing
 * is filed here — the operator reviews the draft on the create-ticket surface.
 */

import { CLAIM_TYPE_LABEL, type ClaimType } from '@/lib/receiving-claim-type';
import type { ClaimTemplateResult } from '@/lib/zendesk-claim-template';
import type { TicketDraftInput, TicketDraftResult } from '@/lib/ai/zendesk-ticket-draft';
import type { OrgId } from '@/lib/tenancy/constants';

export interface DraftReceivingClaimTicketInput {
  receivingId: number;
  lineId?: number | null;
  claimType: ClaimType;
  reason?: string;
  /** Live editor subject — when both subject and body are set, skip a rebuild. */
  subject?: string;
  description?: string;
  poReceivingLink?: string;
}

export interface DraftReceivingClaimTicketResult {
  subject: string;
  description: string;
  model?: string;
  degraded: boolean;
}

export interface DraftReceivingClaimTicketDeps {
  buildTemplate?: (
    input: {
      receivingId: number;
      lineId?: number | null;
      claimType: ClaimType;
      reason?: string;
      poReceivingLink?: string;
    },
    orgId?: OrgId,
  ) => Promise<ClaimTemplateResult>;
  draftWithLlm?: (
    orgId: OrgId,
    input: TicketDraftInput,
  ) => Promise<TicketDraftResult>;
}

function asTemplate(input: DraftReceivingClaimTicketInput): ClaimTemplateResult | null {
  const subject = input.subject?.trim() ?? '';
  const description = input.description?.trim() ?? '';
  if (!subject || !description) return null;
  return { subject, description, poNumber: null, tracking: null };
}

function factsKept(template: ClaimTemplateResult, draft: TicketDraftResult): boolean {
  const haystack = `${draft.subject}\n${draft.description}`;
  const tokens = [template.poNumber, template.tracking]
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter(Boolean);
  return tokens.every((token) => haystack.includes(token));
}

export async function draftReceivingClaimTicket(
  orgId: OrgId,
  input: DraftReceivingClaimTicketInput,
  deps: DraftReceivingClaimTicketDeps = {},
): Promise<DraftReceivingClaimTicketResult> {
  const buildTemplate =
    deps.buildTemplate ??
    (await import('@/lib/zendesk-claim-template')).buildReceivingClaimTemplate;
  const draftWithLlm =
    deps.draftWithLlm ??
    (await import('@/lib/ai/zendesk-ticket-draft')).draftTicketWithLlm;

  const live = asTemplate(input);
  const template =
    live ??
    (await buildTemplate(
      {
        receivingId: input.receivingId,
        lineId: input.lineId,
        claimType: input.claimType,
        reason: input.reason,
        poReceivingLink: input.poReceivingLink,
      },
      orgId,
    ));

  const draft = await draftWithLlm(orgId, {
    context: `Receiving claim — ${CLAIM_TYPE_LABEL[input.claimType]}`,
    template: { subject: template.subject, description: template.description },
  });

  if (!factsKept(template, draft)) {
    return {
      subject: template.subject,
      description: template.description,
      model: draft.model,
      degraded: true,
    };
  }

  return {
    subject: draft.subject,
    description: draft.description,
    model: draft.model,
    degraded: false,
  };
}
