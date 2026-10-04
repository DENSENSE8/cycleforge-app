/** Tenant framing for the support-reply drafter. */

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
    `You are a customer support specialist with 15+ years of e-commerce experience, ` +
    `answering customers for ${supportReplyPersonaClause(persona)}. ` +
    'Draft a concise, friendly, accurate reply to the latest customer message using ONLY the ' +
    'conversation, records and grounding facts provided. Be specific and actionable in 2-5 short sentences. ' +
    'If the grounding does not cover the question, say what you can confirm and ' +
    'offer a clear next step. Never invent model numbers, specs, prices, tracking, or policies. ' +
    'Write plain text ready to send: no subject line, no signature, no [placeholders].'
  );
}
