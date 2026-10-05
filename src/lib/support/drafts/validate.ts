/**
 * Deterministic checks on a generated Support draft — pure, zero network.
 *
 * The model writes; these decide what the staffer is warned about before the
 * draft is used. Nothing here rewrites the substance of a reply: it strips a
 * signature / placeholder line the prompt already forbade, and otherwise
 * reports. Warnings and missing facts are stored on the draft and lower its
 * confidence.
 *
 *   dates        every weekday+date pair ("Monday, October 6", "Mon 10/6",
 *                "October 6 (Monday)") is checked against the calendar; a
 *                relative day ("tomorrow, Tuesday") against today; a past date
 *                offered as upcoming is flagged.
 *   placeholders [name], {{order}}, <tracking>, TBD; signatures and sign-offs.
 *   claims       refund issued / shipped / delivered / replaced / repaired /
 *                warranty approved — only when a source proves it.
 *   identifiers  an order or tracking number no record contains.
 *   order number a question that needs an order with none linked; a draft
 *                asking for an order number the record already has.
 *   product      a draft asking for the model / SKU / part number when a
 *                linked order line already names the product.
 *   specifics    sizes, prices, model numbers, dates and time frames (digits
 *                or words: "a day", "a few days", "by tomorrow") no source states.
 *   schedules    "scheduled to ship", "will ship soon / tomorrow" with no
 *                staff note or record speaking to shipping.
 */
import type { SupportDraftConfidence, SupportDraftKind } from '@/lib/support/conversation/model';
import {
  newestInboundMessage,
  orderFacts,
  type SupportClaimKind,
  type SupportDraftContext,
} from './context';

// ── Calendar ───────────────────────────────────────────────────────────────

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

const WEEKDAY_RE_SRC = '(Mon|Tue|Tues|Wed|Thu|Thur|Thurs|Fri|Sat|Sun)(?:day|nesday|sday|urday)?\\.?';
const MONTH_RE_SRC =
  '(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)(?:uary|ruary|ch|il|e|y|ust|tember|ember|ober)?\\.?';

function weekdayIndex(token: string): number {
  return WEEKDAYS.findIndex((d) => d.toLowerCase().startsWith(token.slice(0, 3).toLowerCase()));
}

function monthIndex(token: string): number {
  return MONTHS.findIndex((m) => m.toLowerCase().startsWith(token.slice(0, 3).toLowerCase()));
}

interface CivilDay {
  y: number;
  m: number;
  d: number;
}

function parseYmd(ymd: string): CivilDay {
  const [y, m, d] = ymd.split('-').map(Number);
  return { y, m: m - 1, d };
}

/** UTC epoch day — civil-day arithmetic with no zone drift. */
function epochDay(day: CivilDay): number {
  return Math.floor(Date.UTC(day.y, day.m, day.d) / 86_400_000);
}

function isRealDate(day: CivilDay): boolean {
  const dt = new Date(Date.UTC(day.y, day.m, day.d));
  return dt.getUTCFullYear() === day.y && dt.getUTCMonth() === day.m && dt.getUTCDate() === day.d;
}

function formatDay(day: CivilDay): string {
  return `${WEEKDAYS[new Date(Date.UTC(day.y, day.m, day.d)).getUTCDay()]}, ${MONTHS[day.m]} ${day.d}, ${day.y}`;
}

/** A yearless date means the occurrence nearest today. */
function resolveYear(month: number, dayOfMonth: number, explicitYear: number | null, today: CivilDay): CivilDay {
  if (explicitYear != null) return { y: explicitYear, m: month, d: dayOfMonth };
  const base = epochDay(today);
  let best: CivilDay = { y: today.y, m: month, d: dayOfMonth };
  for (const y of [today.y - 1, today.y, today.y + 1]) {
    const candidate = { y, m: month, d: dayOfMonth };
    if (Math.abs(epochDay(candidate) - base) < Math.abs(epochDay(best) - base)) best = candidate;
  }
  return best;
}

