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

/**
 * Operator CC history — the same bank the claim rail and the Omni Composer
 * Cc strip both seed from. The rail used to be the only reader
 * (`receiving-claim:cc-emails`); filing from Ticket mode then emailed nobody
 * until the operator retyped every address.
 *
 * Accumulated, not session-scoped: removing a chip from the current form does
 * not forget the address. Next carton / next station still auto-fills it.
 */
export const COMPOSER_CC_HISTORY_STORAGE_KEY = 'receiving-claim:cc-emails';

/** Broadcast so the rail and the composer Cc row stay one audience. */
export const COMPOSER_CC_FORM_EVENT = 'cycleforge:composer-cc-form';

export type ComposerCcStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

function browserStorage(): ComposerCcStorage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function uniqueEmails(raw: readonly unknown[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of raw) {
    const email = String(value ?? '').trim();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}

/**
 * Reads the operator's accumulated public-CC history. Tolerates the legacy
 * single-email string this key used to hold (`receiving-claim:last-cc-email`).
 */
export function readComposerCcHistory(storage?: ComposerCcStorage | null): string[] {
  const store = storage === undefined ? browserStorage() : storage;
  if (!store) return [];
  let stored: string | null;
  try {
    stored = store.getItem(COMPOSER_CC_HISTORY_STORAGE_KEY);
  } catch {
    return [];
  }
  if (!stored) return [];
  try {
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return uniqueEmails(parsed);
  } catch {
    const trimmed = stored.trim();
    return trimmed ? [trimmed] : [];
  }
}

/**
 * Merge newly entered addresses into history. Returns the stored set.
 * An empty write is a no-op — clearing the form must not wipe the bank.
 */
export function rememberComposerCcHistory(
  emails: readonly string[],
  storage?: ComposerCcStorage | null,
): string[] {
  const store = storage === undefined ? browserStorage() : storage;
  const incoming = uniqueEmails(emails);
  if (!store) return incoming;
  const known = new Set(readComposerCcHistory(store));
  let changed = false;
  for (const email of incoming) {
    if (!known.has(email)) {
      known.add(email);
      changed = true;
    }
  }
  const next = [...known];
  if (changed) {
    try {
      store.setItem(COMPOSER_CC_HISTORY_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Best-effort only (private mode / quota).
    }
  }
  return next;
}

export function publishComposerCcForm(emails: readonly string[]): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<string[]>(COMPOSER_CC_FORM_EVENT, { detail: [...emails] }),
  );
}
