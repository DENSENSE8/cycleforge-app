/**
 * "Does the vendor side consider this PO received?" — ONE answer, one module.
 *
 * Deliberately dependency-free (no `@/lib/db`, no tenancy, no React) so every
 * consumer can import it at its own altitude: the DB-backed reconciler, the
 * DB-free paste check, and the client rail row. That is the whole reason this
 * file exists — the constant previously lived in `zoho-received-reconcile.ts`,
 * which imports the Neon pool at module top level, so a client bundle could not
 * reach it (bundle altitude). Two call sites
 * therefore shipped hand-typed copies, each carrying a "keep in sync" comment:
 *
 *   - `check-zoho-received.ts`  → re-exports `ZOHO_RECEIVED_LIKE_STATUSES`
 *   - `rail/status.ts`          → a bare inline `new Set([...])`
 *
 * Three declarations of one mapping is the drift the source-of-truth rule bans;
 * the fix is the documented one (split the pure half into a leaf module the
 * heavy one re-exports), not a fourth comment asking humans to remember.
 *
 * **TWO lists live here, and they are NOT the same.** `ZOHO_RECEIVED_LIKE`
 * answers *"did the vendor receive it?"*; `ZOHO_TERMINAL` answers *"is it still
 * incoming?"* and additionally carries `cancelled` / `rejected`. A cancelled PO
 * is emphatically not a received one. They sit side by side so that distinction
 * is visible where they are declared rather than in a comment pointing at
 * another file — do not collapse them.
 *
 * `ZOHO_TERMINAL_STATUSES` moved here from `delivered-unscanned.ts` on
 * 2026-08-02: that module `await import`s `@/lib/tenancy/db`, and a dynamic
 * import is still an edge in the client graph, so a client surface reaching for
 * the pure constant pulled `server-only` into the browser and failed the build.
 * `delivered-unscanned.ts` re-exports it; every existing import path works.
 */

/** Zoho statuses that mean "the vendor side considers this PO received". */
export const ZOHO_RECEIVED_LIKE_STATUSES = ['received', 'billed', 'closed'] as const;

/**
 * Zoho PO statuses that mean "no longer incoming" — received, closed out, or
 * cancelled — so the PO must not show on the Incoming surface even if a local
 * EXPECTED row lingers. A NULL/missing mirror status is treated as still-incoming.
 */
export const ZOHO_TERMINAL_STATUSES = ['billed', 'closed', 'cancelled', 'received', 'rejected'] as const;

type ZohoReceivedLikeStatus = (typeof ZOHO_RECEIVED_LIKE_STATUSES)[number];

const RECEIVED_LIKE = new Set<string>(ZOHO_RECEIVED_LIKE_STATUSES.map((s) => s.toLowerCase()));

/** True when a Zoho (or mirror) status means the vendor side considers the PO received. */
export function isZohoReceivedLikeStatus(
  status: string | null | undefined,
): status is ZohoReceivedLikeStatus {
  const s = String(status ?? '')
    .trim()
    .toLowerCase();
  return s.length > 0 && RECEIVED_LIKE.has(s);
}
