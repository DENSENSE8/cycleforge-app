/**
 * "Does the vendor side consider this PO received?" — ONE answer, one module.
 *
 * Deliberately dependency-free (no `@/lib/db`, no tenancy, no React) so every
 * consumer can import it at its own altitude: the DB-backed reconciler, the
 * DB-free paste check, and the client rail row. That is the whole reason this
 * file exists — the constant previously lived in `zoho-received-reconcile.ts`,
 * which imports the Neon pool at module top level, so a client bundle could not
 * reach it (`.claude/rules/build-gotchas.md` → bundle altitude). Two call sites
 * therefore shipped hand-typed copies, each carrying a "keep in sync" comment:
 *
 *   - `check-zoho-received.ts`  → re-exports `ZOHO_RECEIVED_LIKE_STATUSES`
 *   - `rail/status.ts`          → a bare inline `new Set([...])`
 *
 * Three declarations of one mapping is the drift the source-of-truth rule bans;
 * the fix is the documented one (split the pure half into a leaf module the
 * heavy one re-exports), not a fourth comment asking humans to remember.
 *
 * **NOT the same list as `ZOHO_TERMINAL_STATUSES`** (`delivered-unscanned.ts`),
 * which additionally carries `cancelled` / `rejected`. That answers a different
 * question — "is this still incoming?" — and a cancelled PO is emphatically not
 * a received one. Do not collapse the two.
 */

/** Zoho statuses that mean "the vendor side considers this PO received". */
export const ZOHO_RECEIVED_LIKE_STATUSES = ['received', 'billed', 'closed'] as const;

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
