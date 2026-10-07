/**
 * Filing one stored label on one order by hand — the wire types, the request
 * schemas and the ONE classification both sides share. Framework- and
 * database-free: the upload tray asks the same questions the server's
 * `file-on-order` write refuses to guess.
 *
 * Carrier detection is `detectCarrier` from `@/lib/shipping/normalize` — the
 * detector the PDF parser and `applyLabelIngestion` already stamp
 * `label_ingestions.carrier` / `shipping_tracking_numbers.carrier` with, so a
 * typed number lands in the same UPS/FEDEX/USPS vocabulary as a read one.
 */
import { z } from 'zod';
import { detectCarrier, normalizeTrackingNumber } from '@/lib/shipping/normalize';

/** Another order that already holds this label's tracking (or that the label was resolved to). Full identity, never a tail. */
export interface LabelFileOtherOrder {
  orderId: number;
  orderNumber: string;
  platform: string | null;
  status: string | null;
}

/** `GET /api/v1/label-ingestions/{id}/file-check` — what filing this label on that order would do. */
export interface LabelFileCheck {
  /** The tracking the filing carries (raw as read or typed); null = none. */
  tracking: string | null;
  carrier: string | null;
  /** `label` = read off the page; `typed` = the operator's number; null = no tracking. */
  source: 'label' | 'typed' | null;
  /** Other orders already holding this tracking. */
  otherOrders: LabelFileOtherOrder[];
  /** Every tracking number the order already ships on (raw). */
  orderTracking: string[];
  /** The tracking is already on this order — filing changes no tracking. */
  sameAlready: boolean;
  /** This order, in the same face as `otherOrders` — the collision question shows both. */
  order: LabelFileOtherOrder;
}

/** What the operator must answer before a page can file. */
export type LabelFilingQuestion = 'tracking' | 'collision' | 'existing';

export interface LabelFilingAnswers {
  /** No tracking: file the page as the order's shipping-label document, with no tracking yet. */
  withoutTracking?: boolean;
  /** The tracking is on another order: `move` detaches it there; `keep` = one box on both orders. */
  collision?: 'move' | 'keep';
  /** The order already ships on a different tracking: `replace` makes this one primary; `add` files another box. */
  existing?: 'replace' | 'add';
}

export interface FilingTracking {
  raw: string;
  normalized: string;
  carrier: string | null;
  source: 'label' | 'typed';
}

/** The live carrier of a typed number (null while unrecognised). */
export function detectTypedCarrier(typed: string): string | null {
  const normalized = normalizeTrackingNumber(typed);
  return normalized ? detectCarrier(normalized) : null;
}

/**
 * The tracking a filing carries: the label's own when one was read (a typed
 * number never overrides the page), else the operator's typed number, else none.
 */
export function filingTracking(
  label: { raw: string | null; normalized: string | null; carrier: string | null },
  typed?: { tracking?: string | null; carrier?: string | null },
): FilingTracking | null {
  if (label.raw?.trim() && label.normalized) {
    return { raw: label.raw.trim(), normalized: label.normalized, carrier: label.carrier || detectCarrier(label.normalized), source: 'label' };
  }
  const raw = typed?.tracking?.trim() ?? '';
  const normalized = raw ? normalizeTrackingNumber(raw) : '';
  if (!normalized) return null;
  return { raw, normalized, carrier: typed?.carrier?.trim() || detectCarrier(normalized), source: 'typed' };
}

/** What the server read about one filing, before any answer. */
export interface LabelFilingFacts {
  tracking: FilingTracking | null;
  /** The order being filed on. */
  order: LabelFileOtherOrder;
  otherOrders: LabelFileOtherOrder[];
  orderTracking: Array<{ raw: string; normalized: string }>;
}

/** What the write does with the answers it has. */
export type LabelFilingPlan =
  | { kind: 'ask'; needs: LabelFilingQuestion[] }
  | { kind: 'refuse'; message: string }
  | { kind: 'withoutTracking' }
  | {
      kind: 'apply';
      /** The operator's typed number, to write onto the label first; null when the page's own is used. */
      typed: FilingTracking | null;
      collision: 'move' | 'keep' | null;
      /** `add` also files a same-tracking label without moving the order's primary. */
      existing: 'replace' | 'add' | null;
    };

