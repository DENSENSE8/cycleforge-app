import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import {
  discoverSkuIdentity,
  skuIdentityEvalManifest,
  SKU_IDENTITY_ENGINE,
  SKU_IDENTITY_ENGINE_CONTRACT,
  SKU_IDENTITY_FORBIDDEN,
  SKU_IDENTITY_KNOWN_DEBT,
  SKU_IDENTITY_PEERS,
  SKU_IDENTITY_READ_LAW,
} from './sku-identity-cohort';

const REPO = path.resolve(__dirname, '../../..');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(path.relative(REPO, full));
  }
  return out;
}

const SRC_FILES = walk(path.join(REPO, 'src'));

test('the engine files exist and satisfy their presence contract', () => {
  const law = readFileSync(path.join(REPO, SKU_IDENTITY_ENGINE.law), 'utf8');
  const image = readFileSync(path.join(REPO, SKU_IDENTITY_ENGINE.imageLadder), 'utf8');

  assert.match(law, SKU_IDENTITY_ENGINE_CONTRACT.joinConstantExact);
  assert.match(law, SKU_IDENTITY_ENGINE_CONTRACT.ladderZohoFirst);
  assert.match(law, SKU_IDENTITY_ENGINE_CONTRACT.twinPredicateOrgAligned);
  assert.match(image, SKU_IDENTITY_ENGINE_CONTRACT.imageLadderPrefersZoho);
  assert.match(image, SKU_IDENTITY_ENGINE_CONTRACT.imageLadderRefusesCatalog);
});

test('no peer carries a forbidden shape', () => {
  for (const peer of SKU_IDENTITY_PEERS) {
    const src = readFileSync(path.join(REPO, peer.file), 'utf8');
    for (const [name, re] of Object.entries(SKU_IDENTITY_FORBIDDEN)) {
      assert.ok(!re.test(src), `${peer.file} carries forbidden shape ${name}`);
    }
  }
});

test('EVERY peer reaches identity through the engine — the cohort is the set', () => {
  const report = discoverSkuIdentity(REPO, SRC_FILES);
  const uncovered = report.peerCoverage.filter((p) => !p.usesEngine);
  assert.deepEqual(
    uncovered.map((p) => `${p.id} (${p.file})`),
    [],
    'a peer resolving identity without the engine is the drift this cohort reports',
  );
});

test('the tree is free of identity violations', () => {
  const report = discoverSkuIdentity(REPO, SRC_FILES);
  assert.deepEqual(
    report.violations.map((v) => `${v.kind} ${v.file}:${v.line}`),
    [],
  );
  assert.deepEqual(report.byKind, {});
});

test('known debt is shrink-only and names its blocker', () => {
  // Two entries as of 2026-09-15. Appending to go green is prohibited — the
  // list only shrinks, and each row must say what blocks it.
  assert.equal(SKU_IDENTITY_KNOWN_DEBT.length, 2);
  for (const row of SKU_IDENTITY_KNOWN_DEBT) {
    assert.match(row, /blocked by|operator decision/);
  }
});

test('the read law names all four rules', () => {
  assert.deepEqual(Object.keys(SKU_IDENTITY_READ_LAW), [
    'key',
    'title',
    'photo',
    'ownership',
    'stub',
  ]);
  assert.match(SKU_IDENTITY_READ_LAW.title, /zoho_item_title → catalog_product_title/);
});

test('the manifest points at ledger, snapshots and its own tripwires', () => {
  const m = skuIdentityEvalManifest();
  assert.equal(m.id, 'sku-identity');
  assert.equal(m.ledger, 'docs/eval/cohorts/sku-identity/LEDGER.md');
  assert.ok(m.tripwires.includes('src/lib/sku/sku-identity-cohort.test.ts'));
  assert.ok(m.graphSymbols.includes('resolveSkuIdentityTitle'));
  assert.ok(m.critiqueFiles.length >= 4);
});
