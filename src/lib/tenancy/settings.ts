/**
 * Per-tenant settings schema + safe parser.
 *
 * `organizations.settings` is a jsonb bag — schema is policed here, not in
 * Postgres, so we can iterate without DDL churn. Anything callers want to
 * persist on an organization goes through `parseOrgSettings` first.
 *
 * Defaults match the current single-tenant USAV behavior so a missing key
 * never crashes downstream formatters.
 */

import { z } from 'zod';
import {
  KIOSK_COMMAND_IDS,
  KIOSK_FALLBACK_COMMAND,
  parseKioskCommandId,
  type KioskCommandId,
} from '@/lib/kiosk/commands';
import { DEFAULT_LINE_REASONS, type KioskLineReasons } from '@/lib/kiosk/price-approval-kinds';

const BrandSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  logoUrl: z.string().url().optional(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  /** Public image/video URL for kiosk attract. Empty string clears. */
  attractMediaUrl: z.string().url().or(z.literal('')).optional(),
  /**
   * Wordmark painted on the kiosk screensaver when NO attract media is set —
   * two lines, the second letterspaced to the width of the first (the logotype
   * lockup shape). `attractMediaUrl` outranks these: an uploaded image is
   * full-bleed and nothing composites over it.
   *
   * Short on purpose. This is a logotype at ~15vw, not a message board — a long
   * string would either overflow a counter tablet or shrink to unreadable on a
   * front-desk display.
   */
  attractHeadline: z.string().max(16).optional(),
  attractSubline: z.string().max(24).optional(),
  /**
   * Customer website opened from the public QR interstitial (phone-camera
   * scans of platform Digital Links). Stickers always mint on the Cycle Forge
   * host (`{slug}.app.cycleforge.ai`) — this field is outbound only.
   * Empty / unset ⇒ interstitial shows brand but no continue button.
   */
  publicLandingUrl: z.string().url().or(z.literal('')).optional(),
});

// Counter-tablet BEHAVIOUR, kept out of `brand` on purpose: brand is identity
// (name, logo, colour, lock-screen media). Consult idle is off — nothing on
// the counter reads an idle number, so a leftover one cannot turn it back on.
const KioskSchema = z.object({
  /**
   * Leftover tenant JSON. The consult shell ignores this — idle/attract are
   * off and nothing reads it. Kept so existing org bags still parse.
   */
  idleTimeoutSeconds: z.number().int().optional(),
  /**
   * Which center command a counter OPENS on — the tablet's first frame and a
   * freshly opened desk session both.
   *
   * Operator 2026-09-15: *"Whenever I go to the kiosk page, it defaults to
   * sales. It must default to repair service. That is the most common thing,
   * but this must be a selection within settings for a default kiosk selection
   * to be updated to repair service sales or any different type of buying
   * service."* So: a per-org CHOICE, not a hard-coded flip. Unset resolves to
   * `KIOSK_FALLBACK_COMMAND` (repair) via {@link getKioskDefaultCommand} — a
   * shop whose counter is mostly retail sets `retail` here and gets it.
   *
   * The list is `KIOSK_COMMAND_IDS` — a subset of `counter_sessions.active_command`'s
   * CHECK — so this field can never hold a value the column would reject.
   */
  defaultCommand: z.enum(KIOSK_COMMAND_IDS).optional(),
  /**
   * The counter's comp reasons (Square's owner-editable list). The tablet
   * offers them as chips; free text is always allowed beside them.
   * Unset or empty → `DEFAULT_LINE_REASONS`. Older bags may still carry a
   * void-reason list from when removing a line took a PIN; this object is
   * non-strict, so parsing drops that key and those rows stay readable.
   */
  compReasons: z.array(z.string().trim().min(1).max(60)).max(12).optional(),
});

