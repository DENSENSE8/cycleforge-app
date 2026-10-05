# Arrival pairing wire contract (2026-10-04)

Planned shape for the pairing routes. Not yet in `src/` — copy it to `src/lib/receiving/arrival-contract.ts` when slice B starts, trimming the parts the current build order does not use (org rules).

```ts
/**
 * Arrival pairing contract — tracking number → package → urgency → location,
 * then the unbox queue, plus the org's own urgency rules. The ONE wire shape
 * for the phone web (`/m/*`) and the native app (CycleForgeFloorApp). Client-
 * safe: Zod schemas and types only.
 *
 * Operator rulings 2026-10-04:
 * - The scan flow shows two states, Urgent / Not urgent. The four stored tiers
 *   stay underneath: Urgent writes tier 0, Not urgent writes tier 2, and a
 *   package reads as urgent when its tier is 0 or 1.
 * - A package pairs to ANY active location with a barcode (rack shelf, bin,
 *   floor spot). Urgency lives on the package, never on the shelf; a shelf's
 *   own arrival tier is only a suggestion.
 *
 * Urgency precedence (first answer wins):
 *   1. operator — `receiving_carton.priority_tier` set by hand;
 *   2. inbound_order — the most urgent tier of the orders on the package;
 *   3. rule — the first enabled org rule (lowest position) whose fact matches;
 *   4. default — Not urgent.
 *
 * Routes:
 *   POST  /api/receiving/arrival/scan          ArrivalScanBody → ArrivalScanResponse
 *   GET   /api/receiving/[id]/arrival          → ArrivalPackageResponse
 *   POST  /api/receiving/[id]/arrival          ArrivalActionBody → ArrivalPackageResponse
 *   GET   /api/receiving/unbox-next            → UnboxQueueResponse
 *   GET   /api/receiving/arrival-rules         → ArrivalRulesResponse
 *   POST  /api/receiving/arrival-rules         ArrivalRuleCreateBody → ArrivalRuleResponse
 *   PATCH /api/receiving/arrival-rules/[id]    ArrivalRuleUpdateBody → ArrivalRuleResponse
 *   DELETE /api/receiving/arrival-rules/[id]   → { success: true }
 *   POST  /api/receiving/arrival-rules/order   ArrivalRuleOrderBody → ArrivalRulesResponse
 * Every failure is `{ success: false, error: string }` with a 4xx/5xx status.
 */

import { z } from 'zod';

/** Stored tier an operator's "Urgent" writes. */
export const URGENT_TIER = 0;
/** Stored tier an operator's "Not urgent" writes, and the default. */
export const NOT_URGENT_TIER = 2;

/** Two-state reading of a stored 0..3 tier. */
export function tierIsUrgent(tier: number): boolean {
  return tier <= 1;
}

export const ArrivalUrgencySource = z.enum(['operator', 'inbound_order', 'rule', 'default']);
export type ArrivalUrgencySource = z.infer<typeof ArrivalUrgencySource>;

export const ArrivalUrgency = z.object({
  urgent: z.boolean(),
  /** The stored/derived 0..3 tier underneath. */
  tier: z.number().int().min(0).max(3),
  source: ArrivalUrgencySource,
  /** Operator words: "Marked urgent by hand", "Rule: Bought on eBay → Urgent", "Order PO-12 is High". */
  reason: z.string(),
  /** The rule that answered, when `source === 'rule'`. */
  ruleId: z.number().int().positive().nullable(),
});
export type ArrivalUrgency = z.infer<typeof ArrivalUrgency>;

export const ArrivalLocationRef = z.object({
  id: z.number().int().positive(),
  /** The barcode printed on the label (`RK1-2`, `A-01-02-1-03`). */
  code: z.string(),
  /** Display name (`Rack 1 Shelf 2`). */
  name: z.string(),
});
export type ArrivalLocationRef = z.infer<typeof ArrivalLocationRef>;

export const ArrivalPackageItem = z.object({
  lineId: z.number().int().positive(),
  title: z.string(),
  sku: z.string().nullable(),
  quantity: z.number().int().nullable(),
  imageUrl: z.string().nullable(),
});
export type ArrivalPackageItem = z.infer<typeof ArrivalPackageItem>;

