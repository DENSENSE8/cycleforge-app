/** Per-tenant settings schema + safe parser. */

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
  /** Wordmark painted on the kiosk screensaver when NO attract media is set — two lines, the second letterspaced to the width of the first… */
  attractHeadline: z.string().max(16).optional(),
  attractSubline: z.string().max(24).optional(),
  /** Customer website opened from the public QR interstitial (phone-camera scans of platform Digital Links). */
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
   * Which center command a counter OPENS on — the tablet's first frame and a freshly opened desk session both.
   * Operator 2026-09-15: *"Whenever I go to the kiosk page, it defaults to
   */
  defaultCommand: z.enum(KIOSK_COMMAND_IDS).optional(),
  /** The counter's comp reasons (Square's owner-editable list). */
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
export const ShipFromSchema = z.object({
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
  staffLoginModel: z.enum(['individual', 'shared']).default('individual'),
  // Hard cap on simultaneous active sessions per staff. 0 = unlimited.
  maxConcurrentSessions: z.number().int().min(0).default(0),
  // Warranty term (days) used by the Warranty Claim Logger clock. Per-org,
  // default 30. Resolved via src/lib/warranty/term.ts and snapshotted onto
  // warranty_claims.warranty_days at log time.
  warrantyDays: z.number().int().min(1).max(3650).default(30),
  // Per-station default folder for the receiving NAS photo picker.
  stationNasPhotoFolders: z.record(z.string(), z.string()).default({}),
  // Receiving photos are written straight to the office NAS over WebDAV — the browser PUTs to whichever base URL is `active`.
  nasPhotoServers: z
    .object({
      test: z.string().default(''),
      prod: z.string().default(''),
      active: z.enum(['test', 'prod']).default('prod'),
    })
    .default({ test: '', prod: '', active: 'prod' }),
  // Workflow-specific NAS storage targets.
  nasStorageTargets: z
    .object({
      receiving: NasStorageTargetSchema.default(DEFAULT_NAS_STORAGE_TARGETS.receiving),
      shipping: NasStorageTargetSchema.default(DEFAULT_NAS_STORAGE_TARGETS.shipping),
      claims: NasStorageTargetSchema.default(DEFAULT_NAS_STORAGE_TARGETS.claims),
    })
    .default(DEFAULT_NAS_STORAGE_TARGETS),
  // Per-org packing-checklist enforcement (the "box until matched" toggle).
  packing: z
    .object({
      enforcement: z.enum(['advisory', 'block_until_matched']).default('advisory'),
    })
    .default({ enforcement: 'advisory' }),
  // Per-org photo AI-analysis engine.
  photoAnalysis: z
    .object({
      provider: z.enum(['hermes', 'gcp-vision', 'local-vision', 'catalog']).optional(),
      enabled: z.boolean().optional(),
      localVisionBaseUrl: z.string().default(''),
    })
    .default({ localVisionBaseUrl: '' }),
  // Per-org fulfillment substitution policy — the ordered-vs-fulfilled deviation flow (release the original allocation + allocate a…
  fulfillment: z
    .object({
      substitutionEnforcement: z.enum(['advisory', 'block_until_approved']).default('advisory'),
      substitutionAllowedNodes: z.array(z.enum(['pick', 'test', 'pack'])).default(['pick']),
    })
    .default({ substitutionEnforcement: 'advisory', substitutionAllowedNodes: ['pick'] }),
  // Per-org workflow-engine overrides (flag-gated, default empty).
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
  gs1: z
    .object({
      companyPrefix: z.string().max(12).default(''),
      gln: z.string().max(13).default(''),
      cbvUriForm: z.enum(['urn', 'webUri']).default('urn'),
    })
    .default({ companyPrefix: '', gln: '', cbvUriForm: 'urn' }),
  // What the tenant told us about their inventory and channels — the two facts that decide whether they need a licensed GS1 key at all.
  compliance: z
    .object({
      /** Stocks brand-new / industry-standard-new product, not only used/refurb. */
      hasNewInventory: z.boolean().nullable().default(null),
      /** Sells on Amazon, which enforces GTIN on new listings. */
      sellsOnAmazon: z.boolean().nullable().default(null),
      /** How the tenant gets GTINs, when they need them at all. */
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
  // Support-assistant preferences.
  support: z
    .object({
      visionLane: z.enum(['local-only', 'cloud-multimodal']).optional(),
      vertical: z.string().max(80).optional(),
    })
    .default({}),
  // Org-wide slot-table layouts, keyed by tableId ('orders', …) — the ORG layer of the slot cascade…
  tableLayouts: z.record(z.string(), z.unknown()).optional(),
  // AI provider preferences.
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

/** Does this workspace use the SHARED-account umbrella staff picker (the small- business avenue) instead of per-person email logins? */
export function isSharedStaffAccountOrg(settings: OrgSettings): boolean {
  return settings.staffLoginModel === 'shared';
}

/** Packing-checklist enforcement mode for this org. See OrgSettingsSchema.packing. */
export type PackingEnforcement = OrgSettings['packing']['enforcement'];

export function getPackingEnforcement(settings: OrgSettings): PackingEnforcement {
  return settings.packing?.enforcement ?? 'advisory';
}

/** Which command a counter opens on for this org. */
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

/** Per-org Universal Incoming policy. */
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

/** Raw accessor for the persisted inbound block. */
export function getInboundSettings(settings: OrgSettings): InboundOrgSettingsRaw {
  return settings.inbound ?? DEFAULT_INBOUND_SETTINGS;
}

/** Raw accessor for the persisted GS1 block — the digits exactly as an admin typed them, including a placeholder prefix or a malformed GLN. */
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

/** The tenant's persisted compliance answers, defaulted to "not asked yet". */
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