// Tenant letterhead — drives the company block on printed repair paper and
// walk-in receipts (src/lib/branding/letterhead.ts), distinct from the
// platform-fixed Cycle Forge branding in src/lib/branding/constants.ts.
const LetterheadSchema = z.object({
  addressLine1: z.string().max(120).default(''),
  addressLine2: z.string().max(120).default(''),
  phone: z.string().max(40).default(''),
  email: z.string().email().or(z.literal('')).default(''),
});

// Structured warehouse origin for outbound shipping labels (ship_from). Lives
// in the settings jsonb bag (no DDL); env SHIPSTATION_SHIP_FROM_* is the
// fallback. A rate/label needs a complete origin (line1 + city + state + zip).
const ShipFromSchema = z.object({
  name: z.string().max(80).default(''),
  company: z.string().max(80).default(''),
  phone: z.string().max(40).default(''),
  addressLine1: z.string().max(120).default(''),
  addressLine2: z.string().max(120).default(''),
  city: z.string().max(80).default(''),
  state: z.string().max(40).default(''),
  postalCode: z.string().max(20).default(''),
  country: z.string().max(2).default('US'),
});

const NasStorageTargetSchema = z.object({
  root: z.string().default(''),
  folder: z.string().default(''),
});

export const DEFAULT_NAS_STORAGE_TARGETS = {
  receiving: {
    root: '/Volumes/USAV Media/Puchasing photos/2026',
    folder: 'JUN 2026',
  },
  shipping: {
    root: '/Volumes/Shipping/2026',
    folder: 'Jun 2026',
  },
  claims: {
    root: '/Volumes/USAV Media/Puchasing photos/2026/2 Zendesk 2026',
    folder: '',
  },
} as const;

