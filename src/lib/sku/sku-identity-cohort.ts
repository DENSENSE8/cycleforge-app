/**
 * SKU-identity cohort — SoT is **the Zoho item**, and the cohort is every
 * reader and writer of a product title, SKU or photo. Not one file, not one
 * desk: the whole set, because the defect WAS the set disagreeing.
 *
 * Eval: `pnpm run eval:cohort sku-identity`
 *
 * Law module: {@link ../sku/sku-identity-law} (`SKU_CATALOG_JOIN_ON_SQL`,
 * `resolveSkuIdentityTitle`, `skuCatalogNoZohoTwinPredicateSql`).
 * Verdict tool: `ds_sku_identity` · CLI: `scripts/sku-identity-guard.ts`
 * Gate: `Sku identity` (`always`) in `verify:fast`.
 *
 * ## What the cohort exists to stop
 *
 * `/api/sku-catalog/sync-ecwid-titles` overwrote `sku_catalog.product_title`
 * for every SKU-string match, Zoho-owned rows included. Measured on prod
 * 2026-09-15, immediately before migration `2026-09-15g_sku_identity_zoho_sot`:
 *
 * | measurement | value |
 * |---|---|
 * | catalog rows with an exact active Zoho twin | 1118 / 1118 |
 * | … whose `product_title` disagreed with `items.name` | **132** |
 * | … whose `product_title` was byte-equal to a listing title | **155** |
 * | catalog `image_url` shadowing a Zoho item photo | **132 / 139** |
 * | receiving lines where the exact org-scoped join disagreed with `rz.zoho_item_id` | **0 / 2862** |
 *
 * Operator faces: catalog `00143` read *"1x Original Bose UB-20 Wall Mount"*
 * where Zoho says *Bose Solo Soundbar Series II*; `00031` read *"Bose SoundDock
 * 10 remote control"* where Zoho says *Bose Wave Music System*; `00017` read a
 * CineMate remote where Zoho says *Bose Wave Radio II*; `00010` a 321 wall
 * bracket where Zoho says *Bose Wave Audio System Radio/CD*. So the same
 * carton (PO `10-15153-01528`, line 32354) painted a soundbar on the PO desk
 * and a wall mount in Move photos.
 *
 * ## The key was never broken — the column was
 *
 * The read paths had been "fixed" with a `similarity(sc.product_title, …) >=
 * 0.25` join predicate. That is a contamination detector in a read path: it
 * discards a CORRECT catalog row, and the six readers that never copied it
 * rendered the marketplace product with full confidence. The predicate is
 * DELETED. `(organization_id, sku)` is already UNIQUE, no Zoho SKU maps to two
 * item ids, and the exact join never disagreed once across 2862 lines.
 *
 * ## Refusals
 *
 * Agents asked to re-add a `similarity()` gate on `product_title` in a read
 * path MUST refuse — fix the write side. Agents asked to hand-write a
 * `sku_catalog` join off a receiving line MUST refuse and use
 * `SKU_CATALOG_JOIN_ON_SQL`. Agents asked to spell a new title ladder MUST
 * refuse and call `resolveSkuIdentityTitle`. Agents asked to let a platform
 * sync fill `sku_catalog.product_title` / `image_url` without
 * `skuCatalogNoZohoTwinPredicateSql()` MUST refuse — marketplace copy belongs
 * in `sku_platform_ids.display_name` / `listing_title`.
 *
 * The marketplace title is NOT the enemy: 755 of 2862 receiving lines carry no
 * `zoho_item_id`, and 315 catalog rows have no Zoho twin. For those the
 * marketplace name IS the identity. The law is precedence, not deletion.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  auditSkuIdentitySource,
  formatSkuIdentityViolation,
  SKU_IDENTITY_REFUSAL,
  SKU_IDENTITY_TITLE_ORDER,
  type SkuIdentityViolation,
} from './sku-identity-law';

export const SKU_IDENTITY_COHORT_TRIPWIRE = 'src/lib/sku/sku-identity-law.test.ts' as const;

export const SKU_IDENTITY_COHORT_LEDGER = 'docs/eval/cohorts/sku-identity/LEDGER.md' as const;

export const SKU_IDENTITY_COHORT_SNAPSHOTS =
  'docs/eval/cohorts/sku-identity/snapshots' as const;

/**
 * The engine: one law module, one guard, one gate, plus the two SQL fragments
 * that are the only sanctioned way to reach a catalog title or photo.
 */
