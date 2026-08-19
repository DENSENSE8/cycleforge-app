/**
 * Contract for verify profiles: dogfood is the tenant click-through slice,
 * not a silent subset that can pick up knip/jscpd.
 */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = process.cwd();
const PROFILE_MOD = join(ROOT, 'scripts/verify-profile.mjs');

const FAST_GATES = ['Lint', 'Typecheck'];
const DOGFOOD_GATES = [
  ...FAST_GATES,
  'Route-auth enforce',
  'Schema drift',
  'Schema model parity (live)',
];
const FULL_HYGIENE = [
  'Unit tests + structural guards',
  'Dead-code (knip)',
  'Route-permission drift',
  'Integration manifest drift',
  'Tenancy isolation (static)',
  'Clone baseline (jscpd)',
  'Assembly boundaries (depcruise)',
  'Doc catalog drift',
];

async function loadProfile() {
  return import(pathToFileURL(PROFILE_MOD).href) as Promise<{
    resolveVerifyProfile: (argv: string[]) => 'fast' | 'dogfood' | 'full';
    gatesForProfile: (p: 'fast' | 'dogfood' | 'full') => { name: string }[];
  }>;
}

describe('verify profiles', () => {
  it('resolves --fast / --dogfood / default, and rejects both flags', async () => {
    const { resolveVerifyProfile } = await loadProfile();
    assert.equal(resolveVerifyProfile(['node', 'verify.mjs']), 'full');
    assert.equal(resolveVerifyProfile(['node', 'verify.mjs', '--fast']), 'fast');
    assert.equal(resolveVerifyProfile(['node', 'verify.mjs', '--dogfood']), 'dogfood');
    assert.throws(
      () => resolveVerifyProfile(['node', 'verify.mjs', '--fast', '--dogfood']),
      /only one of --fast or --dogfood/,
    );
  });

  it('dogfood is lint + tsc + route-auth enforce + schema, never knip/jscpd/tests', async () => {
    const { gatesForProfile } = await loadProfile();
    assert.deepEqual(
      gatesForProfile('fast').map((g) => g.name),
      FAST_GATES,
    );
    assert.deepEqual(
      gatesForProfile('dogfood').map((g) => g.name),
      DOGFOOD_GATES,
    );
    const fullNames = gatesForProfile('full').map((g) => g.name);
    for (const name of DOGFOOD_GATES) assert.ok(fullNames.includes(name), `full missing ${name}`);
    for (const name of FULL_HYGIENE) {
      assert.ok(fullNames.includes(name), `full missing hygiene ${name}`);
      assert.ok(!DOGFOOD_GATES.includes(name), `dogfood must not include ${name}`);
    }
  });
});
