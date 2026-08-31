/**
 * Ticket CC (audience) rules — ONE set, shared by the Support console chat
 * composer and the Unbox station Ticket composer.
 *
 * CC is an AUDIENCE control and only exists on a **public reply**. An internal
 * note is never emailed, so {@link resolveComposerCcPayload} answers `undefined`
 * for it rather than `[]` — the two are not the same thing to
 * `/api/zendesk/photo-ticket`, which only forwards `emailCcs` when the comment
 * is public.
 *
 * The `@` metaphor on the station composer means THIS — an email recipient —
 * and never "attach product context"; that job moved to the `+` drill menu on
 * 2026-08-30.
 */

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

/**
 * The exact `emailCcs` value for a reply.
 *
 * Folds the half-typed address still sitting in the field, so an operator who
 * types one and hits Enter does not silently lose it — the console composer has
 * done this since CC shipped and the station now shares the rule.
 */
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