export const SKU_IDENTITY_ENGINE = {
  law: 'src/lib/sku/sku-identity-law.ts',
  guard: 'scripts/sku-identity-guard.ts',
  imageLadder: 'src/lib/receiving/lines/sql-receiving-image.ts',
  titleLadder: 'src/lib/receiving/po-group-title.ts',
  migration: 'src/lib/migrations/2026-09-15g_sku_identity_zoho_sot.sql',
  graphSymbols: [
    'resolveSkuIdentityTitle',
    'skuCatalogNoZohoTwinPredicateSql',
    'receivingProductTitle',
    'resolvePhotoMoveTargetTitle',
  ] as const,
  critiqueFiles: [
    'src/lib/sku/sku-identity-law.ts',
    'src/lib/receiving/po-group-title.ts',
    'src/lib/receiving/photo-move-targets-shared.ts',
    'src/lib/receiving/lines/sql-receiving-image.ts',
  ] as const,
} as const;

/**
 * Every reader that resolves a product title, SKU or photo beside a receiving
 * line. The cohort is the PEER SET: a fix proven on one of these and not the
 * rest is exactly the failure this cohort reports.
 */
export const SKU_IDENTITY_PEERS = [
  { id: 'po-desk', file: 'src/lib/receiving/lines/build-sql.ts', surface: 'PO / line desk + list' },
  {
    id: 'po-desk-fixture',
    file: 'src/lib/receiving/lines/legacy-route-sql.fixture.ts',
    surface: 'byte-parity fixture for build-sql',
  },
  {
    id: 'move-photos',
    file: 'src/lib/receiving/photo-move-targets.ts',
    surface: 'Move photos carton picker',
  },
  {
    id: 'carton-api',
    file: 'src/app/api/receiving/[id]/route.ts',
    surface: 'carton lines API',
  },
  {
    id: 'lookup-po',
    file: 'src/app/api/receiving/lookup-po/route.ts',
    surface: 'scan lookup + line image_url (7 response paths)',
  },
  {
    id: 'label-identify',
    file: 'src/lib/receiving/label-identify.ts',
    surface: 'label OCR → catalog match',
  },
  {
    id: 'ecwid-title-sync',
    file: 'src/app/api/sku-catalog/sync-ecwid-titles/route.ts',
    surface: 'WRITER — platform title/image fill',
  },
  {
    id: 'pairing',
    file: 'src/lib/neon/sku-catalog-queries.ts',
    surface: 'WRITER — pairEcwidToZoho image backfill',
  },
  {
    id: 'sku-resolver',
    file: 'src/lib/inventory/resolve-sku-catalog.ts',
    surface: 'leading-zero-stripped operator input resolution',
  },
] as const;

/** Presence predicates — the engine files must match. */
export const SKU_IDENTITY_ENGINE_CONTRACT = {
  joinConstantExact: /sc\.sku = rl\.sku AND sc\.organization_id = rl\.organization_id/,
  ladderZohoFirst: /'zoho_item_title',\s*\n\s*'catalog_product_title'/,
  twinPredicateOrgAligned: /i\.organization_id = \$\{alias\}\.organization_id/,
  imageLadderRefusesCatalog: /ELSE sc\.image_url/,
  imageLadderPrefersZoho: /'\/api\/zoho\/items\/' \|\| i\.zoho_item_id \|\| '\/image'/,
} as const;

