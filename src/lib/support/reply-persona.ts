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