export const OrgSettingsSchema = z.object({
  timezone: z.string().default('America/Los_Angeles'),
  currency: z.string().length(3).default('USD'),
  locale: z.string().default('en-US'),
  brand: BrandSchema.default({}),
  kiosk: KioskSchema.default({}),
  letterhead: LetterheadSchema.default({ addressLine1: '', addressLine2: '', phone: '', email: '' }),
  // Warehouse origin for outbound shipping labels (ShipStation ship_from).
  // Optional — falls back to SHIPSTATION_SHIP_FROM_* env when unset.
  shipFrom: ShipFromSchema.optional(),
  // Toggle to require email-then-PIN signin instead of tap-your-name. Off
  // by default to preserve the existing USAV station UX.
  emailFirstSignin: z.boolean().default(false),
  // When true, every new staff invite must use a passkey (no PIN). For
  // customers with stricter device policies.
  requirePasskeyForNewStaff: z.boolean().default(false),
  // Staff sign-in model for this workspace — the two avenues:
  //   'individual' (default) — every staff has their OWN account (email+password,
  //      passkey, or SSO) and sign-in lands them straight in. The standard
  //      per-person SaaS model.
  //   'shared' — ONE shared workspace account (email+password) fronts an
  //      "umbrella" staff list. After the shared login you pick which staff you
  //      are and are signed in AS them with NO PIN. The common small-business
  //      pattern where the whole floor shares one login. The shared account's
  //      own profile is hidden from the umbrella list.
  // Both avenues coexist on /signin: a person with their own email always signs
  // in individually; a shared workspace account opens the umbrella picker.
  // Read by /api/auth/account/signin (returns the picker) and
  // /api/auth/act-as-staff (authorizes the PIN-less switch).
  staffLoginModel: z.enum(['individual', 'shared']).default('individual'),
  // Hard cap on simultaneous active sessions per staff. 0 = unlimited.
  maxConcurrentSessions: z.number().int().min(0).default(0),
  // Warranty term (days) used by the Warranty Claim Logger clock. Per-org,
  // default 30. Resolved via src/lib/warranty/term.ts and snapshotted onto
  // warranty_claims.warranty_days at log time.
  warrantyDays: z.number().int().min(1).max(3650).default(30),
  // Per-station default folder for the receiving NAS photo picker. Keys are
  // station codes (TECH/PACK/UNBOX/SALES/FBA); values are a relative folder
  // path the picker auto-opens for an operator on that station (e.g.
  // "JUN 2026" or "2 Zendesk 2026/sub"). "" / missing = start at the root.
  // Admin-configured (see StationNasFoldersTab); resolved per-operator via
  // their primary station.
  stationNasPhotoFolders: z.record(z.string(), z.string()).default({}),
  // Receiving photos are written straight to the office NAS over WebDAV — the
  // browser PUTs to whichever base URL is `active`. Two slots so an admin can
  // keep a testing NAS and the production NAS configured and flip between them
  // without retyping. Values are the base URL of the (Cloudflare-fronted) NAS
  // file server, no trailing slash, e.g. "https://nas.usav.example". Admin-
  // configured (see StationNasFoldersTab); the active URL is surfaced to the
  // client via GET /api/nas-config.
  nasPhotoServers: z
    .object({
      test: z.string().default(''),
      prod: z.string().default(''),
      active: z.enum(['test', 'prod']).default('prod'),
    })
    .default({ test: '', prod: '', active: 'prod' }),
  // Workflow-specific NAS storage targets. `root` is the real mount/path used
  // by the office/NAS agent; `folder` is the active relative folder for that
  // workflow, typically the current month. Receiving still supports per-station
  // overrides through stationNasPhotoFolders.
  nasStorageTargets: z
    .object({
      receiving: NasStorageTargetSchema.default(DEFAULT_NAS_STORAGE_TARGETS.receiving),
      shipping: NasStorageTargetSchema.default(DEFAULT_NAS_STORAGE_TARGETS.shipping),
      claims: NasStorageTargetSchema.default(DEFAULT_NAS_STORAGE_TARGETS.claims),
    })
    .default(DEFAULT_NAS_STORAGE_TARGETS),
  // Per-org packing-checklist enforcement (the "box until matched" toggle).
  // 'advisory' (default) — the kit-parts pack checklist is informational; a
  //   discrepancy is surfaced but never blocks. Matches the repo's "QC never
  //   blocks" philosophy.
  // 'block_until_matched' — the packer is shown a hard blocker until every
  //   *critical* expected kit part is confirmed. GRACEFUL DEGRADATION is
  //   load-bearing: enforcement only bites when expected items are KNOWN (the
  //   SKU has critical sku_kit_parts rows). A SKU with no BOM ⇒ nothing to
  //   match ⇒ the pack proceeds regardless of the mode, so a tenant who hasn't
  //   populated its catalog can never brick its own packing by flipping this on.
  packing: z
    .object({
      enforcement: z.enum(['advisory', 'block_until_matched']).default('advisory'),
    })
    .default({ enforcement: 'advisory' }),
  // Per-org photo AI-analysis engine. Each org chooses which inference path runs
  // when a photo is enriched into photo_analysis (see src/lib/photos/analyze.ts):
  //   'local-vision' — the org's own RTX 5070 Ti vision box (LAN/Cloudflare-tunnel);
  //                    photos never leave the building. THE LOCAL-FIRST DEFAULT.
  //   'hermes'       — the self-hosted text gateway infers metadata from PO context.
  //   'gcp-vision'   — Google Cloud Vision (photos uploaded to Google).
  //   'catalog'      — no model; deterministic PO-derived metadata only.
  // `enabled` is the per-org master switch (the global PHOTOS_ANALYZE_ENABLED env is
  // the fallback when an org hasn't set one). `localVisionBaseUrl` is the
  // SERVER-reachable base URL of the org's vision box (the cron analyze job runs on
  // Vercel and can't reach the LAN, so this must be the Cloudflare-tunnel URL, not the
  // browser's LAN `NEXT_PUBLIC_VISION_BASE_URL`); empty falls back to the env default.
  // `provider`/`enabled` are intentionally OPTIONAL (no zod default) so a resolver can
  // tell "org explicitly chose X" from "unset → use env/local-first default".
  photoAnalysis: z
    .object({
      provider: z.enum(['hermes', 'gcp-vision', 'local-vision', 'catalog']).optional(),
      enabled: z.boolean().optional(),
      localVisionBaseUrl: z.string().default(''),
    })
    .default({ localVisionBaseUrl: '' }),
  // Per-org fulfillment substitution policy — the ordered-vs-fulfilled deviation
  // flow (release the original allocation + allocate a substitute unit, recorded
  // in order_unit_amendments). Mirrors `packing` above.
  // substitutionEnforcement:
  //   'advisory' (default) — the substitution re-allocates immediately and the
  //     order can ship; the amendment is recorded APPLIED. Matches the repo's
  //     "never block the floor" philosophy.
  //   'block_until_approved' — the substitution is recorded PENDING and the
  //     order cannot pack/ship until a supervisor approves it (gate read by
  //     /api/pack/ship).
  // substitutionAllowedNodes: which station may RAISE a substitution. Default
  //   ['pick'] mirrors industry WMS (pick-exception); a tenant opens 'test' /
  //   'pack' from /studio. The route refuses a raise from a node not listed here.
  fulfillment: z
    .object({
      substitutionEnforcement: z.enum(['advisory', 'block_until_approved']).default('advisory'),
      substitutionAllowedNodes: z.array(z.enum(['pick', 'test', 'pack'])).default(['pick']),
    })
    .default({ substitutionEnforcement: 'advisory', substitutionAllowedNodes: ['pick'] }),
  // Per-org workflow-engine overrides (flag-gated, default empty). `verdictStatus`
  // maps a test verdict to the unit status + inventory-event it produces,
  // overriding the hardcoded VERDICT_TO_STATUS (src/lib/tech/recordTestVerdict.ts).
  // Read ONLY when UNIFIED_ENGINE_VERDICT_CONFIG is on; an unset verdict falls back
  // to the built-in. Values are constrained to the existing serial states / event
  // types so an override can never write an out-of-range status.
  workflow: z
    .object({
      verdictStatus: z
        .record(
          z.enum(['PASS', 'TEST_AGAIN', 'TESTING_FAILED']),
          z.object({
            nextStatus: z.enum(['TESTED', 'IN_TEST', 'ON_HOLD']),
            eventType: z.enum(['TEST_PASS', 'TEST_FAIL', 'TEST_START']),
          }),
        )
        .optional(),
    })
    .default({}),
  // Per-org Universal Incoming policy (docs/incoming-universal-purchase-orders-plan.md §9.6).
  // Tenant-tunable without code: which badge wins after an eBay↔Zoho merge, which
  // Zoho PO fields carry the eBay order# (Zoho layout varies per tenant), which
  // signals may auto-merge, whether a fuzzy SKU match needs staff review, and which
  // inbound sources are enabled (a subset of the source registry — the Studio
  // publish gate validates bound sources ⊆ this list). Read only when the
  // `incoming_universal` flag is on; the merge helper's built-in defaults match
  // these, so an org with no `inbound` block behaves identically.
  //
  // `enabledSources` is deliberately OPTIONAL (no zod default): absent means the
  // org never explicitly chose, and resolveInboundSettings
  // (src/lib/inbound/org-settings.ts — the ONE resolution point) derives the
  // enabled set from the org's actual connections (inventory backend, eBay buyer
  // account, …) instead of a hardcoded vendor list. A persisted array — including
  // an explicitly empty one — is kept verbatim.
  inbound: z
    .object({
      displaySourceAfterMerge: z.enum(['ebay', 'zoho', 'both']).default('ebay'),
      zohoOrderNumberFields: z.array(z.string()).default(['reference_number', 'notes']),
      autoMergeSignals: z.array(z.enum(['tracking', 'order_number'])).default(['tracking', 'order_number']),
      fuzzyMergeRequiresReview: z.boolean().default(true),
      enabledSources: z.array(z.string()).optional(),
    })
    .default({
      displaySourceAfterMerge: 'ebay',
      zohoOrderNumberFields: ['reference_number', 'notes'],
      autoMergeSignals: ['tracking', 'order_number'],
      fuzzyMergeRequiresReview: true,
    }),
  // The tenant's GS1 identity, for the interop projections (src/lib/interop).
  // Wholly OPTIONAL and absent by default: almost no reseller has licensed a
  // GS1 Company Prefix, and the projections are designed to be useful with
  // internal identifiers and to UPGRADE per tenant when a prefix appears.
  //
  // `companyPrefix` is what makes minting an SSCC / GRAI / GIAI possible at
  // all. Without it those keys are simply absent from a projection — never
  // faked, because a GS1 key on an unlicensed prefix collides with whichever
  // company really owns those digits (src/lib/interop/gs1-keys.ts explains the
  // refusal at length, including the placeholder GLN this repo already prints
  // on bin labels).
  //
  // `cbvUriForm` is per-partner in spirit: an EPCIS 1.2 consumer REJECTS the
  // Web URI spelling of a CBV term, so the safe default is the legacy URN and
  // a tenant opts into `webUri` only when it knows its partners are on 2.0.
  gs1: z
    .object({
      companyPrefix: z.string().max(12).default(''),
      gln: z.string().max(13).default(''),
      cbvUriForm: z.enum(['urn', 'webUri']).default('urn'),
    })
    .default({ companyPrefix: '', gln: '', cbvUriForm: 'urn' }),
  // What the tenant told us about their inventory and channels — the two facts
  // that decide whether they need a licensed GS1 key at all.
  //
  // These are about PRODUCT identity (GTIN), not location identity (GLN).
  // Amazon's strictness is a GTIN rule and only bites when you create a listing
  // for a BRAND-NEW item; selling refurb against an existing ASIN needs no key
  // of your own, and eBay accepts "does not apply" for used goods outright. So
  // the honest default for a refurb reseller — the dogfood case — is "no" to
  // both, and they never see a key prompt. `gs1.gln` is NOT gated on these:
  // a GLN answers to an EDI / EPCIS partner, not to a marketplace.
  //
  // EVERY field is nullable and defaults to null, deliberately. "Has not
  // answered" and "answered no" are different states: the first should prompt,
  // the second must never prompt again. A `false` default collapses them and
  // silently completes the onboarding step for a tenant who never saw it.
  compliance: z
    .object({
      /** Stocks brand-new / industry-standard-new product, not only used/refurb. */
      hasNewInventory: z.boolean().nullable().default(null),
      /** Sells on Amazon, which enforces GTIN on new listings. */
      sellsOnAmazon: z.boolean().nullable().default(null),
      /**
       * How the tenant gets GTINs, when they need them at all. A Company Prefix
       * is not the only legal answer — GS1 sells individual GTINs, and a brand
       * owner may be exempt. Both of those store nothing org-level (the values
       * land per-SKU in `sku_catalog.gtin`), so a flow that only accepted a
       * prefix would nag them forever. `'none'` is the only nag state.
       */
      gs1Status: z.enum(['prefix', 'per-item', 'exempt', 'none']).nullable().default(null),
      /**
       * ISO instant the questions were answered. Stamped SERVER-side only — a
       * client-supplied value here is an onboarding-completion claim the client
       * does not get to make. This is what the onboarding step derives off.
       */
      answeredAt: z.string().nullable().default(null),
    })
    .default({
      hasNewInventory: null,
      sellsOnAmazon: null,
      gs1Status: null,
      answeredAt: null,
    }),
  // Support-assistant preferences. `visionLane` is a SAFETY CLASSIFICATION —
  // whether a customer's pasted photo may leave the tenant's hardware on the
  // Assist draft path. Precedence (org → env → local-only) lives ONLY in
  // `resolveSupportVisionLane` — this bag stores the org's request, never the
  // resolved lane. `vertical` frames the reply persona ("an audio reseller").
  // Both optional so "unset → inherit" stays distinguishable from an explicit pick.
  support: z
    .object({
      visionLane: z.enum(['local-only', 'cloud-multimodal']).optional(),
      vertical: z.string().max(80).optional(),
    })
    .default({}),
  // Org-wide slot-table layouts, keyed by tableId ('orders', …) — the ORG
  // layer of the slot cascade (src/lib/tables/resolve-effective-layout.ts).
  // DELIBERATELY `z.unknown()` values here: parseOrgSettings is a tolerant
  // whole-bag parse whose failure resets EVERY org setting to defaults, so a
  // stale/hostile layout blob must not take brand/kiosk/warranty down with
  // it. Per-layout validation happens where it can degrade gracefully —
  // strict at the write gate (PUT /api/tables/layouts → parseSlotLayout),
  // tolerant at read (readOrgTableLayout → readStoredSlotLayout → null).
  tableLayouts: z.record(z.string(), z.unknown()).optional(),
  // AI provider preferences. `providerOrder` decides which connected provider a
  // call TRIES FIRST — local-first by default, so a tenant with their own model
  // is not paying a cloud vendor by accident. Precedence (org → env →
  // local-first) lives ONLY in `resolveAiProviderOrder`; this bag stores the
  // org's request, never the resolved order, and never which provider actually
  // served a given turn (that is the failover loop's answer, recorded on
  // ai_usage_events.source). Optional so "unset → inherit" stays
  // distinguishable from an explicit pick.
  ai: z
    .object({
      providerOrder: z.enum(['local-first', 'cloud-first']).optional(),
    })
    .default({}),
}).passthrough();

