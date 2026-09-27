/**
 * PAN guard — a card number never enters the assistant pipeline.
 *
 * Card details are only ever entered on Square-hosted pages (payment link
 * checkout, invoice page). If staff paste or dictate a card number into the
 * chat anyway, the chat route runs the message through {@link scanCardNumbers}
 * BEFORE it is persisted, sent to a model or logged, and answers with
 * {@link CARD_NUMBER_REFUSAL} instead of calling a model at all.
 *
 * What counts as a card number: a run of 13–19 digits, optionally grouped by
 * spaces or dashes, that passes the Luhn check and starts with a card-network
 * prefix (2221–2720, 3, 4, 5, 6). A candidate starts and ends on a group
 * boundary of a longer digit run ("order 12 4111 1111 1111 1111" still finds
 * the card), but never inside an unbroken run — so a 22-digit tracking number
 * is not mistaken for a card.
 */

export const CARD_NUMBER_PLACEHOLDER = '[card number removed]';

/** The chat's whole reply when a message carried a card number. */
export const CARD_NUMBER_REFUSAL =
  "For security, card details can't go through chat. Use Take payment to open Square's secure checkout.";

const MIN_DIGITS = 13;
const MAX_DIGITS = 19;

/** Digit groups joined by single spaces / dashes. */
const DIGIT_RUN_RE = /\d+(?:[ -]\d+)*/g;

export function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let d = digits.charCodeAt(i) - 48;
    if (d < 0 || d > 9) return false;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

function hasCardPrefix(digits: string): boolean {
  const first = digits[0];
  if (first === '3' || first === '4' || first === '5' || first === '6') return true;
  if (first !== '2') return false;
  const four = Number(digits.slice(0, 4));
  return four >= 2221 && four <= 2720;
}

function isCardNumber(digits: string): boolean {
  return (
    digits.length >= MIN_DIGITS &&
    digits.length <= MAX_DIGITS &&
    hasCardPrefix(digits) &&
    luhnValid(digits)
  );
}

interface Group {
  start: number;
  end: number;
  digits: string;
}

/**
 * Card spans inside one run of digit groups. Longest window first from each
 * starting group; a found card consumes its groups.
 */
function cardSpans(run: string, offset: number): Array<[number, number]> {
  const groups: Group[] = [];
  for (const m of run.matchAll(/\d+/g)) {
    groups.push({ start: offset + (m.index ?? 0), end: offset + (m.index ?? 0) + m[0].length, digits: m[0] });
  }
  const spans: Array<[number, number]> = [];
  let i = 0;
  while (i < groups.length) {
    let matched = -1;
    let digits = '';
    const candidates: Array<{ j: number; digits: string }> = [];
    for (let j = i; j < groups.length; j += 1) {
      digits += groups[j].digits;
      if (digits.length > MAX_DIGITS) break;
      candidates.push({ j, digits });
    }
    for (let k = candidates.length - 1; k >= 0; k -= 1) {
      if (isCardNumber(candidates[k].digits)) {
        matched = candidates[k].j;
        break;
      }
    }
    if (matched >= 0) {
      spans.push([groups[i].start, groups[matched].end]);
      i = matched + 1;
    } else {
      i += 1;
    }
  }
  return spans;
}

/** Redact every card number; `redacted` is how many were removed. */
export function scanCardNumbers(text: string): { text: string; redacted: number } {
  if (typeof text !== 'string' || text.length === 0) return { text: text ?? '', redacted: 0 };
  const spans: Array<[number, number]> = [];
  for (const m of text.matchAll(DIGIT_RUN_RE)) {
    const digitCount = m[0].replace(/\D/g, '').length;
    if (digitCount < MIN_DIGITS) continue;
    spans.push(...cardSpans(m[0], m.index ?? 0));
  }
  if (spans.length === 0) return { text, redacted: 0 };
  let out = '';
  let cursor = 0;
  for (const [start, end] of spans) {
    out += text.slice(cursor, start) + CARD_NUMBER_PLACEHOLDER;
    cursor = end;
  }
  return { text: out + text.slice(cursor), redacted: spans.length };
}

/** `text` with every card number replaced by {@link CARD_NUMBER_PLACEHOLDER}. */
export function redactCardNumbers(text: string): string {
  return scanCardNumbers(text).text;
}
