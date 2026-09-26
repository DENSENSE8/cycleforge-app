/** Ticket CC (audience) rules — ONE set, shared by the Support console chat composer and the Unbox station Ticket composer. */

/** Deliberately permissive: Zendesk is the authority on deliverability. */
export const COMPOSER_CC_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Trim, and drop the separator an operator types between two addresses. */
export function normalizeComposerCc(raw: string): string {
  return raw.trim().replace(/[,;]+$/, '').trim();
}

export function isComposerCcEmail(raw: string): boolean {
  return COMPOSER_CC_EMAIL_RE.test(normalizeComposerCc(raw));
}

/** Append when valid and not already present; otherwise return the list as-is. */
export function addComposerCc(ccs: readonly string[], raw: string): string[] {
  const email = normalizeComposerCc(raw);
  if (!email || !COMPOSER_CC_EMAIL_RE.test(email) || ccs.includes(email)) {
    return [...ccs];
  }
  return [...ccs, email];
}

export function removeComposerCc(ccs: readonly string[], email: string): string[] {
  return ccs.filter((e) => e !== email);
}

/** The exact `emailCcs` value for a reply. */
export function resolveComposerCcPayload(opts: {
  isPublic: boolean;
  ccs: readonly string[];
  /** Whatever is still in the CC input at send time. */
  draft?: string;
}): string[] | undefined {
  if (!opts.isPublic) return undefined;
  const all = addComposerCc(opts.ccs, opts.draft ?? '');
  return all.length ? all : undefined;
}

/**
 * Type-ahead pool: the ticket requester + every agent email, minus the ones
 * already added. Free entry is still allowed (any valid address).
 */
export function buildComposerCcSuggestions(opts: {
  requesterEmail?: string | null;
  agentEmails?: ReadonlyArray<string | null | undefined>;
  ccs: readonly string[];
}): string[] {
  const pool = [
    ...(opts.requesterEmail ? [opts.requesterEmail] : []),
    ...(opts.agentEmails ?? []).filter((e): e is string => Boolean(e)),
  ];
  return Array.from(new Set(pool)).filter((e) => !opts.ccs.includes(e));
}
