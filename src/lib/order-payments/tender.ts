/**
 * In-person tender facts — what CycleForge records when a customer pays at
 * the counter (or when Square reports how an invoice was paid). Pure and
 * client-safe: the intake form and the server share one vocabulary and one
 * PAN guard.
 *
 * PCI boundary: CycleForge never accepts, stores, logs or transmits a full
 * card number (PAN), CVV/CVC, expiry, track data or PIN. A card payment is
 * recorded as its FACTS only — brand, last 4, how the card was presented to
 * the reader, the reader's authorization code. Every free-text payment field
 * is refused when it carries a PAN-shaped digit run.
 */

export const TENDER_TYPES = ['card', 'cash', 'other'] as const;
export type TenderType = (typeof TENDER_TYPES)[number];

export const TENDER_LABEL: Record<TenderType, string> = {
  card: 'Card on the reader',
  cash: 'Cash',
  other: 'Other (check, Zelle…)',
};

/** Brands an operator picks at the counter; Square read-back may name the rarer ones. */
export const CARD_BRANDS = [
  'visa',
  'mastercard',
  'amex',
  'discover',
  'diners',
  'jcb',
  'unionpay',
  'interac',
  'gift_card',
  'other',
] as const;
export type CardBrand = (typeof CARD_BRANDS)[number];

/** The subset offered in the counter form, most common first. */
export const COUNTER_CARD_BRANDS: ReadonlyArray<CardBrand> = ['visa', 'mastercard', 'amex', 'discover', 'other'];

export const CARD_BRAND_LABEL: Record<CardBrand, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'Amex',
  discover: 'Discover',
  diners: 'Diners Club',
  jcb: 'JCB',
  unionpay: 'UnionPay',
  interac: 'Interac',
  gift_card: 'Gift card',
  other: 'Other card',
};

/** How the card met the reader. `on_file` only ever comes from Square read-back. */
export const CARD_ENTRY_METHODS = ['tap', 'chip', 'swipe', 'keyed', 'on_file'] as const;
export type CardEntryMethod = (typeof CARD_ENTRY_METHODS)[number];

export const COUNTER_ENTRY_METHODS: ReadonlyArray<CardEntryMethod> = ['tap', 'chip', 'swipe', 'keyed'];

export const CARD_ENTRY_LABEL: Record<CardEntryMethod, string> = {
  tap: 'Tap',
  chip: 'Chip',
  swipe: 'Swipe',
  keyed: 'Keyed on reader',
  on_file: 'Card on file',
};

/** Longest reference / authorization code we keep. */
export const PAYMENT_REFERENCE_MAX = 80;

const LAST4_RE = /^\d{4}$/;

export function isCardLast4(value: string): boolean {
  return LAST4_RE.test(value);
}

/**
 * Does this text carry something shaped like a card number? A run of 13 or
 * more digits once the separators people type inside a PAN (spaces, dashes,
 * dots) are removed. Deliberately stricter than "13–19 digits with a valid
 * Luhn": a reference code has no business holding a digit run that long.
 */
export function looksLikePan(value: string): boolean {
  let run = 0;
  for (const ch of value) {
    if (ch >= '0' && ch <= '9') {
      run += 1;
      if (run >= 13) return true;
    } else if (ch !== ' ' && ch !== '-' && ch !== '.' && ch !== '\u00a0') {
      run = 0;
    }
  }
  return false;
}

export const PAN_REFUSAL =
  'That looks like a card number. Never type a card number here — record only the brand, the last 4 digits and the reader’s authorization code.';

export interface InPersonTenderInput {
  tender: TenderType;
  cardBrand?: string | null;
  cardLast4?: string | null;
  entryMethod?: string | null;
  reference?: string | null;
}

export interface InPersonTender {
  tender: TenderType;
  cardBrand: CardBrand | null;
  cardLast4: string | null;
  entryMethod: CardEntryMethod | null;
  reference: string | null;
}

const isOneOf = <T extends string>(list: ReadonlyArray<T>, v: unknown): v is T =>
  typeof v === 'string' && (list as ReadonlyArray<string>).includes(v);

/**
 * Normalize + validate the counter's tender facts. Card: brand, exactly four
 * digits and an entry method are required; cash carries no card facts; other
 * needs a reference (check number, Zelle confirmation…). Any PAN-shaped value
 * — in any field — is refused without echoing it.
 */
export function parseInPersonTender(input: InPersonTenderInput): { ok: true; tender: InPersonTender } | { ok: false; error: string } {
  for (const v of [input.cardBrand, input.cardLast4, input.entryMethod, input.reference]) {
    if (typeof v === 'string' && looksLikePan(v)) return { ok: false, error: PAN_REFUSAL };
  }
  if (!isOneOf(TENDER_TYPES, input.tender)) return { ok: false, error: 'Pick how the customer paid: card, cash or other.' };
  const reference = typeof input.reference === 'string' ? input.reference.trim().replace(/\s+/g, ' ') : '';
  if (reference.length > PAYMENT_REFERENCE_MAX) {
    return { ok: false, error: `Keep the reference under ${PAYMENT_REFERENCE_MAX} characters.` };
  }

  if (input.tender === 'card') {
    if (!isOneOf(CARD_BRANDS, input.cardBrand)) return { ok: false, error: 'Pick the card brand.' };
    const last4 = typeof input.cardLast4 === 'string' ? input.cardLast4.trim() : '';
    if (!isCardLast4(last4)) return { ok: false, error: 'Type the last 4 digits of the card — exactly 4 digits, nothing more.' };
    if (!isOneOf(COUNTER_ENTRY_METHODS, input.entryMethod)) return { ok: false, error: 'Pick how the card was presented: tap, chip, swipe or keyed on the reader.' };
    return { ok: true, tender: { tender: 'card', cardBrand: input.cardBrand, cardLast4: last4, entryMethod: input.entryMethod, reference: reference || null } };
  }
  if (input.tender === 'other' && !reference) {
    return { ok: false, error: 'Say what it was — a check number or the Zelle confirmation.' };
  }
  return { ok: true, tender: { tender: input.tender, cardBrand: null, cardLast4: null, entryMethod: null, reference: reference || null } };
}

/** "Visa ···· 4242 · Tap" — the one-line summary every surface prints. */
export function tenderSummary(facts: {
  tender: TenderType | null;
  cardBrand: string | null;
  cardLast4: string | null;
  entryMethod: string | null;
}): string {
  if (facts.tender === 'cash') return 'Cash';
  if (facts.tender === 'other') return 'Other tender';
  const brand = isOneOf(CARD_BRANDS, facts.cardBrand) ? CARD_BRAND_LABEL[facts.cardBrand] : 'Card';
  const parts = [facts.cardLast4 ? `${brand} ···· ${facts.cardLast4}` : brand];
  if (isOneOf(CARD_ENTRY_METHODS, facts.entryMethod)) parts.push(CARD_ENTRY_LABEL[facts.entryMethod]);
  return parts.join(' · ');
}
