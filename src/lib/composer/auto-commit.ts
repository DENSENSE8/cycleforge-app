/**
 * Deterministic auto-commit policy.
 *
 * Unique *prefix* matches must NOT chip — that races the operator. Auto-commit
 * fires only when the token is a complete identifier AND the lookup returned
 * exactly one hit (scanner bursts included, once the wedge terminator lands).
 */

import type { PatternRoute } from './pattern-router';

export function shouldAutoCommit(route: PatternRoute, resultCount: number): boolean {
  if (resultCount !== 1) return false;
  if (route.source === 'actions') return route.complete && route.token.length > 0;
  if (route.source !== 'orders') return false;
  return route.complete;
}
