/**
 * Claim ticket draft — the deterministic template is FACT input for the LLM,
 * not the operator-facing body. Station Ticket mode asks Hermes to rewrite it
 * the same way the unfound-queue push draft does.
 *
 * `buildTemplate` is injected so this module stays DB-free for unit tests.
 */

import { draftTicketWithLlm } from '@/lib/ai/zendesk-ticket-draft';
import type { OrgId } from '@/lib/tenancy/constants';
import { CLAIM_TYPE_LABEL, type ClaimType } from '@/lib/receiving-claim-type';
import type { ClaimTemplateInput, ClaimTemplateResult } from '@/lib/zendesk-claim-template';

export type DraftReceivingClaimInput = ClaimTemplateInput;

export type DraftReceivingClaimResult = {
  subject: string;
  description: string;
  model: string;
  /** True when Hermes failed or dropped facts — template text is returned. */
  degraded: boolean;
  /**
   * WHY it degraded, or null when it did not. The two causes need different
   * operator responses — a dropped fact means the draft was wrong, an
   * unreachable gateway means there was no draft — and this used to swallow
   * both into one silent `degraded: true`, so a cold AI box and a hallucinating
   * model looked identical at the composer.
   */
  degradedReason: string | null;
  template: ClaimTemplateResult;
};

export async function draftReceivingClaimWithLlm(
  orgId: OrgId,
  input: DraftReceivingClaimInput,
  deps: {
    buildTemplate: (input: ClaimTemplateInput, orgId?: OrgId) => Promise<ClaimTemplateResult>;
    draftWithLlm?: typeof draftTicketWithLlm;
  },
): Promise<DraftReceivingClaimResult> {
  const draftWithLlm = deps.draftWithLlm ?? draftTicketWithLlm;
  const template = await deps.buildTemplate(input, orgId);
  const reason = input.reason?.trim() ?? '';
  const context = [
    `Receiving claim — ${CLAIM_TYPE_LABEL[input.claimType as ClaimType]}`,
    reason ? `Issue: ${reason}` : null,
  ]
    .filter(Boolean)
    .join(' — ');

  const po = template.poNumber?.trim();
  const tracking = template.tracking?.trim();

  try {
    // The guard below rejects a draft that loses either, so the model is told
    // which strings they are rather than left to infer it from "keep the facts".
    const draft = await draftWithLlm(orgId, { context, template, mustKeep: [po, tracking] });
    const keptPo = !po || draft.subject.includes(po) || draft.description.includes(po);
    const keptTrk =
      !tracking || draft.subject.includes(tracking) || draft.description.includes(tracking);
    if (!keptPo || !keptTrk) {
      const dropped = [!keptPo ? `PO ${po}` : null, !keptTrk ? `tracking ${tracking}` : null]
        .filter(Boolean)
        .join(' and ');
      return {
        subject: template.subject,
        description: template.description,
        model: draft.model,
        degraded: true,
        degradedReason: `The model dropped ${dropped} from the draft`,
        template,
      };
    }
    return {
      subject: draft.subject,
      description: draft.description,
      model: draft.model,
      degraded: false,
      degradedReason: null,
      template,
    };
  } catch (err) {
    return {
      subject: template.subject,
      description: template.description,
      model: '',
      degraded: true,
      degradedReason: err instanceof Error ? err.message : 'AI draft failed',
      template,
    };
  }
}