export const ArrivalPackage = z.object({
  receivingId: z.number().int().positive(),
  tracking: z.string().nullable(),
  carrier: z.string().nullable(),
  /** Matched to a purchase (has lines or a linked order). False = "unfound". */
  found: z.boolean(),
  /** Platform token (`ebay`, `goodwill`, …) and its display label. */
  platform: z.string().nullable(),
  platformLabel: z.string().nullable(),
  orderNumber: z.string().nullable(),
  vendor: z.string().nullable(),
  /** ISO time the package came through the door. */
  doorReceivedAt: z.string().nullable(),
  items: z.array(ArrivalPackageItem),
  urgency: ArrivalUrgency,
  /** Where it sits now (the pairing), null while unpaired. */
  location: ArrivalLocationRef.nullable(),
});
export type ArrivalPackage = z.infer<typeof ArrivalPackage>;

export const ArrivalPackageResponse = z.object({ success: z.literal(true), package: ArrivalPackage });
export type ArrivalPackageResponse = z.infer<typeof ArrivalPackageResponse>;

// ─── One scan, one call ──────────────────────────────────────────────────────

/**
 * Every scan of the In loop. `armedReceivingId` is the package on screen
 * waiting for its location: a location label scanned while armed pairs it.
 */
export const ArrivalScanBody = z
  .object({
    scanned: z.string().trim().min(1).max(200),
    clientEventId: z.string().trim().min(8).max(128),
    armedReceivingId: z.number().int().positive().nullable().optional(),
    /** Where the scan happened (`/m/scan`, `ios:arrival`) — ops-event provenance. */
    surface: z.string().trim().max(120).optional(),
  })
  .strict();
export type ArrivalScanBody = z.infer<typeof ArrivalScanBody>;

export const ArrivalScanResult = z.discriminatedUnion('kind', [
  /** A carrier label: logged now (`arrived`) or already in the system (`known`). */
  z.object({ kind: z.literal('package'), outcome: z.enum(['arrived', 'known']), package: ArrivalPackage }),
  /** A location label while a package was armed: the pair is written. */
  z.object({ kind: z.literal('placed'), location: ArrivalLocationRef, package: ArrivalPackage }),
  /** A location label with nothing armed. */
  z.object({ kind: z.literal('location_unarmed'), location: ArrivalLocationRef, message: z.string() }),
  /** Not a tracking number and not a known location (product barcode, unknown code, own carton label …). */
  z.object({ kind: z.literal('refused'), message: z.string() }),
]);
export type ArrivalScanResult = z.infer<typeof ArrivalScanResult>;

export const ArrivalScanResponse = z.object({ success: z.literal(true), result: ArrivalScanResult });
export type ArrivalScanResponse = z.infer<typeof ArrivalScanResponse>;

// ─── Package actions ─────────────────────────────────────────────────────────

export const ArrivalActionBody = z.discriminatedUnion('action', [
  /** true = Urgent (tier 0), false = Not urgent (tier 2), null = back to the rules. */
  z.object({
    action: z.literal('urgency'),
    urgent: z.boolean().nullable(),
    clientEventId: z.string().trim().min(8).max(128),
  }).strict(),
  /** Pair to a scanned location label (any active location with that barcode). */
  z.object({
    action: z.literal('place'),
    scanned: z.string().trim().min(1).max(200),
    clientEventId: z.string().trim().min(8).max(128),
    surface: z.string().trim().max(120).optional(),
  }).strict(),
]);
export type ArrivalActionBody = z.infer<typeof ArrivalActionBody>;

// ─── Unbox queue ─────────────────────────────────────────────────────────────

export const UnboxQueueItem = z.object({
  receivingId: z.number().int().positive(),
  urgency: ArrivalUrgency,
  location: ArrivalLocationRef.nullable(),
  tracking: z.string().nullable(),
  found: z.boolean(),
  platform: z.string().nullable(),
  platformLabel: z.string().nullable(),
  orderNumber: z.string().nullable(),
  vendor: z.string().nullable(),
  /** First item's title, for the row. */
  title: z.string().nullable(),
  lineCount: z.number().int().min(0),
  doorReceivedAt: z.string().nullable(),
});
export type UnboxQueueItem = z.infer<typeof UnboxQueueItem>;

