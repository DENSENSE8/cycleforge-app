/**
 * Guard — `sot-manifest.json` is a faithful, up-to-date projection of the
 * design-system SoT rules (DS fork-consolidation program — Phase 1 slice 1c).
 *
 * The manifest is a machine-readable catalog `{ job → { sot, path, guard } }`
 * built from `AGENTS.md` + `.claude/rules/**` by `scripts/build-sot-manifest.mjs`,
 * so an agent can discover the SoT for a job BEFORE composing a surface (and not
 * re-fork beside it). This guard is the prose↔artifact parity contract (the D12
 * discipline applied to the catalog itself): edit a rule → regenerate, or CI
 * fails here. It also asserts the catalog actually indexes FEATURE-folder SoTs
 * (not just `src/design-system/`) and that ranked lookup resolves real jobs.
 *
 * Subprocess-driven on purpose — it exercises the shipped CLIs end-to-end
 * (`build-sot-manifest.mjs --stdout`, `sot-lookup.mjs --json`) rather than
 * re-importing their logic, so a divergence between the tools and this test is
 * impossible.
 *
 * Run: node --import tsx --test src/lib/sot-manifest/sot-manifest.guard.test.ts
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = process.cwd();
const MANIFEST = join(ROOT, 'sot-manifest.json');
const committedRaw = readFileSync(MANIFEST, 'utf8');
const manifest = JSON.parse(committedRaw) as {
  count: number;
  sources: string[];
  entries: Array<{
    job: string;
    sot: string;
    path: string | null;
    guard: string | null;
    symbols: string[];
    kind: string;
    source: string;
    line: number;
    snippet: string;
  }>;
};

function runNode(scriptRel: string, args: string[]): string {
  return execFileSync('node', [join(ROOT, scriptRel), ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
}

const hasSymbol = (sym: string) =>
  manifest.entries.some((e) => e.sot === sym || e.symbols.includes(sym));

describe('sot-manifest — parity + coverage (1c)', () => {
  it('committed sot-manifest.json equals a fresh build (regenerate on rule edits)', () => {
    const fresh = runNode('scripts/build-sot-manifest.mjs', ['--stdout']);
    assert.equal(
      committedRaw,
      fresh,
      'sot-manifest.json is stale — run: node scripts/build-sot-manifest.mjs',
    );
  });

  it('is a non-trivial catalog with a valid entry shape', () => {
    assert.ok(Array.isArray(manifest.entries), 'entries must be an array');
    assert.equal(manifest.count, manifest.entries.length, 'count must equal entries.length');
    assert.ok(
      manifest.entries.length >= 200,
      `expected >=200 SoT entries, got ${manifest.entries.length}`,
    );
    for (const e of manifest.entries) {
      assert.ok(typeof e.job === 'string' && e.job.length >= 2, `entry missing job near ${e.source}`);
      assert.ok(typeof e.source === 'string' && e.source.length > 0, 'entry missing source');
      assert.ok(Number.isInteger(e.line) && e.line > 0, `entry missing line: ${e.job}`);
      assert.ok(typeof e.sot === 'string' && e.sot.length > 0, `entry missing sot: ${e.job}`);
      assert.ok(Array.isArray(e.symbols), `entry symbols must be an array: ${e.job}`);
      // Every entry must carry at least one real code reference — that is what
      // distinguishes an SoT row from ordinary rule prose.
      assert.ok(
        e.path || e.guard || e.symbols.length > 0,
        `entry has no code reference: "${e.job}" (${e.source}:${e.line})`,
      );
    }
  });

  it('indexes FEATURE-folder SoTs, not only src/design-system/', () => {
    for (const sym of [
      'WorkbenchChromeHeader',
      'ReceivingBoxChromeActions',
      'OutboundOrderChromeActions',
      'NonlinearTableHost',
      'LedgerGridColumnHeader',
      'StackedRowIdentity',
      'OpsKpiBand',
      'InspectorActionFloor',
    ]) {
      assert.ok(hasSymbol(sym), `feature-folder SoT not indexed: ${sym}`);
    }
    const featurePaths = manifest.entries.filter((e) => e.path?.startsWith('src/components/'));
    const dsPaths = manifest.entries.filter(
      (e) => e.path?.startsWith('src/design-system/') || e.path?.startsWith('@/design-system/'),
    );
    assert.ok(featurePaths.length >= 10, `expected >=10 src/components paths, got ${featurePaths.length}`);
    assert.ok(dsPaths.length >= 10, `expected >=10 design-system paths, got ${dsPaths.length}`);
  });

  it('ranked lookup resolves real jobs to their SoT (top-5)', () => {
    const cases: Array<[string, string]> = [
      ['stacked row identity', 'StackedRowIdentity'],
      ['kpi band snap collapse', 'WorkbenchKpiBand'],
      ['table definition registry', 'NonlinearTableHost'],
      ['right-rail record inspector header', 'PaneHeader'],
      ['honest absence', 'GridCellDash'],
    ];
    for (const [query, expected] of cases) {
      const out = runNode('scripts/sot-lookup.mjs', ['--json', '-n', '5', query]);
      const { hits } = JSON.parse(out) as { hits: Array<{ sot: string; symbols: string[] }> };
      const found = hits.some((h) => h.sot === expected || h.symbols.includes(expected));
      assert.ok(
        found,
        `lookup "${query}" did not surface ${expected} in top-5 (got: ${hits.map((h) => h.sot).join(', ')})`,
      );
    }
  });
});
