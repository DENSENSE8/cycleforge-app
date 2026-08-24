/**
 * Omni-command composer — the grammar half. DB-free, React-free.
 *
 * Trigger vocabulary (docs/omni-command-composer.md):
 *   `#` orders · `@` users (reserved) · `/` actions · bare identifier = orders
 * (the scanner path — a gun never types a sigil).
 *
 * Marketplace shapes ride the `src/utils/order-platform.ts` SoT — one orders
 * table; the shape drives the chip's platform label and boosts the lookup, it
 * never fans out to per-marketplace tables. This is also why the composer does
 * NOT use Lexical's `useBasicTypeaheadTriggerMatch`: its punctuation class
 * includes `-`, which would terminate every marketplace id at the first dash.
 */

import { getOrderPlatformLabel } from '@/utils/order-platform';

export type ComposerTriggerKind = 'order' | 'user' | 'action';
export type ComposerTrigger = '#' | '@' | '/' | '';

export interface ComposerTokenClass {
  readonly kind: ComposerTriggerKind;
  readonly trigger: ComposerTrigger;
  /** The token with the sigil stripped — what search and lookup receive. */
  readonly query: string;
  /** The token exactly as typed, sigil included — what gets replaced by a chip. */
  readonly raw: string;
}

/** One token: alnum plus dashes, dash-terminable (a still-open prefix). */
const TOKEN_BODY = /^[A-Za-z0-9][A-Za-z0-9-]*$/;

/**
 * A bare token only reaches the orders domain when it is identifier-shaped:
 * at least one digit or one dash. `hello` is prose; `QA-TEST-` and `9764`
 * are lookups. This is the whole no-prefix-required scanner path.
 */
export function isBareIdentifier(raw: string): boolean {
  if (!TOKEN_BODY.test(raw)) return false;
  return /[0-9]/.test(raw) || raw.includes('-');
}

/** A grammatically still-open token — a trailing dash means "not done typing". */
export function isIdentifierPrefix(token: string): boolean {
  return token.endsWith('-');
}

export function classifyComposerToken(raw: string): ComposerTokenClass | null {
  if (!raw) return null;
  const sigil = raw[0];
  if (sigil === '#' || sigil === '@' || sigil === '/') {
    const query = raw.slice(1);
    if (query && !TOKEN_BODY.test(query)) return null;
    const kind: ComposerTriggerKind = sigil === '#' ? 'order' : sigil === '@' ? 'user' : 'action';
    return { kind, trigger: sigil, query, raw };
  }
  if (!isBareIdentifier(raw)) return null;
  return { kind: 'order', trigger: '', query: raw, raw };
}

/* ── marketplace routing — one orders table, shape-boosted ───────────── */

export type MarketplaceRoute = 'ebay' | 'amazon';

/**
 * Complete marketplace shapes, answered by the order-platform SoT so the
 * composer and every badge in the app cannot drift on what an eBay id is.
 */
export function marketplaceRouteOf(token: string): MarketplaceRoute | null {
  const label = getOrderPlatformLabel(token, null);
  if (label === 'Amazon') return 'amazon';
  if (label === 'ebay') return 'ebay';
  return null;
}

/** Complete-by-grammar: a full eBay/Amazon id needs no resolver to be "done". */
export function isCompleteMarketplaceId(token: string): boolean {
  return marketplaceRouteOf(token) !== null;
}
