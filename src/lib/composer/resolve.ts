/**
 * Deterministic auto-commit — the rule that makes a chip trustworthy.
 *
 * A chip may appear only when the token is a COMPLETE identifier that names
 * EXACTLY ONE row. Completeness is decided by the exact resolver
 * (`/api/orders/lookup/:token`, where `order_id` is unique per org), so
 * "complete and unique" and "exact lookup hit" are one statement. A still-open
 * prefix (`04-`, `QA-TEST-`) can never chip: grammar short-circuits a trailing
 * dash, and a prefix never exact-resolves — even when it happens to match a
 * single row in search.
 *
 * DB-free: the resolver is injected, so the unit suite runs without a network.
 */

import { classifyComposerToken, isIdentifierPrefix } from '@/lib/composer/grammar';

/** The one field auto-commit needs from a search hit to test exactness. */
export interface ComposerIdentifierHit {
  readonly orderId: string;
}

/**
 * Pure half: given the token and the identifiers search returned, may a chip
 * commit without the operator touching the typeahead? True only when exactly
 * one hit's identifier IS the token (case-insensitive). A unique PREFIX —
 * one row, but the token only starts it — stays false.
 */
export function shouldAutoCommit(token: string, hits: readonly ComposerIdentifierHit[]): boolean {
  const cls = classifyComposerToken(token.trim());
  if (!cls || cls.kind !== 'order' || !cls.query) return false;
  if (isIdentifierPrefix(cls.query)) return false;
  const wanted = cls.query.toUpperCase();
  let exact = 0;
  for (const hit of hits) {
    if (hit.orderId.trim().toUpperCase() === wanted) exact += 1;
  }
  return exact === 1;
}

export type ComposerResolveOutcome<TOrder> =
  | { readonly kind: 'hit'; readonly order: TOrder }
  | { readonly kind: 'miss' };

export type ComposerResolveFn<TOrder> = (token: string) => Promise<ComposerResolveOutcome<TOrder>>;

/**
 * Async half: run the injected exact resolver for an order-kind token and
 * return the row a chip would hold, or null. Prefixes and non-order tokens
 * short-circuit — the resolver is never called for them.
 */
export async function resolveAutoCommitHit<TOrder>(
  token: string,
  resolve: ComposerResolveFn<TOrder>,
): Promise<TOrder | null> {
  const cls = classifyComposerToken(token.trim());
  if (!cls || cls.kind !== 'order' || !cls.query) return null;
  if (isIdentifierPrefix(cls.query)) return null;
  const outcome = await resolve(cls.query);
  return outcome.kind === 'hit' ? outcome.order : null;
}