/** Absence predicates — the shapes that produced the defect. */
export const SKU_IDENTITY_FORBIDDEN = {
  /**
   * The deleted read-path contamination detector: a catalog title compared
   * against a RECEIVING LINE to decide whether the join may attach.
   *
   * Scoped to that comparison on purpose. `similarity(LOWER(sc.product_title),
   * …)` against a free-text needle is a legitimate title→catalog SEARCH
   * (`resolveSkuCatalogIdsByTitles`, `pair-suggestions`), not an identity gate,
   * and forbidding it outright would be a false verdict.
   */
  similarityTitleGate:
    /similarity\s*\(\s*LOWER\(sc\.product_title\)\s*,\s*LOWER\(COALESCE\(rl\./,
  /** A marketplace-first ladder head. */
  marketplaceTitleFirst: /catalog_product_title\s*\|\|\s*\n?\s*(?:row|line)\.zoho_item_title/,
  /** A bare catalog image beside a receiving line. */
  bareCatalogImage: /^\s*sc\.image_url,\s*$/m,
} as const;

export const SKU_IDENTITY_READ_LAW = {
  key: 'sku_catalog is reached by SKU_CATALOG_JOIN_ON_SQL — exact, org-scoped. Never zero-stripped, never similarity-gated, never tenant-blind.',
  title: `resolveSkuIdentityTitle: ${SKU_IDENTITY_TITLE_ORDER.join(' → ')}. Returns '' when nothing is present; the caller keeps its own last resort.`,
  photo:
    'RECEIVING_LINE_IMAGE_URL_SQL — Zoho item photo when the item exists, catalog image only when it does not. Never select bare sc.image_url beside a line.',
  ownership:
    'A Zoho-twinned row\'s product_title / image_url belong to Zoho. A platform sync writes them only behind skuCatalogNoZohoTwinPredicateSql(). Marketplace copy lives in sku_platform_ids.display_name / listing_title.',
  stub: "The 'Unfound PO' stub is a placeholder, not a product — a real later field outranks it on every surface.",
} as const;

/**
 * Known tenancy ceiling — documented, not silent, and NOT a licence to widen.
 * `sku_catalog_sku_key UNIQUE (sku)` is tenant-blind (tenant B can never hold
 * SKU 00143) but cannot be dropped while `fk_bin_contents_sku` references
 * `sku_catalog(sku)`. Measured 2026-09-15: 7 rows in `bin_contents`.
 * Its own gated increment: repoint the FK at `sku_catalog(id)` or at
 * `(organization_id, sku)`, then drop the index.
 */
export const SKU_IDENTITY_KNOWN_DEBT: readonly string[] = [
  'sku_catalog_sku_key UNIQUE (sku) — tenant-blind; blocked by fk_bin_contents_sku → sku_catalog(sku)',
  'provider_item_id colour-variant mispairs (8 rows, e.g. catalog 00031-WY → Zoho 00031-CW) — operator decision, never a backfill guess',
];

export type SkuIdentityReport = {
  scanned: number;
  violations: readonly SkuIdentityViolation[];
  byKind: Readonly<Record<string, number>>;
  peerCoverage: readonly { id: string; file: string; usesEngine: boolean; note: string }[];
};

/**
 * Cohort discovery — the peer-coverage matrix plus every live violation.
 *
 * Deliberately reuses {@link auditSkuIdentitySource} rather than re-scanning:
 * the cohort, the tripwire, the `Sku identity` gate and `ds_sku_identity` must
 * be incapable of disagreeing.
 */
export function discoverSkuIdentity(
  repoRoot = process.cwd(),
  files: readonly string[] = [],
): SkuIdentityReport {
  const violations: SkuIdentityViolation[] = [];
  for (const rel of files) {
    let text: string;
    try {
      text = readFileSync(join(repoRoot, rel), 'utf8');
    } catch {
      continue;
    }
    violations.push(...auditSkuIdentitySource(rel, text));
  }

  const byKind: Record<string, number> = {};
  for (const v of violations) byKind[v.kind] = (byKind[v.kind] ?? 0) + 1;

  const peerCoverage = SKU_IDENTITY_PEERS.map((peer) => {
    let text = '';
    try {
      text = readFileSync(join(repoRoot, peer.file), 'utf8');
    } catch {
      return { id: peer.id, file: peer.file, usesEngine: false, note: 'unreadable' };
    }
    const writer = peer.surface.startsWith('WRITER');
    const usesEngine = writer
      ? /skuCatalogNoZohoTwinPredicateSql/.test(text)
      : /SKU_CATALOG_JOIN_ON_SQL|resolveSkuIdentityTitle|RECEIVING_LINE_IMAGE_URL_SQL|NO_ZOHO_TWIN_SQL|organization_id = i\.organization_id/.test(
          text,
        );
    return {
      id: peer.id,
      file: peer.file,
      usesEngine,
      note: writer ? 'write-side: Zoho-twin predicate' : peer.surface,
    };
  });

  return { scanned: files.length, violations, byKind, peerCoverage };
}

export function formatSkuIdentityDiscoverMarkdown(report: SkuIdentityReport): {
  peers: string;
  violations: string;
} {
  const peers = [
    `| Peer | File | Uses engine | Surface |`,
    `|---|---|---|---|`,
    ...report.peerCoverage.map(
      (p) => `| ${p.id} | \`${p.file}\` | ${p.usesEngine ? 'yes' : '**NO**'} | ${p.note} |`,
    ),
  ].join('\n');

  const violations =
    report.violations.length === 0
      ? `_No violations across ${report.scanned} scanned files._`
      : [
          ...report.violations.map((v) => `- ${formatSkuIdentityViolation(v)}`),
          '',
          SKU_IDENTITY_REFUSAL,
        ].join('\n');

  return { peers, violations };
}

export type SkuIdentityEvalManifest = {
  id: 'sku-identity';
  label: string;
  ledger: string;
  snapshotsDir: string;
  critiqueFiles: readonly string[];
  graphSymbols: readonly string[];
  tripwires: readonly string[];
};

export function skuIdentityEvalManifest(): SkuIdentityEvalManifest {
  return {
    id: 'sku-identity',
    label:
      'One SKU, one title, one photo — the Zoho item governs; exact org-scoped catalog join; no platform write over a Zoho-owned row',
    ledger: SKU_IDENTITY_COHORT_LEDGER,
    snapshotsDir: SKU_IDENTITY_COHORT_SNAPSHOTS,
    critiqueFiles: SKU_IDENTITY_ENGINE.critiqueFiles,
    graphSymbols: SKU_IDENTITY_ENGINE.graphSymbols,
    tripwires: [SKU_IDENTITY_COHORT_TRIPWIRE, 'src/lib/sku/sku-identity-cohort.test.ts'],
  };
}
