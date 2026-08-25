/**
 * Integration manifest — the publishable, drift-guarded description of every
 * connector this product ships.
 *
 * PURE + dependency-free (no db, no network, no fs). The CLI that writes it is
 * `scripts/export-integration-manifest.ts`; the invariants are pinned by
 * `integration-manifest.guard.test.ts`. Both import from here so there is one
 * derivation — a builder living inside the script could not be tested without
 * the script's `process.exit` taking the test runner down with it.
 *
 * ## What it is for
 *
 * The marketing site (`cycleforge.ai`, repo `DENSENSE8/CycleForge`) publishes a
 * page per connector stating what each integration DOES — which data moves, in
 * which direction, how it authenticates. Every one of those facts is already
 * encoded in code that implements the behavior:
 *
 *   - `connectors/registry.ts`                    — BEHAVIOR SoT: capabilities,
 *     auth kind, and which of sync/refresh/validate/pushInventory/reconcile exist.
 *   - `src/lib/integrations/provider-catalog.ts` — DISPLAY SoT: label,
 *     description, category, connect method, docs link.
 *
 * Re-typing those into marketing copy is how a site ends up claiming a
 * capability the product dropped two quarters ago. The copy derives from the
 * code instead, and CI fails when the two disagree.
 *
 * ## FACTS only — never prose
 *
 * The manifest carries label, category, capabilities and direction of flow. The
 * page body — workflow narrative, setup steps, honest limits — is written by a
 * human in the marketing repo and keyed by `key`. Generating 19 near-identical
 * pages from this file alone would be scaled content abuse under Google's spam
 * policies, and demoted as such. This keeps the facts on those pages true; it
 * does not write them.
 *
 * ## No timestamp, on purpose
 *
 * A `generatedAt` field would make every emit a diff, so the drift check would
 * either fail constantly or have to special-case the one field that always
 * changes. The manifest is a pure function of the two registries: if nothing in
 * them moved, the bytes do not move either. Same reasoning as the marketing
 * sitemap's omitted `lastModified`.
 */
import { INTEGRATION_CATEGORIES, PROVIDER_CATALOG } from '@/lib/integrations/provider-catalog';
import { capabilityTitle } from '@/lib/integrations/capability-labels';
import { listConnectors } from '@/lib/integrations/connectors/registry';
import type { Capability } from '@/lib/integrations/connectors/types';

/** POSIX on purpose — this string is byte-compared by the drift check and
 *  pasted into error messages, so a Windows `\` would make two machines
 *  disagree about the same file. */
export const INTEGRATION_MANIFEST_PATH = 'docs/integrations/integration-manifest.json';

/**
 * Vault providers that are infrastructure, not a tenant-facing integration, and
 * so carry no `PROVIDER_CATALOG` entry.
 *
 * An explicit, reasoned list rather than a silent filter. It USED to be asserted
 * by integration-manifest.guard.test.ts — that a provider added to the enum and
 * forgotten in both this list and the display catalog failed CI. That guard was
 * deleted 2026-08-19, so nothing enforces the pairing now; a forgotten provider
 * will silently never reach the marketing site. Still read by the filter below.
 */
const INFRASTRUCTURE_ONLY: Readonly<Record<string, string>> = {
  ably: 'Realtime transport for the app itself — the tenant never connects it.',
  stripe: 'Billing for CycleForge subscriptions, not a tenant-facing data integration.',
};

/**
 * Which hooks a connector implements — i.e. what it can actually do. Derived
 * from the presence of the optional methods on `IntegrationConnector`, so these
 * are facts about the code and cannot describe a flow that was never wired.
 */
export interface ProviderFlows {
  /** Pulls records in (`sync`). Which records is `capabilities`. */
  pullsData: boolean;
  /** Pushes channel stock/price back out (`pushInventory`). */
  pushesInventory: boolean;
  /** Rotates its own tokens (`refresh`) — the connection self-heals. */
  refreshesTokens: boolean;
  /** Live credential check (`validate`, or a `healthPath` route). */
  validates: boolean;
  /** Daily drift-repair pass (`reconcile`). */
  reconciles: boolean;
}

export interface ManifestProvider {
  key: string;
  label: string;
  description: string;
  category: string;
  connect: string;
  authKind: string | null;
  capabilities: Capability[];
  flows: ProviderFlows;
  docsUrl: string | null;
}

