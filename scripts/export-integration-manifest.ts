/**
 * Integration manifest CLI — emit / check / summarize.
 *
 * Thin wrapper over `src/lib/integrations/manifest.ts`, which holds the pure
 * derivation and its rationale. Mirrors `scripts/audit-route-auth.ts`, the house
 * pattern for "generate an artifact, then guard it".
 *
 *   npm run integrations:manifest             # human summary
 *   npm run integrations:manifest -- --emit   # write the canonical JSON
 *   npm run integrations:manifest -- --check  # fail on drift (CI gate)
 *
 * `--check` is wired into `scripts/verify.mjs`. It answers one question — is the
 * committed JSON stale? The COVERAGE invariants (every provider accounted for,
 * infrastructure exclusions still real) are pinned separately by
 * `src/lib/integrations/integration-manifest.guard.test.ts`, because a check
 * that only compares bytes goes green the moment someone re-emits, whether or
 * not the underlying state is sane.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';

import {
  INTEGRATION_MANIFEST_PATH,
  buildIntegrationManifest,
  findOrphanCatalogEntries,
  findUnaccountedProviders,
  serializeIntegrationManifest,
  type ManifestProvider,
} from '@/lib/integrations/manifest';

const FIX_HINT = '  Fix: run `npm run integrations:manifest -- --emit` and commit the result.';

function emit(): number {
  const manifest = buildIntegrationManifest();
  mkdirSync(dirname(INTEGRATION_MANIFEST_PATH), { recursive: true });
  writeFileSync(INTEGRATION_MANIFEST_PATH, serializeIntegrationManifest(manifest), 'utf8');
  console.log(`Wrote ${manifest.providers.length} providers to ${INTEGRATION_MANIFEST_PATH}`);
  return 0;
}

function check(): number {
  const manifest = buildIntegrationManifest();
  const expected = serializeIntegrationManifest(manifest);

  let committed: string;
  try {
    committed = readFileSync(INTEGRATION_MANIFEST_PATH, 'utf8');
  } catch (err) {
    console.error(`Failed to read committed manifest at ${INTEGRATION_MANIFEST_PATH}: ${err}`);
    console.error(FIX_HINT);
    return 1;
  }

  if (committed !== expected) {
    console.error('Integration manifest is stale — the registries changed but the manifest did not.');
    console.error(`  ${INTEGRATION_MANIFEST_PATH}`);
    console.error(FIX_HINT);
    console.error('  (The marketing site reads this file; leaving it stale ships copy that');
    console.error('   describes connectors the product no longer has.)');
    return 1;
  }

  console.log(`Integration manifest is current (${manifest.providers.length} providers).`);
  return 0;
}

function summarize(): number {
  const manifest = buildIntegrationManifest();

  const byCategory = new Map<string, ManifestProvider[]>();
  for (const p of manifest.providers) {
    const list = byCategory.get(p.category) ?? [];
    list.push(p);
    byCategory.set(p.category, list);
  }

  for (const [category, list] of [...byCategory].sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`\n${category}`);
    for (const p of list) {
      const flows = Object.entries(p.flows)
        .filter(([, on]) => on)
        .map(([name]) => name);
      console.log(
        `  ${p.label.padEnd(28)} ${p.capabilities.join(', ') || '—'}` +
          (flows.length ? `  [${flows.join(' ')}]` : ''),
      );
    }
  }

  console.log(`\n${manifest.providers.length} providers, ${byCategory.size} categories.`);

  // Surfaced here as well as in the guard so a developer running the summary by
  // hand sees the same problem CI would fail on, without having to guess which
  // test to read.
  const unaccounted = findUnaccountedProviders();
  const orphans = findOrphanCatalogEntries();
  if (unaccounted.length) console.log(`Unaccounted providers: ${unaccounted.join(', ')}`);
  if (orphans.length) console.log(`Orphan catalog entries: ${orphans.join(', ')}`);

  return 0;
}

function main(): number {
  const argv = process.argv.slice(2);
  if (argv.includes('--emit')) return emit();
  if (argv.includes('--check')) return check();
  return summarize();
}

process.exit(main());