export type OrgSettings = z.infer<typeof OrgSettingsSchema>;

export function parseOrgSettings(raw: unknown): OrgSettings {
  // Tolerant parse: invalid persisted settings fall back to defaults rather
  // than crashing the request that needs them.
  const result = OrgSettingsSchema.safeParse(raw ?? {});
  return result.success ? result.data : OrgSettingsSchema.parse({});
}

/**
 * Customer website for public QR interstitial CTA. Empty when unset / invalid
 * — callers must not fall back to a dogfood storefront URL.
 */
export function getPublicLandingUrl(settings: OrgSettings | null | undefined): string {
  const raw = String(settings?.brand?.publicLandingUrl ?? '').trim();
  if (!raw) return '';
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return u.toString();
  } catch {
    return '';
  }
}

/**
 * The base URL the browser should write/read receiving photos against, picked
 * from whichever NAS slot (`test` | `prod`) the admin has marked active. Empty
 * string when nothing is configured. No trailing slash.
 */
export function getActiveNasBaseUrl(settings: OrgSettings): string {
  const servers = settings.nasPhotoServers;
  if (!servers) return '';
  const url = servers.active === 'test' ? servers.test : servers.prod;
  return (url || '').trim().replace(/\/+$/, '');
}

/**
 * Every configured NAS base URL (test + prod), used as the server-side origin
 * allowlist when accepting a `photoUrl` on /api/receiving-photos. No trailing
 * slashes; empties dropped.
 */