const PAIR_PATTERNS: Array<{ re: RegExp; read: (m: RegExpExecArray) => { weekday: string; month: number; day: number; year: number | null } }> = [
  {
    // Monday, October 6 · Mon Oct 6th, 2026 · Monday the 6th of October is rare enough to skip
    re: new RegExp(`\\b${WEEKDAY_RE_SRC},?\\s+(?:the\\s+)?${MONTH_RE_SRC}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, 'g'),
    read: (m) => ({ weekday: m[1], month: monthIndex(m[2]), day: Number(m[3]), year: m[4] ? Number(m[4]) : null }),
  },
  {
    // Monday, 10/6 · Monday (10/6/2026)
    re: new RegExp(`\\b${WEEKDAY_RE_SRC},?\\s+\\(?(\\d{1,2})/(\\d{1,2})(?:/(\\d{2,4}))?\\)?`, 'g'),
    read: (m) => ({
      weekday: m[1],
      month: Number(m[2]) - 1,
      day: Number(m[3]),
      year: m[4] ? (m[4].length === 2 ? 2000 + Number(m[4]) : Number(m[4])) : null,
    }),
  },
  {
    // October 6 (Monday) · Oct 6th, 2026 (Mon)
    re: new RegExp(`\\b${MONTH_RE_SRC}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\s*\\(${WEEKDAY_RE_SRC}\\)`, 'g'),
    read: (m) => ({ weekday: m[4], month: monthIndex(m[1]), day: Number(m[2]), year: m[3] ? Number(m[3]) : null }),
  },
];

const RELATIVE_RE = new RegExp(`\\b(today|tomorrow|yesterday)\\b[\\s,(]*(?:on\\s+|which is\\s+)?${WEEKDAY_RE_SRC}`, 'gi');
const RELATIVE_OFFSET: Readonly<Record<string, number>> = { today: 0, tomorrow: 1, yesterday: -1 };
/** Words that present a date as still ahead. */
const UPCOMING_CUE = /\b(?:will|expect(?:ed)?|scheduled|by|arriv\w*|ships?|deliver\w*|until|next)\b/i;

/** Warnings for every weekday/date pair the calendar contradicts. */
export function checkWeekdayDates(body: string, todayYmd: string): string[] {
  const today = parseYmd(todayYmd);
  const warnings: string[] = [];
  for (const { re, read } of PAIR_PATTERNS) {
    re.lastIndex = 0;
    for (let m = re.exec(body); m; m = re.exec(body)) {
      const parsed = read(m);
      const wd = weekdayIndex(parsed.weekday);
      if (wd < 0 || parsed.month < 0 || parsed.month > 11) continue;
      const day = resolveYear(parsed.month, parsed.day, parsed.year, today);
      if (!isRealDate(day)) {
        warnings.push(`"${m[0].trim()}" is not a real calendar date.`);
        continue;
      }
      const actual = new Date(Date.UTC(day.y, day.m, day.d)).getUTCDay();
      if (actual !== wd) {
        warnings.push(`"${m[0].trim()}" — ${MONTHS[day.m]} ${day.d}, ${day.y} is a ${WEEKDAYS[actual]}, not a ${WEEKDAYS[wd]}.`);
        continue;
      }
      const lead = body.slice(Math.max(0, m.index - 40), m.index);
      if (epochDay(day) < epochDay(today) && UPCOMING_CUE.test(lead)) {
        warnings.push(`"${m[0].trim()}" is in the past (today is ${formatDay(today)}) but reads as upcoming.`);
      }
    }
  }
  RELATIVE_RE.lastIndex = 0;
  for (let m = RELATIVE_RE.exec(body); m; m = RELATIVE_RE.exec(body)) {
    const word = m[1].toLowerCase();
    const wd = weekdayIndex(m[2]);
    const expected = new Date(Date.UTC(today.y, today.m, today.d + RELATIVE_OFFSET[word])).getUTCDay();
    if (wd >= 0 && wd !== expected) {
      warnings.push(`"${m[0].trim()}" — ${word} is ${WEEKDAYS[expected]} (today is ${formatDay(today)}).`);
    }
  }
  return warnings;
}

// ── Placeholders and signatures ────────────────────────────────────────────

const PLACEHOLDER_RE =
  /\[(?![a-z]+ removed\])[^\]\n]{1,40}\]|\{\{[^}\n]{1,40}\}\}|<(?:name|customer[^>]*|order[^>]*|tracking[^>]*|date|your[^>]*|agent[^>]*|company[^>]*)>|\bTBD\b|\bX{3,}\b/gi;
/** A sign-off line: the closing word(s) alone on a line. */
const CLOSING_LINE_RE =
  /^(?:(?:best|kind|warm|warmest|with)\s+regards|regards|best wishes|best|sincerely(?: yours)?|yours (?:truly|sincerely)|respectfully|cheers|thanks|thank you|many thanks|all the best|take care)[,.!]?$/i;
/** Lines that are only a signature: a team name, a role, the business. */
const SIGNATURE_ONLY_RE = /^(?:[-–—]+\s*)?(?:the\s+)?[\w&.' ]{0,40}(?:team|support|customer service|customer care|department)$/i;

export interface StrippedDraft {
  body: string;
  /** What was removed, for the staffer. */
  removed: string[];
  /** Placeholders left INSIDE sentences (not removable without guessing). */
  placeholders: string[];
}

/**
 * Remove a trailing sign-off block and placeholder-only lines; fill a greeting
 * placeholder from the requester's name when the record has one.
 */
export function stripSignatureAndPlaceholders(body: string, requesterName: string | null): StrippedDraft {
  const removed: string[] = [];
  let lines = body.replace(/\r\n/g, '\n').split('\n');

  // Sign-off: a closing line in the last five non-empty lines, followed by at
  // most three short lines (a name, a team) — drop it and everything after.
  for (let i = Math.max(0, lines.length - 6); i < lines.length; i += 1) {
    const line = lines[i].trim();
    const tail = lines.slice(i + 1).filter((l) => l.trim());
    const closing = CLOSING_LINE_RE.test(line) && (line.endsWith(',') || /regards|sincerely|respectfully/i.test(line) || tail.length > 0);
    if (closing && tail.length <= 3 && tail.every((l) => l.trim().length <= 48)) {
      removed.push(`sign-off "${[line, ...tail.map((l) => l.trim())].join(' / ')}"`);
      lines = lines.slice(0, i);
      break;
    }
  }

  // A trailing team-only signature with no closing word ("— The Support Team").
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  if (lines.length > 1 && SIGNATURE_ONLY_RE.test(lines[lines.length - 1].trim())) {
    removed.push(`signature "${lines[lines.length - 1].trim()}"`);
    lines.pop();
  }

  const firstName = requesterName?.trim().split(/\s+/)[0] ?? '';
  const kept: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    // A greeting whose only gap is the name.
    const greeting = /^(hi|hello|hey|dear|good (?:morning|afternoon|evening))\s+(\[[^\]]+\]|\{\{[^}]+\}\}|<[^>]+>)\s*([,!.]?)$/i.exec(line);
    if (greeting) {
      const filled = firstName ? `${greeting[1]} ${firstName}${greeting[3] || ','}` : `${greeting[1]}${greeting[3] || ','}`;
      removed.push(`greeting placeholder "${greeting[2]}"`);
      kept.push(filled);
      continue;
    }
    PLACEHOLDER_RE.lastIndex = 0;
    const onlyPlaceholders = line.length > 0 && line.replace(PLACEHOLDER_RE, '').replace(/[\s,.:;-]/g, '') === '';
    if (onlyPlaceholders) {
      removed.push(`placeholder line "${line}"`);
      continue;
    }
    kept.push(raw);
  }

  const text = kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  PLACEHOLDER_RE.lastIndex = 0;
  const placeholders = [...new Set(text.match(PLACEHOLDER_RE) ?? [])];
  return { body: text, removed, placeholders };
}

// ── Completed-action claims ────────────────────────────────────────────────

const CLAIM_PATTERNS: Readonly<Record<SupportClaimKind, RegExp>> = {
  refund:
    /\brefund\b[^.!?\n]{0,40}?\b(?:has been|have been|was|were|is now|is|already)\s+(?:been\s+)?(?:issued|processed|sent|completed|approved)\b|\b(?:we|i)(?:'ve| have)?\s+(?:already\s+)?(?:issued|processed|sent)\s+(?:you\s+)?(?:a|the|your)?\s*(?:full\s+|partial\s+)?refund\b|\b(?:has|have) been refunded\b|\byou(?:'ve| have) been refunded\b/i,
  shipped:
    /\b(?:has|have)\s+(?:already\s+)?(?:been\s+)?shipped\b|\b(?:was|were)\s+shipped\b|\b(?:has|have) been sent out\b|\bis (?:now )?on (?:its|the) way\b|\bis (?:now )?in transit\b|\bwe(?:'ve| have)\s+(?:already\s+)?(?:shipped|mailed|sent (?:it|your|the) )/i,
  delivered: /\b(?:has|have) been delivered\b|\b(?:was|were) delivered\b|\bshows? (?:as )?delivered\b/i,
  replaced:
    /\breplacement\b[^.!?\n]{0,40}?\b(?:has been|was|is)\s+(?:sent|shipped|issued|on its way)\b|\b(?:we|i)(?:'ve| have)\s+(?:already\s+)?(?:sent|shipped|issued)\s+(?:you\s+)?a\s+replacement\b/i,
  repaired:
    /\b(?:has|have) been (?:repaired|fixed)\b|\b(?:was|were) (?:repaired|fixed)\b|\bwe(?:'ve| have) (?:repaired|fixed)\b|\brepair (?:is|has been|was) (?:complete|completed|finished|done)\b/i,
  warranty_approved: /\b(?:warranty|claim)\b[^.!?\n]{0,30}?\b(?:has been|was|is)\s+(?:approved|accepted)\b/i,
};

const CLAIM_LABEL: Readonly<Record<SupportClaimKind, string>> = {
  refund: 'a refund was issued',
  shipped: 'the item shipped',
  delivered: 'the item was delivered',
  replaced: 'a replacement was sent',
  repaired: 'the item was repaired',
  warranty_approved: 'a warranty claim was approved',
};

/** A completed-action phrase introduced by a condition is a plan, not a claim. */
const CONDITIONAL_LEAD = /\b(?:once|when|after|as soon as|if|until|whether|before)\b[^.!?\n]*$/i;

/** Completed-action claims stated in `text`, conditionals excluded. */
export function findClaims(text: string): SupportClaimKind[] {
  const out: SupportClaimKind[] = [];
  for (const kind of Object.keys(CLAIM_PATTERNS) as SupportClaimKind[]) {
    const re = new RegExp(CLAIM_PATTERNS[kind].source, 'gi');
    for (let m = re.exec(text); m; m = re.exec(text)) {
      const lead = text.slice(Math.max(0, m.index - 60), m.index);
      if (CONDITIONAL_LEAD.test(lead)) continue;
      out.push(kind);
      break;
    }
  }
  return out;
}

/**
 * Which completed actions the LOCAL record proves, and by what. A record fact
 * (`proves`) or a line OUR staff wrote (outbound / internal) counts; a
 * customer's own words never prove an action of ours.
 */
export function claimProofs(context: SupportDraftContext): Partial<Record<SupportClaimKind, string>> {
  const proofs: Partial<Record<SupportClaimKind, string>> = {};
  for (const fact of [...orderFacts(context.orders), ...context.facts]) {
    for (const kind of fact.proves ?? []) proofs[kind] ??= fact.citation.label;
  }
  for (const m of context.messages) {
    if (m.direction === 'inbound') continue;
    for (const kind of findClaims(m.body)) proofs[kind] ??= m.direction === 'internal' ? 'Internal note' : 'Earlier reply';
  }
  return proofs;
}

// ── Identifiers and order numbers ──────────────────────────────────────────

/** eBay 12-34567-89012 · Amazon 123-1234567-1234567 · UPS 1Z… · long carrier digit runs. */
const IDENTIFIER_RE = /\b\d{2}-\d{5}-\d{5}\b|\b\d{3}-\d{7}-\d{7}\b|\b1Z[0-9A-Z]{16}\b|\b\d{12,22}\b/g;
const ORDER_TOPIC_RE = /\b(?:order|tracking|track|ship(?:ped|ping)?|deliver(?:y|ed)?|package|parcel|arriv\w*|refund|return|exchange|where is|status|purchase[d]?|bought)\b/i;
const ASKS_FOR_ORDER_RE = /\b(?:send|provide|share|confirm|give|reply with|let us know|tell us)\b[^.?!\n]{0,40}\border\s*(?:number|#|id)\b/i;
/** A sentence that asks the customer for something. */
const ASK_CUE_RE = /\b(?:please|could you|can you|would you|let us know|reply with|tell us|send us|share)\b|\?\s*$/i;
/** Product identity a linked order line already carries (title / SKU) — not a serial, photo or measurement. */
const PRODUCT_DETAIL_RE =
  /\b(?:model(?:\s*(?:number|#|no\b\.?|name))?|sku|part\s*(?:number|#|no\b\.?)|product\s*(?:name|number|title)|item\s*(?:number|name|title))\b/i;

/** The first sentence asking the customer for a product's model / SKU / part number, or null. */
export function findProductDetailAsk(body: string): string | null {
  return sentencesOf(body).find((s) => ASK_CUE_RE.test(s) && PRODUCT_DETAIL_RE.test(s)) ?? null;
}

function compact(s: string): string {
  return s.replace(/[\s-]/g, '').toUpperCase();
}

/**
 * Every text the local record (and the retrieval the caller ran) contains:
 * the thread in all directions (a customer's own detail is a source), record
 * facts, order lines, fulfillment, photo text, today, and `extra` (RAG answer
 * and chunks, retrieved records).
 */
function sourceTexts(context: SupportDraftContext, extra: readonly string[]): string[] {
  const parts: string[] = [context.today, context.item.subject ?? ''];
  for (const m of context.messages) parts.push(m.body, m.occurredAt);
  for (const f of context.facts) parts.push(f.text, f.citation.label);
  for (const o of context.orders) {
    parts.push(o.orderNumber ?? '', o.externalReference ?? '', o.fulfillment?.trackingNumber ?? '', o.fulfillment?.at ?? '');
    for (const p of o.products) parts.push(p.title, p.sku ?? '', `${p.quantity}`);
  }
  for (const p of context.photos) parts.push(...p.ocrText, ...p.decoded.map((t) => t.value), p.caption ?? '');
  parts.push(...extra);
  return parts.filter(Boolean);
}

// ── Unsupported specifics ──────────────────────────────────────────────────

const UNIT_SRC =
  '(?:"|\u201d|\u2033|in\\.|inch(?:es)?\\b|mm\\b|cm\\b|ft\\b|feet\\b|foot\\b|lbs?\\b|pounds?\\b|oz\\b|ounces?\\b|kg\\b|grams?\\b|watts?\\b|w\\b|volts?\\b|v\\b|ohms?\\b|\u03a9|k?hz\\b|mhz\\b|amps?\\b|mah\\b|ma\\b|%)';
const NUM_SRC = '\\d+(?:[.,]\\d+)?(?:\\s+\\d+)?(?:\\/\\d+)?';
const MONTH_DATE_SRC = `\\b${MONTH_RE_SRC}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`;
const NUMERIC_DATE_SRC = '\\b(1[0-2]|0?[1-9])\\/(3[01]|[12]\\d|0?[1-9])(?:\\/\\d{2,4})?\\b';

/** Specific values a draft may state only when a source states them — most specific shape first. */
const SPECIFIC_PATTERNS: ReadonlyArray<{ kind: 'spec' | 'date' | 'words'; re: RegExp }> = [
  // 6 x 1/4" · 4x M3 · 2 × 10mm
  { kind: 'spec', re: new RegExp(`\\b\\d+\\s*[x\u00d7]\\s*(?:M\\d+(?:\\s*[x\u00d7]\\s*\\d+(?:\\.\\d+)?\\s*(?:mm)?)?|#?${NUM_SRC}\\s*${UNIT_SRC}?)`, 'gi') },
  // M4 · M3x10 · #6-32 · 8-32 screws
  { kind: 'spec', re: /\bM\d{1,2}(?:\s*[x\u00d7]\s*\d+(?:\.\d+)?\s*(?:mm)?)?\b|#\d{1,2}(?:-\d{1,2})?\b|\b\d{1,2}-\d{2}(?=\s*(?:screws?|bolts?|thread))/g },
  // 1/4" · 1 1/2 inch · 12 V · 40 W · 8 ohm · 30%
  { kind: 'spec', re: new RegExp(`(?<![\\w/.])${NUM_SRC}\\s*${UNIT_SRC}`, 'gi') },
  // prices
  { kind: 'spec', re: /[$\u20ac\u00a3]\s?\d+(?:,\d{3})*(?:\.\d{2})?|\b\d+(?:,\d{3})*(?:\.\d{2})?\s*(?:dollars|usd)\b/gi },
  // time frames and part counts: 3-5 business days · within 30 days · 6 screws (not the "20" in "UB-20 bracket")
  {
    kind: 'spec',
    re: /(?<![\w-])\d+(?:\s*(?:-|\u2013|to)\s*\d+)?\s+(?:business\s+|working\s+|calendar\s+)?(?:days?|weeks?|hours?|months?|years?)\b|(?<![\w-])\d+\s+(?:screws?|bolts?|nuts?|washers?|pieces?|pcs|parts?|units?|cables?|batteries|fuses?|knobs?|brackets?|feet)\b/gi,
  },
  { kind: 'date', re: new RegExp(MONTH_DATE_SRC, 'gi') },
  { kind: 'date', re: new RegExp(NUMERIC_DATE_SRC, 'g') },
  // model / part numbers: letters and digits together (AMP-200, SRS-XB33, KDC-X304)
  { kind: 'spec', re: /\b(?=[A-Z0-9-]*[A-Z])(?=[A-Z0-9-]*\d)[A-Z0-9]{2,}(?:-[A-Z0-9]+)*\b|\b(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*\d)[A-Z0-9]+-[A-Z0-9-]+\b/g },
  // time frames in words: a day · a few days · a couple of weeks · by tomorrow · by Friday · end of the week
  // ("twice a day" is a rate, not a time frame)
  {
    kind: 'words',
    re: /(?<!\b(?:per|once|twice|times|every)\s+)\b(?:a|an|one|two|three|four|five|six|seven|ten|a few|a couple(?:\s+of)?|several)\s+(?:more\s+)?(?:business\s+|working\s+)?(?:days?|weeks?|hours?|months?)\b|\bby\s+(?:tomorrow|tonight|today|(?:this|next)\s+week|(?:mon|tues|wednes|thurs|fri|satur|sun)day)\b|\b(?:the\s+)?end\s+of\s+(?:the\s+)?(?:business\s+)?(?:day|week|month)\b/gi,
  },
];

/** Lower-case, single-spaced, for whole-word phrase lookups. */
function wordCanon(s: string): string {
  return ` ${s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
}

/** Compare specifics the way people write them: case, spacing, inch marks and "x" separators do not matter. */
function specCanon(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u201c\u201d\u2033]/g, '"')
    .replace(/(\d)\s*(?:inches|inch|in\.)/g, '$1"')
    .replace(/(\d|")\s*[x\u00d7]\s*(?=[\d#m])/g, '$1x')
    .replace(/(\d),(?=\d{3}\b)/g, '$1')
    .replace(/\s+/g, '');
}

/** Month/day pairs a text names: "October 5", "10/5", "2026-10-05". */
function monthDays(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(new RegExp(MONTH_DATE_SRC, 'gi'))) out.push(`${monthIndex(m[1]) + 1}/${Number(m[2])}`);
  for (const m of text.matchAll(new RegExp(NUMERIC_DATE_SRC, 'g'))) out.push(`${Number(m[1])}/${Number(m[2])}`);
  for (const m of text.matchAll(/\b\d{4}-(\d{2})-(\d{2})/g)) out.push(`${Number(m[1])}/${Number(m[2])}`);
  return out;
}

/** Spans that are not specifics: links, emails, policy markers, identifiers (checked separately). */
const MASK_RE = /https?:\/\/\S+|[\w.+-]+@[\w-]+\.[\w.]+|\[[a-z]+ removed\]/gi;

/** Every specific value in `body` that no source contains, in order of appearance. */
export function findUnsupportedSpecifics(body: string, sources: readonly string[]): string[] {
  const known = specCanon(sources.join(' | '));
  const knownWords = wordCanon(sources.join(' | '));
  const knownDates = new Set(sources.flatMap(monthDays));
  let text = body.replace(MASK_RE, (s) => ' '.repeat(s.length)).replace(IDENTIFIER_RE, (s) => ' '.repeat(s.length));
  const found: Array<{ at: number; token: string }> = [];
  for (const { kind, re } of SPECIFIC_PATTERNS) {
    re.lastIndex = 0;
    text = text.replace(re, (token: string, ...rest: unknown[]) => {
      const at = rest.find((v): v is number => typeof v === 'number') ?? 0;
      const clean = token.trim();
      const supported =
        kind === 'date'
          ? monthDays(clean).every((d) => knownDates.has(d))
          : kind === 'words'
            ? knownWords.includes(wordCanon(clean.replace(/^(?:by|the)\s+/i, '')))
            : known.includes(specCanon(clean));
      if (!supported) found.push({ at, token: clean });
      return ' '.repeat(token.length);
    });
  }
  return [...new Set(found.sort((a, b) => a.at - b.at).map((f) => f.token))];
}

// ── Tone: apology opener, needless closers, contact-us ─────────────────────

const GREETING_LINE_RE = /^(?:hi|hello|hey|dear|good (?:morning|afternoon|evening))\b[^.!?\n]{0,40}[,!.]?$/i;
const APOLOGY_START_RE =
  /^(?:(?:we|i)(?:\s+(?:sincerely|truly|deeply|really))?\s+apologi[sz]e|(?:we|i)(?:'re|\s+are|'m|\s+am)\s+(?:so\s+|very\s+|really\s+|truly\s+)?sorry|(?:so\s+|very\s+)?sorry\b|(?:my|our)\s+(?:sincere\s+|deepest\s+)?apologies|apologies\b)/i;
const APOLOGY_ANY_RE = /\b(?:apologi[sz]e|apologies|sorry for)\b/i;
/** A closer that asks nothing and says nothing. */
const READY_FILLER_RE = /^(?:please\s+)?let us know (?:when|once) you(?:'re| are) ready(?: to (?:proceed|move forward|continue))?[.!]?$/i;
const CONTACT_US_RE =
  /\b(?:contact|reach out to|get in touch with|call|e-?mail|message|write to)\s+us\b|\breach out\b(?!\s+to\s+(?:the|your|them)\b)/i;

function sentencesOf(text: string): string[] {
  return text.match(/[^.!?\n]+(?:[.!?]+["')\]]*|(?=\n)|$)/g)?.map((s) => s.trim()).filter(Boolean) ?? [];
}

function removeSentence(text: string, sentence: string): string {
  return text
    .replace(sentence, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/^[ \t]+|[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Remove a leading apology sentence (after any greeting line) when the rest of
 * the reply stands, and "let us know when you're ready" closers. Each removal
 * is reported; an apology that cannot be removed cleanly is a warning.
 */
export function stripToneFillers(body: string): { body: string; removed: string[]; warnings: string[] } {
  const removed: string[] = [];
  const warnings: string[] = [];
  const lines = body.split('\n');
  const greeting = lines.length > 1 && GREETING_LINE_RE.test(lines[0].trim()) ? lines[0] : null;
  let rest = greeting ? lines.slice(1).join('\n').trim() : body.trim();

  const first = sentencesOf(rest)[0];
  if (first && APOLOGY_START_RE.test(first)) {
    const without = removeSentence(rest, first);
    if (without) {
      removed.push(`apology opener "${first}"`);
      rest = without;
    } else {
      warnings.push('The whole reply is an apology — say what we will do instead.');
    }
  } else if (first && APOLOGY_ANY_RE.test(first)) {
    warnings.push(`Opens with an apology ("${first}") — keep it only if we made a mistake.`);
  }

  for (const sentence of sentencesOf(rest)) {
    if (!READY_FILLER_RE.test(sentence)) continue;
    const without = removeSentence(rest, sentence);
    if (!without) continue;
    removed.push(`filler "${sentence}"`);
    rest = without;
  }
  return { body: greeting ? `${greeting}\n${rest}` : rest, removed, warnings };
}

// ── Commitments ────────────────────────────────────────────────────────────

/** "we will" / "we'll" / "we can" / "we're going to" … */
const MODAL_SRC =
  "\\b(?:we|i)(?:'ll|\\s+will|\\s+can|\\s+shall|'re going to|\\s+are going to|'d be happy to|\\s+would be happy to|\\s+will be happy to)\\b";
/** Nouns that make "send …" / "follow up with …" information, not goods. */
const INFO_NOUN_SRC =
  '(?:information|info|details|update|updates|answer|instructions|link|photos?|pictures?|confirmation|tracking|status|reply|note|message|email)';
/**
 * An action verb in base form. Sending INFORMATION (details, an update, a link)
 * is not a promise of goods; issue / process count only when a refund,
 * replacement, label or credit follows. "follow up with the right / correct /
 * replacement <part>" and "get <it> out to you" promise goods too.
 */
const ACTION_VERB_SRC =
  `\\b(?:(?:send|mail)(?!\\s+(?:you\\s+|it\\s+)?(?:\\w+\\s+){0,2}${INFO_NOUN_SRC}\\b)|ship|overnight|expedite|refund|replace|repair|fix|exchange|reship|re-ship|` +
  `(?:issue|process)(?=\\s+(?:\\w+\\s+){0,2}(?:refund|replacement|return|label|credit|exchange))|` +
  `follow(?:\\s+|-)up\\s+with\\s+(?:you\\s+)?(?:the\\s+|a\\s+|an\\s+|some\\s+)?(?:right|correct|proper|replacement|new|missing|spare|matching|longer|shorter)\\b(?!\\s+(?:\\w+\\s+){0,1}${INFO_NOUN_SRC}\\b)|` +
  `get\\s+(?:\\w+\\s+){1,4}?(?:out|over)\\s+to\\s+you)\\b`;
/** The modal governs the verb directly ("we will send") or through "and" / "then" / "to" ("we will check … and send"). */
const COMMITMENT_RE = new RegExp(
  `${MODAL_SRC}\\s+(?:\\w+ly\\s+|also\\s+|then\\s+)?(?:(?:get|have)\\s+)?${ACTION_VERB_SRC}|${MODAL_SRC}[^.!?\\n]*?\\b(?:and|then|to)\\s+(?:then\\s+)?${ACTION_VERB_SRC}`,
  'i',
);
const PASSIVE_COMMITMENT_RE = /\b(?:will|shall)\s+be\s+(?:sent|shipped|mailed|refunded|replaced|repaired|fixed|issued|processed)\b/i;

type CommitmentAction = 'refund' | 'replace' | 'repair' | 'send';

function commitmentAction(phrase: string): CommitmentAction {
  if (/refund/i.test(phrase)) return 'refund';
  if (/replac|exchange/i.test(phrase)) return 'replace';
  if (/repair|fix/i.test(phrase)) return 'repair';
  return 'send';
}

const STAFF_BACKING: Readonly<Record<CommitmentAction, RegExp>> = {
  refund: /\brefund/i,
  replace: /\breplac|\bexchange/i,
  repair: /\brepair|\bfix|\bbench/i,
  send: /\b(?:send|sent|ship|mail|reship)/i,
};

/**
 * Promises to send / ship / refund / replace / repair that nothing backs: no
 * staff message or internal note mentions that action, and no record shows it
 * under way (an open repair backs "we will repair"; an unshipped linked order
 * backs "we will ship your order").
 */
export function findUnbackedCommitments(body: string, context: SupportDraftContext): string[] {
  const staff = context.messages.filter((m) => m.direction !== 'inbound').map((m) => m.body);
  const out: string[] = [];
  for (const sentence of sentencesOf(body)) {
    const active = COMMITMENT_RE.exec(sentence);
    const passive = active ? null : PASSIVE_COMMITMENT_RE.exec(sentence);
    if (!active && !passive) continue;
    // Report from the promise itself ("we will …"), or the whole sentence for a passive one.
    const phrase = (active ? sentence.slice(active.index) : sentence).trim().replace(/[.,;:!]+$/, '');
    const action = commitmentAction(phrase);
    const backedByStaff = staff.some((t) => STAFF_BACKING[action].test(t));
    const backedByRecord =
      (action === 'repair' && context.facts.some((f) => f.citation.type === 'repair' || /warranty claim/i.test(f.citation.label))) ||
      (action === 'send' &&
        /\border\b/i.test(phrase) &&
        context.orders.some((o) => !o.fulfillment || o.fulfillment.kind === 'pending'));
    if (!backedByStaff && !backedByRecord) out.push(phrase.length > 140 ? `${phrase.slice(0, 139)}…` : phrase);
  }
  return [...new Set(out)];
}

// ── Ship / delivery schedules ──────────────────────────────────────────────

/** "scheduled to ship", or a ship / arrive verb timed with soon / shortly / today / tomorrow / this week ("as soon as" is a condition). */
const SCHEDULE_RE = new RegExp(
  "\\b(?:scheduled|set|slated|expected|due|planned|on track)\\s+to\\s+(?:ship|go out|arrive|deliver|dispatch|be\\s+(?:shipped|sent|delivered|dispatched))\\b|" +
    "\\b(?:will|should|'ll|is going to|are going to)\\s+(?:be\\s+)?(?:ship(?:ped)?|go(?:ing)?\\s+out|arrive|deliver(?:ed)?|dispatch(?:ed)?|sent)\\b[^.!?\\n]*?" +
    '(?:(?<!\\bas\\s)\\bsoon\\b|\\bshortly\\b|\\bany day\\b|\\btoday\\b|\\btonight\\b|\\btomorrow\\b|\\b(?:this|next) week\\b)',
  'i',
);
const SCHEDULE_BACKING_RE = /\b(?:ship|dispatch|deliver|arriv|schedul|go(?:es)? out)/i;

/**
 * Sentences asserting when an item ships or arrives that nothing backs: no
 * staff message, internal note or record fact speaks to shipping, and (for
 * arrival) no linked order is shipped or delivered.
 */
export function findUnsourcedSchedules(body: string, context: SupportDraftContext): string[] {
  const backed =
    context.messages.some((m) => m.direction !== 'inbound' && SCHEDULE_BACKING_RE.test(m.body)) ||
    context.facts.some((f) => SCHEDULE_BACKING_RE.test(f.text));
  if (backed) return [];
  const inTransit = context.orders.some((o) => o.fulfillment?.kind === 'shipped' || o.fulfillment?.kind === 'delivered');
  return sentencesOf(body).filter((s) => {
    const m = SCHEDULE_RE.exec(s);
    return m !== null && !(inTransit && /arriv|deliver/i.test(m[0]));
  });
}

// ── The whole pass ─────────────────────────────────────────────────────────

export interface DraftValidationInput {
  body: string;
  kind: SupportDraftKind;
  context: SupportDraftContext;
  /** Retrieved grounding the model saw beyond the context (RAG answer and chunks, record hits). */
  extraSources?: readonly string[];
}

export interface DraftValidationResult {
  /** The body after deterministic clean-up (sign-off / placeholder lines removed). */
  body: string;
  /** Problems the staffer must look at before sending. */
  warnings: string[];
  /** Clean-ups already applied to `body` (shown, but they do not lower confidence). */
  fixes: string[];
  missingFacts: string[];
  /** A warning that makes the draft unsafe to send as is (false date, unproven action, invented id, placeholder). */
  severe: boolean;
}

export function validateSupportDraft(input: DraftValidationInput): DraftValidationResult {
  const { context, kind } = input;
  const warnings: string[] = [];
  const missingFacts: string[] = [];
  let severe = false;

  const stripped = stripSignatureAndPlaceholders(input.body, context.item.requesterName);
  const tone = stripToneFillers(stripped.body);
  const body = tone.body;
  const fixes = [...stripped.removed, ...tone.removed].map((r) => `Removed ${r}.`);
  warnings.push(...tone.warnings);
  if (stripped.placeholders.length) {
    severe = true;
    warnings.push(`Contains placeholder ${stripped.placeholders.join(', ')} — fill it in or remove it before sending.`);
    for (const p of stripped.placeholders) missingFacts.push(p.replace(/[[\]{}<>]/g, '').trim());
  }

  const dateWarnings = checkWeekdayDates(body, context.today);
  if (dateWarnings.length) severe = true;
  warnings.push(...dateWarnings);

  const proofs = claimProofs(context);
  for (const claim of findClaims(body)) {
    if (proofs[claim]) continue;
    severe = true;
    warnings.push(`Says ${CLAIM_LABEL[claim]}, but no record or staff note shows that — confirm before sending.`);
  }

  const sources = sourceTexts(context, input.extraSources ?? []);
  const known = compact(sources.join(' '));
  const invented = [...new Set(body.match(IDENTIFIER_RE) ?? [])].filter((id) => !known.includes(compact(id)));
  if (invented.length) {
    severe = true;
    warnings.push(`Mentions ${invented.join(', ')}, which no linked record contains.`);
  }

  const unsupported = findUnsupportedSpecifics(body, sources);
  if (unsupported.length) {
    severe = true;
    warnings.push(
      `States ${unsupported.map((t) => `"${t}"`).join(', ')}, which no record, message or document contains — confirm or remove before sending.`,
    );
    for (const t of unsupported) missingFacts.push(`A source for "${t}"`);
  }

  for (const phrase of findUnbackedCommitments(body, context)) {
    warnings.push(`Commits to "${phrase}" — no record or staff note backs it; confirm before sending.`);
  }

  const schedules = findUnsourcedSchedules(body, context);
  if (schedules.length) {
    severe = true;
    warnings.push(
      `Gives a ship/delivery schedule no record or staff note states (${schedules.map((s) => `"${s}"`).join(', ')}) — confirm or remove before sending.`,
    );
    missingFacts.push('Ship / delivery timing — no record or staff note states one.');
  }

  if (kind === 'reply' && context.messages.length > 0 && sentencesOf(body).some((s) => CONTACT_US_RE.test(s))) {
    warnings.push('Asks the customer to contact us, but they already are — answer here instead.');
  }

  const question = kind === 'reply' ? newestInboundMessage(context.messages)?.body ?? '' : '';
  if (context.orders.length === 0 && (kind === 'check_in' || ORDER_TOPIC_RE.test(question))) {
    missingFacts.push('Order number — no order is linked to this conversation.');
  }
  if (context.orders.length > 0 && ASKS_FOR_ORDER_RE.test(body)) {
    const numbers = context.orders.map((o) => o.orderNumber ?? `#${o.orderId}`).join(', ');
    warnings.push(`Asks the customer for an order number, but order ${numbers} is already linked.`);
  }
  const lines = context.orders.flatMap((o) => o.products).filter((p) => p.title || p.sku);
  if (lines.length > 0 && findProductDetailAsk(body)) {
    const named = lines.map((p) => `${p.title}${p.sku ? ` (SKU ${p.sku})` : ''}`).join('; ');
    warnings.push(`Asks the customer for the product model / SKU, but the linked order already names it: ${named}.`);
  }

  return { body, warnings, fixes, missingFacts: [...new Set(missingFacts)], severe };
}

const CONFIDENCE_RANK: Readonly<Record<SupportDraftConfidence, number>> = { low: 0, medium: 1, high: 2 };

/** A severe finding caps a draft at low; any other warning or gap caps it at medium. */
export function downgradeConfidence(base: SupportDraftConfidence, result: Pick<DraftValidationResult, 'severe' | 'warnings' | 'missingFacts'>): SupportDraftConfidence {
  const cap: SupportDraftConfidence = result.severe
    ? 'low'
    : result.missingFacts.length || result.warnings.length
      ? 'medium'
      : 'high';
  return CONFIDENCE_RANK[cap] < CONFIDENCE_RANK[base] ? cap : base;
}
