/**
 * Guard — `sot-manifest.json` stays a faithful projection of AGENTS.md + live
 * code exports (governance reset 2026-08-12).
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
    maxBuffer: 16 * 1024 * 1024,
  });
}

const hasSymbol = (sym: string) =>
  manifest.entries.some((e) => e.sot === sym || e.symbols.includes(sym));

describe('sot-manifest — parity + coverage', () => {
  it('committed sot-manifest.json equals a fresh build', () => {
    const fresh = runNode('scripts/build-sot-manifest.mjs', ['--stdout']);
    // Compare a BOOLEAN, never the two documents. `assert.equal` on the raw
    // strings printed ~1.2 MB of JSON into the failure — the manifest twice —
    // which drowns the one line that says what to run, and costs an agent its
    // whole context window to read a staleness flag.
    if (committedRaw !== fresh) {
      const a = JSON.parse(committedRaw) as { count: number };
      const b = JSON.parse(fresh) as { count: number };
      assert.fail(
        `sot-manifest.json is stale (committed ${a.count} entries, fresh ${b.count}) — ` +
          'run: node scripts/build-sot-manifest.mjs',
      );
    }
  });

  it('is a non-trivial catalog with a valid entry shape', () => {
    assert.ok(Array.isArray(manifest.entries));
    assert.equal(manifest.count, manifest.entries.length);
    assert.ok(
      manifest.entries.length >= 50,
      `expected >=50 SoT entries, got ${manifest.entries.length}`,
    );
    assert.ok(manifest.sources.includes('AGENTS.md'), 'sources must include AGENTS.md');
    for (const e of manifest.entries) {
      assert.ok(typeof e.job === 'string' && e.job.length >= 2, `entry missing job near ${e.source}`);
      assert.ok(typeof e.source === 'string' && e.source.length > 0);
      assert.ok(Number.isInteger(e.line) && e.line > 0, `entry missing line: ${e.job}`);
      assert.ok(typeof e.sot === 'string' && e.sot.length > 0, `entry missing sot: ${e.job}`);
      assert.ok(Array.isArray(e.symbols), `entry symbols must be an array: ${e.job}`);
      assert.ok(
        e.path || e.guard || e.symbols.length > 0,
        `entry has no code reference: "${e.job}" (${e.source}:${e.line})`,
      );
    }
  });

  it('indexes FEATURE-folder SoTs and design-system primitives', () => {
    for (const sym of [
      'WorkbenchChromeHeader',
      'NonlinearTableHost',
      'StationScanPaneHost',
      'RightRailHost',
      'StackedRowIdentity',
      'OpsKpiBand',
      'MonitorPageShell',
      'Button',
      'Panel',
      'motionRole',
    ]) {
      assert.ok(hasSymbol(sym), `SoT not indexed: ${sym}`);
    }
    const featurePaths = manifest.entries.filter((e) => e.path?.startsWith('src/components/'));
    const dsPaths = manifest.entries.filter(
      (e) => e.path?.startsWith('src/design-system/') || e.path?.startsWith('@/design-system/'),
    );
    assert.ok(featurePaths.length >= 10, `expected >=10 src/components paths, got ${featurePaths.length}`);
    assert.ok(dsPaths.length >= 10, `expected >=10 design-system paths, got ${dsPaths.length}`);
  });

  it('ranked lookup resolves exported hosts by symbol (top-5)', () => {
    const cases: Array<[string, string]> = [
      ['StackedRowIdentity', 'StackedRowIdentity'],
      ['NonlinearTableHost', 'NonlinearTableHost'],
      ['StationScanPaneHost', 'StationScanPaneHost'],
      ['RightRailHost', 'RightRailHost'],
      ['Button', 'Button'],
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