export function getAllNasBaseUrls(settings: OrgSettings): string[] {
  const servers = settings.nasPhotoServers;
  if (!servers) return [];
  return [servers.test, servers.prod]
    .map((u) => (u || '').trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

/**
 * Does this workspace use the SHARED-account umbrella staff picker (the small-
 * business avenue) instead of per-person email logins? When true, an
 * email+password sign-in returns the staff roster and picking a name signs in
 * as that staff with no PIN. See OrgSettingsSchema.staffLoginModel.
 */
export function isSharedStaffAccountOrg(settings: OrgSettings): boolean {
  return settings.staffLoginModel === 'shared';
}

/** Packing-checklist enforcement mode for this org. See OrgSettingsSchema.packing. */
export type PackingEnforcement = OrgSettings['packing']['enforcement'];

export function getPackingEnforcement(settings: OrgSettings): PackingEnforcement {
  return settings.packing?.enforcement ?? 'advisory';
}

/**
 * Which command a counter opens on for this org.
 *
 * ## Precedence — this is a SEED, never an override
 *
 * A desk-claimed tablet mirrors `counter_sessions.active_command`, which is a
 * LIVE fact ("the desk is on Sales"), not a default. So this governs exactly
 * two moments: the pristine local boot (`applyDefaultCommand`, which refuses
 * once there are lines, a pick, or a mirror) and session CREATION, where the
 * only prior intent was a column default nobody chose. Letting it outrank an
 * attached mirror would flip a desk parked on Sales back to Repair on every
 * tablet reload — the one way this feature can regress the desk workflow.
 *
 * ## Coerced, never trusted
 *
 * The settings bag is `.passthrough()` tenant JSON, so a hand-edited or stale
 * `defaultCommand` lands on the fallback rather than handing a counter an id
 * no pane answers to. Unset → repair (`KIOSK_FALLBACK_COMMAND`); see that
 * constant for the operator ruling.
 *
 * ACCEPTED GAP: this validates the VOCABULARY, not liveness. The Settings
 * chooser only offers `live` commands (`kioskCommandOptions`), but a stored id
 * whose tile were later flipped to `status: 'wip'` would still resolve here and
 * open a pane that renders nothing. Checking liveness would mean importing
 * `services.ts` — and its `@/components/Icons` JSX — into every server module
 * that reads org settings, which is the coupling `commands.ts` exists to
 * avoid. Instead `commands.test.ts` fails the build if a command in the
 * vocabulary stops being live, so retiring one cannot ship without handling
 * the stored defaults that point at it.
 */
export function getKioskDefaultCommand(
  settings: OrgSettings | null | undefined,
): KioskCommandId {
  return parseKioskCommandId(settings?.kiosk?.defaultCommand, KIOSK_FALLBACK_COMMAND);
}

/** The org's comp reasons, falling back to the defaults when unset or empty. */
export function getKioskLineReasons(settings: OrgSettings | null | undefined): KioskLineReasons {
  const comp = settings?.kiosk?.compReasons?.filter((r) => r.trim()) ?? [];
  return { comp: comp.length > 0 ? comp : DEFAULT_LINE_REASONS.comp };
}

/** Per-org photo-analysis settings (see OrgSettingsSchema.photoAnalysis). */
export type PhotoAnalysisSettings = OrgSettings['photoAnalysis'];

export function getPhotoAnalysisSettings(settings: OrgSettings): PhotoAnalysisSettings {
  return settings.photoAnalysis ?? { localVisionBaseUrl: '' };
}

/** Per-org support-assistant settings (see OrgSettingsSchema.support). */
export function getSupportSettings(settings: OrgSettings): OrgSettings['support'] {
  return settings.support ?? {};
}

/** Fulfillment-substitution policy for this org. See OrgSettingsSchema.fulfillment. */
export type SubstitutionEnforcement = OrgSettings['fulfillment']['substitutionEnforcement'];
export type SubstitutionNode = OrgSettings['fulfillment']['substitutionAllowedNodes'][number];

export function getSubstitutionEnforcement(settings: OrgSettings): SubstitutionEnforcement {
  return settings.fulfillment?.substitutionEnforcement ?? 'advisory';
}

export function getSubstitutionAllowedNodes(settings: OrgSettings): SubstitutionNode[] {
  return settings.fulfillment?.substitutionAllowedNodes ?? ['pick'];
}

/**
 * Per-org Universal Incoming policy. See OrgSettingsSchema.inbound + plan §9.6.
 *
 * Raw = the persisted block as stored: `enabledSources` may be absent, meaning
 * the org never explicitly chose (semantics change 2026-07: it used to zod-default
 * to ['zoho','ebay']). Resolved = what product code consumes: `enabledSources`
 * always present, filled by resolveInboundSettings (src/lib/inbound/org-settings.ts)
 * — connection-driven for orgs that never chose, verbatim otherwise.
 */
export type InboundOrgSettingsRaw = OrgSettings['inbound'];
export type InboundOrgSettings = Omit<InboundOrgSettingsRaw, 'enabledSources'> & {
  enabledSources: string[];
};

const DEFAULT_INBOUND_SETTINGS: InboundOrgSettingsRaw = {
  displaySourceAfterMerge: 'ebay',
  zohoOrderNumberFields: ['reference_number', 'notes'],
  autoMergeSignals: ['tracking', 'order_number'],
  fuzzyMergeRequiresReview: true,
  // enabledSources deliberately absent — "never chose"; the resolver derives it.
};

/**
 * Raw accessor for the persisted inbound block. Returns `enabledSources`
 * possibly-undefined ("org never chose"); do NOT read it directly in product
 * code — go through resolveInboundSettings, the single resolution point that
 * fills it (connection-driven default, or the org's explicit choice verbatim).
 */
export function getInboundSettings(settings: OrgSettings): InboundOrgSettingsRaw {
  return settings.inbound ?? DEFAULT_INBOUND_SETTINGS;
}

/**
 * Raw accessor for the persisted GS1 block — the digits exactly as an admin
 * typed them, including a placeholder prefix or a malformed GLN.
 *
 * Do NOT read this in product code. `resolveGs1Identity`
 * (`@/lib/interop/gs1-keys`) is the single resolution point: it drops
 * placeholder prefixes, rejects wrong-length GLNs, and is what everything
 * downstream gates minting on. Splitting it this way keeps the refusal logic
 * beside the standard it enforces rather than in the settings bag.
 */
export function getGs1SettingsRaw(settings: OrgSettings): {
  companyPrefix: string;
  gln: string;
  cbvUriForm: 'urn' | 'webUri';
} {
  const gs1 = settings.gs1 ?? { companyPrefix: '', gln: '', cbvUriForm: 'urn' as const };
  return {
    companyPrefix: (gs1.companyPrefix || '').trim(),
    gln: (gs1.gln || '').trim(),
    cbvUriForm: gs1.cbvUriForm ?? 'urn',
  };
}

type ComplianceAnswers = OrgSettings['compliance'];

const UNANSWERED_COMPLIANCE: ComplianceAnswers = {
  hasNewInventory: null,
  sellsOnAmazon: null,
  gs1Status: null,
  answeredAt: null,
};

/**
 * The tenant's persisted compliance answers, defaulted to "not asked yet".
 *
 * Every absent field reads `null`, never `false` — the whole point of the block
 * is that "has not answered" is distinguishable from "answered no". The policy
 * verdict lives in `resolveGs1Requirement` (`@/lib/interop/gs1-keys`), which is
 * pure and client-safe; this accessor only reads the bag.
 */
export function getComplianceAnswers(settings: OrgSettings): ComplianceAnswers {
  const c = settings.compliance;
  if (!c) return UNANSWERED_COMPLIANCE;
  return {
    hasNewInventory: c.hasNewInventory ?? null,
    sellsOnAmazon: c.sellsOnAmazon ?? null,
    gs1Status: c.gs1Status ?? null,
    answeredAt: (c.answeredAt || '').trim() || null,
  };
}

export type NasStorageTargetKey = keyof typeof DEFAULT_NAS_STORAGE_TARGETS;

export function getNasStorageTarget(
  settings: OrgSettings,
  key: NasStorageTargetKey,
): { root: string; folder: string } {
  const target = settings.nasStorageTargets?.[key] ?? DEFAULT_NAS_STORAGE_TARGETS[key];
  return {
    root: (target.root || '').trim().replace(/\/+$/, ''),
    folder: (target.folder || '').trim().replace(/^\/+|\/+$/g, ''),
  };
}
