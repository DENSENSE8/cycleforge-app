/**
 * Assembly-boundary physics are wired (depcruise error rules + verify gate).
 * The cruise itself lives in `scripts/depcruise-gate.mjs` (CI); this test
 * pins the rule names so a rename cannot silently drop the shield.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = process.cwd();

describe('assembly import boundaries', () => {
  it('depcruise forbids importing host internals from feature routes', () => {
    const cfg = readFileSync(join(ROOT, '.dependency-cruiser.cjs'), 'utf8');
    for (const name of [
      'use-the-sheet-not-the-scroll-shell',
      'use-the-scan-host-not-the-utility-rail',
      'use-the-panel-root-not-the-ambient-wash',
    ]) {
      assert.match(cfg, new RegExp(`name: '${name}'`));
    }
    assert.match(cfg, /DashboardScrollShell/);
    assert.match(cfg, /ScanStationUtilityRail/);
    assert.match(cfg, /StationAmbientWash/);
  });

  it('verify and CI run the quiet depcruise gate', () => {
    const verify = readFileSync(join(ROOT, 'scripts/verify.mjs'), 'utf8');
    const ci = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8');
    assert.match(verify, /depcruise-gate\.mjs/);
    assert.match(ci, /depcruise-gate\.mjs/);
  });

  it('Button/Panel override bans live in the shared no-restricted-syntax block', () => {
    const eslint = readFileSync(join(ROOT, 'eslint.config.mjs'), 'utf8');
    assert.match(eslint, /name\.name='Button'/);
    assert.match(eslint, /name\.name='Panel'/);
    assert.match(eslint, /slate\|gray\|zinc\|neutral/);
    assert.match(eslint, /Literal\[value=\/rounded\/\]/);
  });
});