/** Sorted: urgent first, then oldest door time first. */
export const UnboxQueueResponse = z.object({ success: z.literal(true), items: z.array(UnboxQueueItem) });
export type UnboxQueueResponse = z.infer<typeof UnboxQueueResponse>;

// ─── Org urgency rules ───────────────────────────────────────────────────────

/** What a rule looks at. Value-taking facts carry `value`; the rest carry null. */
export const ARRIVAL_RULE_FACTS = [
  'unfound',
  'waiting_order',
  'return',
  'claim',
  'platform',
  'vendor',
  'title',
] as const;
export const ArrivalRuleFact = z.enum(ARRIVAL_RULE_FACTS);
export type ArrivalRuleFact = z.infer<typeof ArrivalRuleFact>;

/** Facts whose rule needs a value (platform token, or text to look for). */
export const ARRIVAL_RULE_FACT_TAKES_VALUE: Readonly<Record<ArrivalRuleFact, boolean>> = {
  unfound: false,
  waiting_order: false,
  return: false,
  claim: false,
  platform: true,
  vendor: true,
  title: true,
};

/** Operator words for each fact — the rule editor's picker and the rule sentence. */
export const ARRIVAL_RULE_FACT_LABEL: Readonly<Record<ArrivalRuleFact, string>> = {
  unfound: 'The package matched no purchase',
  waiting_order: 'A waiting order needs an item in it',
  return: 'It is a return',
  claim: 'It has an open claim',
  platform: 'Bought on',
  vendor: 'Seller name contains',
  title: 'An item title contains',
};

export const ArrivalRule = z.object({
  id: z.number().int().positive(),
  /** Lower runs first. */
  position: z.number().int().min(0),
  enabled: z.boolean(),
  fact: ArrivalRuleFact,
  value: z.string().nullable(),
  urgent: z.boolean(),
  /** "Bought on Goodwill → Not urgent". */
  sentence: z.string(),
});
export type ArrivalRule = z.infer<typeof ArrivalRule>;

export const ArrivalRulesResponse = z.object({
  success: z.literal(true),
  rules: z.array(ArrivalRule),
  /** The org's platform catalog, for the `platform` fact's picker. */
  platforms: z.array(z.object({ value: z.string(), label: z.string() })),
});
export type ArrivalRulesResponse = z.infer<typeof ArrivalRulesResponse>;

export const ArrivalRuleResponse = z.object({ success: z.literal(true), rule: ArrivalRule });
export type ArrivalRuleResponse = z.infer<typeof ArrivalRuleResponse>;

const ruleValue = z.string().trim().min(1).max(120).nullable();

function valueMatchesFact(body: { fact?: ArrivalRuleFact; value?: string | null }): boolean {
  if (body.fact == null) return true;
  return ARRIVAL_RULE_FACT_TAKES_VALUE[body.fact] ? body.value != null : body.value == null;
}

export const ArrivalRuleCreateBody = z
  .object({
    fact: ArrivalRuleFact,
    value: ruleValue,
    urgent: z.boolean(),
    enabled: z.boolean().optional(),
    idempotencyKey: z.string().min(8).max(128).optional(),
  })
  .strict()
  .refine(valueMatchesFact, { message: 'platform, vendor and title rules need a value; the others take none', path: ['value'] });
export type ArrivalRuleCreateBody = z.infer<typeof ArrivalRuleCreateBody>;

export const ArrivalRuleUpdateBody = z
  .object({
    fact: ArrivalRuleFact.optional(),
    value: ruleValue.optional(),
    urgent: z.boolean().optional(),
    enabled: z.boolean().optional(),
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, { message: 'at least one field required' })
  .refine((b) => b.fact == null || valueMatchesFact(b), {
    message: 'platform, vendor and title rules need a value; the others take none',
    path: ['value'],
  });
export type ArrivalRuleUpdateBody = z.infer<typeof ArrivalRuleUpdateBody>;

/** The full rule order, every live rule id once. */
export const ArrivalRuleOrderBody = z.object({ ids: z.array(z.number().int().positive()).min(1).max(200) }).strict();
export type ArrivalRuleOrderBody = z.infer<typeof ArrivalRuleOrderBody>;
```
