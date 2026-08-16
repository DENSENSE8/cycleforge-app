/**
 * Review · Missing item number — turn a pasted listing URL into a **checkable**
 * candidate, and resolve the href an operator opens to verify an item number
 * before approving it.
 *
 * This is Propose **step B** of
 * `docs/todo/review-listing-propose-approve-PLAN.md`: pure URL parsing, no
 * network, no Hermes, no catalog. Steps A (exact catalog title) and C
 * (marketplace search + rank) land later in
 * `propose-listing-for-exception.ts` and compose these functions rather than
 * re-parsing URLs.
 *
 * Client-safe by construction — every import here is a pure string module, so
 * the rail can call it on each keystroke with no round trip and no `server-only`
 * graph riding along (`build-gotchas.md` → bundle altitude).
 *
 * **Nothing here invents an id.** Every returned `itemNumber` came out of the
 * URL the operator pasted; a URL that carries no id is reported as a parse
 * failure, never guessed at (plan §2 — "Hermes may never invent an item #",
 * which applies just as hard to a regex).
 */

import {
  listingUrlItemId,
  listingUrlPlatform,
  normalizeListingHref,
} from '@/lib/receiving/listing-links';
import { sourcePlatformMetaFromLabel } from '@/lib/source-platform';
import {
  getExternalUrlByItemNumber,
  getExternalUrlByPlatform,
} from '@/utils/external-item-url';

interface ListingCandidate {
  /** The id an operator would Resolve with — extracted, never inferred. */
  itemNumber: string;
  /** Absolute href to open and eyeball against the order's product title. */
  listingUrl: string;
  /** Canonical `SOURCE_PLATFORMS` value, `''` when the host is unrecognised. */
  platform: string;
  /** Where the id came from. Only URL paste exists today; see the docblock. */
  source: 'url_parse';
}

type ListingUrlParseFailure =
  /** Not an http(s) URL at all — a typed id, a stray word, a partial paste. */
  | 'not_a_url'
  /** A real URL, but no listing id in it (a search page, a seller storefront). */
  | 'no_item_number';

type ListingUrlParse =
  | { ok: true; candidate: ListingCandidate }
  | { ok: false; reason: ListingUrlParseFailure };

/** Operator-facing copy for each failure — one home, so the rail cannot drift. */
export const LISTING_URL_PARSE_MESSAGE: Record<ListingUrlParseFailure, string> = {
  not_a_url: 'That is not a listing URL. Paste the full link, or type the item number below.',
  no_item_number:
    'No item number in that URL — it looks like a search or storefront page. Open the listing itself and paste its link.',
};

/**
 * Parse a pasted listing URL into a candidate the operator can check.
 *
 * Returns a failure rather than a partial candidate: an id-less URL still
 * *opens*, so returning one with an empty `itemNumber` would put a working
 * "Open listing" button next to a Resolve that cannot run — the operator would
 * verify a page and then find nothing to approve.
 */
export function parseListingUrl(raw: string | null | undefined): ListingUrlParse {
  const listingUrl = normalizeListingHref(raw);
  if (!listingUrl) return { ok: false, reason: 'not_a_url' };

  // Strict on purpose: `listingUrlIdentityKey` would hand back `ihtml` for an
  // eBay search page. See `listingUrlItemId`'s docblock.
  const itemNumber = listingUrlItemId(listingUrl);
  if (!itemNumber) return { ok: false, reason: 'no_item_number' };

  return {
    ok: true,
    candidate: {
      itemNumber,
      listingUrl,
      platform: listingUrlPlatform(listingUrl),
      source: 'url_parse',
    },
  };
}

/**
 * The href to open when CHECKING an item number before approving it.
 *
 * Precedence is deliberate (plan §6): a URL the operator actually pasted is the
 * listing itself, so it wins over anything rebuilt from an id — rebuilding
 * would drop the query string and, on a locale storefront, point at the wrong
 * site for the same id. Only when there is no such URL do we derive one from
 * the platform the order came from.
 *
 * Returns `null` honestly rather than a search URL that pretends to be the
 * listing — `getExternalUrlByPlatform` already refuses Zoho for the same
 * reason (inventory identity is not a storefront).
 */
export function listingCheckHref(args: {
  itemNumber: string | null | undefined;
  /** A URL already in hand — pasted by the operator, or stored on the record. */
  listingUrl?: string | null;
  /** The order's account source label (e.g. `eBay-RS`), used only as fallback. */
  accountSource?: string | null;
}): string | null {
  const pasted = normalizeListingHref(args.listingUrl);
  if (pasted) return pasted;

  const itemNumber = String(args.itemNumber ?? '').trim();
  if (!itemNumber) return null;

  const platform = sourcePlatformMetaFromLabel(args.accountSource).value;
  if (platform) return getExternalUrlByPlatform(platform, itemNumber);

  return getExternalUrlByItemNumber(itemNumber);
}
