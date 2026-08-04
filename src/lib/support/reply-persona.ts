/**
 * Tenant framing for the support-reply drafter.
 *
 * `SUPPORT_SYSTEM_PROMPT` used to name ONE vendor's brand — "a senior
 * customer-support agent for a <vendor> audio reseller", with the grounding
 * block citing that vendor's service documents. This is shared multi-tenant
 * code: the dogfood tenant is not the product, so a second tenant on it got a
 * model impersonating a brand they do not sell — the same class of defect as a
 * hardcoded vendor sentence in operator copy, but pointed at a customer.
 *
 * The framing is now RESOLVED per org, exactly like a runtime provider label,
 * and its fallback is generic rather than anyone's brand. This module is pure so
 * the prompt shape is testable without a DB; `reply-persona-deps.ts` reads it.
 */

export interface SupportReplyPersona {
  /** The tenant's own business name. Never another company's. */
  businessName?: string | null;
  /** What they sell, when the org has said so (e.g. "audio", "networking"). */
  vertical?: string | null;
}

function clean(v: string | null | undefined): string | null {
  const t = (v ?? '').trim();
  return t ? t : null;
}

/** `a` / `an` — a tenant vertical is operator-entered, so it can start anyhow. */
function article(word: string): string {
  return /^[aeiou]/i.test(word) ? 'an' : 'a';
}

/** The tenant clause: "for <who>". Generic when the org has told us nothing. */
export function supportReplyPersonaClause(persona: SupportReplyPersona | null | undefined): string {
  const name = clean(persona?.businessName);
  const vertical = clean(persona?.vertical);
  const kind = vertical ? `${article(vertical)} ${vertical} reseller` : 'a reseller';
  return name ? `${name}, ${kind}` : kind;
}

export function buildSupportSystemPrompt(persona?: SupportReplyPersona | null): string {
  return (
    `You are a senior customer-support agent for ${supportReplyPersonaClause(persona)}. ` +
    'Draft a concise, friendly, accurate reply to the customer using ONLY the ' +
    'grounding facts provided. Be specific and actionable in 2-5 short sentences. ' +
    'If the grounding does not cover the question, say what you can confirm and ' +
    'offer a clear next step. Never invent model numbers, specs, prices, or policies.'
  );
}