/** Not exported: both functions that touch it are exported, and no caller needs
 *  to name the shape. An export nothing imports is a knip finding. */
interface IntegrationManifest {
  $comment: string;
  version: number;
  /** Display order for grouping, straight from `INTEGRATION_CATEGORIES`.
   *
   *  Carried explicitly because `providers` sorts by KEY (so the bytes stay
   *  order-independent), which destroys the curated category sequence — Sales
   *  channels first, AI last. Without this the marketing hub would either
   *  hardcode the order and drift, or sort alphabetically and lead with "AI".
   *  Neither is a thing anyone should have to notice. */
  categories: string[];
  /** `orders` → "Sales channel". The display vocabulary from
   *  `capability-labels.ts`, carried so the marketing site renders the same
   *  words the product does instead of hardcoding its own map and drifting.
   *  Capability-first copy is a house law (never vendor sentences), and this is
   *  what lets a site outside the app repo honour it. */
  capabilityLabels: Record<string, string>;
  providers: ManifestProvider[];
}

export function buildIntegrationManifest(): IntegrationManifest {
  const connectors = new Map(listConnectors().map((c) => [c.provider as string, c]));

  const providers: ManifestProvider[] = PROVIDER_CATALOG.map((p) => {
    const c = connectors.get(p.key);
    return {
      key: p.key,
      label: p.label,
      description: p.description,
      category: p.category,
      connect: p.connect,
      authKind: c?.authKind ?? null,
      // Spread into a fresh array — the registry types these `readonly`, and
      // the serialized order has to be stable for byte comparison.
      capabilities: c ? [...c.capabilities] : [],
      flows: {
        pullsData: Boolean(c?.sync),
        pushesInventory: Boolean(c?.pushInventory),
        refreshesTokens: Boolean(c?.refresh),
        validates: Boolean(c?.validate ?? c?.healthPath),
        reconciles: Boolean(c?.reconcile),
      },
      docsUrl: p.docsUrl ?? null,
    };
  })
    // Sort by key so the bytes do not depend on catalog array order. Without
    // this, reordering a card in Settings reads as manifest drift and sends
    // someone hunting for a behavior change that never happened.
    .sort((a, b) => a.key.localeCompare(b.key));

  return {
    $comment:
      'GENERATED by scripts/export-integration-manifest.ts — do not edit by hand. ' +
      'Facts only; page prose lives in the marketing repo. ' +
      'Regenerate: npm run integrations:manifest -- --emit',
    version: 1,
    categories: [...INTEGRATION_CATEGORIES],
    // Only the capabilities actually in use across connectors. An unused one
    // needs no label on the marketing site, and emitting the full vocabulary
    // would publish words for capabilities the product does not yet ship.
    capabilityLabels: Object.fromEntries(
      [...new Set(providers.flatMap((p) => p.capabilities))]
        .sort()
        .map((cap) => [cap, capabilityTitle(cap)]),
    ),
    providers,
  };
}

/** Canonical bytes. One writer, so `--emit` and the drift check cannot disagree
 *  about trailing newlines or indentation. */
export function serializeIntegrationManifest(manifest: IntegrationManifest): string {
  return JSON.stringify(manifest, null, 2) + '\n';
}

/** Providers in the vault enum that are neither in the display catalog nor
 *  declared infrastructure. Non-empty means a provider nobody accounted for. */
export function findUnaccountedProviders(): string[] {
  const catalogKeys = new Set(PROVIDER_CATALOG.map((p) => p.key));
  return listConnectors()
    .map((c) => c.provider as string)
    .filter((key) => !catalogKeys.has(key) && !(key in INFRASTRUCTURE_ONLY))
    .sort();
}

/** Catalog entries whose key matches no connector. The behavior registry is
 *  `Record<IntegrationProvider, …>` (total over the enum), so a hit here means
 *  the catalog names a provider the vault does not know — a typo, or a card
 *  that outlived its connector.
 *
 *  `registry-parity.test.ts` already asserts this direction; kept here so the
 *  CLI summary can report it without importing a test. */
export function findOrphanCatalogEntries(): string[] {
  const connectorKeys = new Set(listConnectors().map((c) => c.provider as string));
  return PROVIDER_CATALOG.map((p) => p.key)
    .filter((key) => !connectorKeys.has(key))
    .sort();
}
