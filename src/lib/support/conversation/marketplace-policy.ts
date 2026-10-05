/**
 * Deterministic outbound policy for customer replies — pure and client-safe
 * (Copy & open applies it inside the click handler; the server applies it
 * again before any send or log).
 *
 *   every channel   card numbers are redacted (pan-guard).
 *   eBay / Amazon   no off-platform contact: links (seller-message-guard),
 *                   email addresses and phone numbers are removed, and the
 *                   body is held to the marketplace message limit.
 *
 * Same input → same output; `changes` names every rewrite so the composer can
 * tell the staffer what moved.
 */
import { scanCardNumbers } from '@/lib/assistant/pan-guard';
import { sanitizeSellerMessage } from '@/lib/ai/seller-message-guard';
import type { SupportChannel } from './model';

/**
 * Marketplace member-message ceilings (characters). eBay Message API
 * `sendMessage.messageText` caps at 2000; Amazon Buyer-Seller Messaging at
 * 4000. No other repo constant governs these.
 */
export const MARKETPLACE_MAX_LENGTH: Readonly<Partial<Record<SupportChannel, number>>> = {
  ebay: 2000,
  amazon: 4000,
};

export type MarketplacePolicyChange =
  | 'card_numbers_removed'
  | 'emails_removed'
  | 'links_removed'
  | 'phone_numbers_removed'
  | 'truncated';

export const EMAIL_PLACEHOLDER = '[email removed]';
export const PHONE_PLACEHOLDER = '[phone removed]';

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

/**
 * A phone number written the way people write one: optional +country code,
 * then 3-3-4 digits with at least one separator or parentheses. A bare digit
 * run is NOT a phone here — order numbers, item ids and tracking numbers are
 * bare digit runs and must survive.
 */
const PHONE_RE =
  /(?<![\w-])(?:\+?\d{1,2}[\s.-]?)?(?:\(\d{3}\)\s?|\d{3}[\s.-])\d{3}[\s.-]\d{4}(?![\w-])/g;

/** Channels whose replies travel inside a marketplace's member-messaging. */
export function isMarketplaceChannel(channel: SupportChannel): boolean {
  return channel === 'ebay' || channel === 'amazon';
}

function replaceAll(text: string, re: RegExp, placeholder: string): { text: string; hit: boolean } {
  re.lastIndex = 0;
  let hit = false;
  const out = text.replace(re, () => {
    hit = true;
    return placeholder;
  });
  return { text: out, hit };
}

export function applyMarketplacePolicy(
  channel: SupportChannel,
  body: string,
): { body: string; changes: MarketplacePolicyChange[] } {
  const changes: MarketplacePolicyChange[] = [];
  let text = String(body ?? '');

  const pan = scanCardNumbers(text);
  if (pan.redacted > 0) {
    text = pan.text;
    changes.push('card_numbers_removed');
  }

  if (!isMarketplaceChannel(channel)) return { body: text, changes };

  // Emails before links: the link guard would otherwise eat the domain and
  // leave "name@[link removed]".
  const emails = replaceAll(text, EMAIL_RE, EMAIL_PLACEHOLDER);
  if (emails.hit) {
    text = emails.text;
    changes.push('emails_removed');
  }

  const links = sanitizeSellerMessage(text);
  if (links.linksStripped) {
    text = links.message;
    changes.push('links_removed');
  }

  const phones = replaceAll(text, PHONE_RE, PHONE_PLACEHOLDER);
  if (phones.hit) {
    text = phones.text;
    changes.push('phone_numbers_removed');
  }

  if (changes.length > 0) {
    text = text
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/ {2,}/g, ' ')
      .trim();
  }

  const max = MARKETPLACE_MAX_LENGTH[channel];
  if (max != null && text.length > max) {
    text = `${text.slice(0, max - 1).trimEnd()}…`;
    changes.push('truncated');
  }
  return { body: text, changes };
}