export interface LabelFilingVerdict {
  check: LabelFileCheck;
  plan: LabelFilingPlan;
}

/** The questions still open for `check` given `answers` — the tray's and the write's one rule. */
export function labelFilingNeeds(check: LabelFileCheck, answers: LabelFilingAnswers = {}): LabelFilingQuestion[] {
  if (check.source == null) return answers.withoutTracking ? [] : ['tracking'];
  const needs: LabelFilingQuestion[] = [];
  if (check.otherOrders.length > 0 && !answers.collision) needs.push('collision');
  if (!check.sameAlready && check.orderTracking.length > 0 && !answers.existing) needs.push('existing');
  return needs;
}

/**
 * Classify one filing:
 * - no tracking (source null) → ask for it, or file without tracking when told to;
 * - tracking on other orders → collision (move / keep);
 * - the order already ships on a different tracking → existing (replace / add);
 * - the same tracking already on the order → `sameAlready`: file with no tracking change.
 */
export function classifyLabelFiling(facts: LabelFilingFacts, answers: LabelFilingAnswers = {}): LabelFilingVerdict {
  const { tracking } = facts;
  const sameAlready = tracking != null && facts.orderTracking.some((entry) => entry.normalized === tracking.normalized);
  const check: LabelFileCheck = {
    tracking: tracking?.raw ?? null,
    carrier: tracking?.carrier ?? null,
    source: tracking?.source ?? null,
    otherOrders: tracking ? facts.otherOrders : [],
    orderTracking: facts.orderTracking.map((entry) => entry.raw),
    order: facts.order,
    sameAlready,
  };
  if (tracking && answers.withoutTracking) {
    return { check, plan: { kind: 'refuse', message: `This label carries tracking ${tracking.raw} — file it with its tracking.` } };
  }
  const needs = labelFilingNeeds(check, answers);
  if (needs.length > 0) return { check, plan: { kind: 'ask', needs } };
  if (!tracking) return { check, plan: { kind: 'withoutTracking' } };
  return {
    check,
    plan: {
      kind: 'apply',
      typed: tracking.source === 'typed' ? tracking : null,
      collision: check.otherOrders.length > 0 ? answers.collision ?? null : null,
      existing: sameAlready ? 'add' : check.orderTracking.length > 0 ? answers.existing ?? null : null,
    },
  };
}

const id = z.number().int().positive().max(2_147_483_647);
const typedTracking = z.string().trim().max(64);

/** `GET /api/v1/label-ingestions/{id}/file-check?orderId=&tracking=` */
export const labelFileCheckQuerySchema = z.object({
  orderId: z.coerce.number().int().positive().max(2_147_483_647),
  tracking: typedTracking.optional().transform((value) => value || undefined),
}).strict();

/** `POST /api/v1/label-ingestions/{id}/file-on-order` — the filing and the operator's answers. */
export const labelFileOnOrderBodySchema = z.object({
  orderId: id,
  expectedRowVersion: z.number().int().min(0).max(2_147_483_647),
  tracking: typedTracking.optional(),
  carrier: z.string().trim().max(32).optional(),
  withoutTracking: z.boolean().optional(),
  collision: z.enum(['move', 'keep']).optional(),
  existing: z.enum(['replace', 'add']).optional(),
}).strict();

export type LabelFileOnOrderBody = z.output<typeof labelFileOnOrderBodySchema>;

/** The write's answer. `withoutTracking` = stored as the order's shipping-label document; the ingestion is gone. */
export interface LabelFileOnOrderResult {
  mode: 'applied' | 'withoutTracking';
  repaired: number;
  documentId: number;
  shipmentId: number | null;
  check: LabelFileCheck;
}

/** The 409 body's `error` extras when an answer is missing. */
export interface LabelFilingAnswerRequiredDetail {
  check: LabelFileCheck;
  needs: LabelFilingQuestion[];
}
