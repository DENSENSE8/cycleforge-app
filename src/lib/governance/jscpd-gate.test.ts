/**
 * jscpd shrink-only clone baseline (Phase 1b).
 *
 * Drives the real verify-wired gate (`scripts/jscpd-gate.mjs`), then proves a
 * new same-usecase clone fails while the parked baseline does not grow.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = process.cwd();
const GATE = join(ROOT, 'scripts/jscpd-gate.mjs');
const BASELINE = join(ROOT, 'jscpd-baseline.json');
const CONFIG = join(ROOT, '.jscpd.json');
const PROBE = join(ROOT, 'src/jscpd-clone-probe.ts');

function runGate(): { status: number; out: string } {
  try {
    const out = execFileSync(process.execPath, [GATE], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: 0, out };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { status: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

describe('jscpd shrink-only clone baseline', () => {
  it('jscpd is wired: config + baseline + gate script exist', () => {
    assert.ok(existsSync(CONFIG), '.jscpd.json missing');
    assert.ok(existsSync(BASELINE), 'jscpd-baseline.json missing — seed with node scripts/jscpd-gate.mjs --write');
    assert.ok(existsSync(GATE));
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      devDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };
    assert.ok(pkg.devDependencies?.jscpd, 'jscpd must be a project devDependency');
    const verify = readFileSync(join(ROOT, 'scripts/verify.mjs'), 'utf8');
    assert.match(verify, /jscpd-gate\.mjs/);
    const ignore = readFileSync(CONFIG, 'utf8');
    assert.match(ignore, /\*-grid-layout\.ts/);
    assert.match(ignore, /receiving-grid\/cells/);
    assert.match(ignore, /DataTable/);
    assert.match(ignore, /StationDisplaysPushStack/);
    assert.match(ignore, /RightRailHost/);
    const gate = readFileSync(GATE, 'utf8');
    assert.match(gate, /hardware-wall\.mjs/, 'gate must filter station-vs-support via the hardware wall');
  });

  it('the live clone count does not exceed the shrink-only baseline', () => {
    const { status, out } = runGate();
    assert.equal(status, 0, out);
    assert.match(out, /jscpd-gate: ok/);
  });

  it('a new near-duplicate clone fails the gate', () => {
    const body = Array.from({ length: 20 }, (_, i) => `  const n${i} = ${i} * ${i + 3};`).join('\n');
    const src = `export function jscpdProbeAlpha(x: number): number {\n${body}\n  return x;\n}\nexport function jscpdProbeBeta(x: number): number {\n${body}\n  return x;\n}\n`;
    writeFileSync(PROBE, src);
    execFileSync('git', ['add', '-f', PROBE], { cwd: ROOT });
    try {
      const { status, out } = runGate();
      assert.notEqual(status, 0, 'expected the new clone to fail the shrink-only baseline');
      assert.match(out, /clones grew|jscpd-gate/);
    } finally {
      if (existsSync(PROBE)) unlinkSync(PROBE);
      execFileSync('git', ['reset', '-q', 'HEAD', '--', PROBE], { cwd: ROOT });
    }
  });

  it('a station-vs-support visual twin does not fail the gate', () => {
    const body = Array.from({ length: 24 }, (_, i) => `  const w${i} = ${i} * ${i + 7};`).join('\n');
    const src = `export function jscpdHardwareWallProbe(x: number): number {\n${body}\n  return x;\n}\n`;
    const floorProbe = join(ROOT, 'src/components/station/jscpd-hardware-wall-probe.ts');
    const deskProbe = join(ROOT, 'src/components/support/jscpd-hardware-wall-probe.ts');
    writeFileSync(floorProbe, src);
    writeFileSync(deskProbe, src);
    try {
      const { status, out } = runGate();
      assert.equal(status, 0, `cross-hardware clone must be filtered, not fail:\n${out}`);
      assert.match(out, /jscpd-gate: ok/);
    } finally {
      if (existsSync(floorProbe)) unlinkSync(floorProbe);
      if (existsSync(deskProbe)) unlinkSync(deskProbe);
    }
  });
});
