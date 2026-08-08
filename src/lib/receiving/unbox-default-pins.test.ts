import assert from 'node:assert/strict';
import { test } from 'node:test';

import { resolveUnboxPinnedTabs } from './unbox-default-pins';

test('staff override wins over role and org (resolve order)', () => {
  assert.deepEqual(
    resolveUnboxPinnedTabs({ staffPins: ['incoming'], roleDefault: [], orgDefault: [] }),
    ['incoming'],
  );
  // A staffer who explicitly cleared their strip ([]) keeps it empty — never
  // re-inherits role/org (absent = inherit, [] = staff cleared).
  assert.deepEqual(
    resolveUnboxPinnedTabs({ staffPins: [], roleDefault: ['incoming'], orgDefault: ['incoming'] }),
    [],
  );
});

test('role default wins over org when staff is silent', () => {
  assert.deepEqual(
    resolveUnboxPinnedTabs({ staffPins: null, roleDefault: ['incoming'], orgDefault: [] }),
    ['incoming'],
  );
  // A role that explicitly opts OUT ([]) beats an org that opts in.
  assert.deepEqual(
    resolveUnboxPinnedTabs({ staffPins: undefined, roleDefault: [], orgDefault: ['incoming'] }),
    [],
  );
});

test('org default applies when staff and role are silent', () => {
  assert.deepEqual(
    resolveUnboxPinnedTabs({ staffPins: null, roleDefault: null, orgDefault: ['incoming'] }),
    ['incoming'],
  );
  assert.deepEqual(
    resolveUnboxPinnedTabs({ staffPins: undefined, roleDefault: undefined, orgDefault: undefined }),
    [],
  );
});

test('every layer is sanitized to the closed catalog + pin cap', () => {
  // Unknown ids are dropped from whichever layer wins.
  assert.deepEqual(
    resolveUnboxPinnedTabs({ staffPins: ['bogus', 'incoming'] }),
    ['incoming'],
  );
  assert.deepEqual(resolveUnboxPinnedTabs({ orgDefault: ['bogus'] }), []);
  // A hostile role template can't widen the strip past the cap.
  assert.deepEqual(
    resolveUnboxPinnedTabs({ roleDefault: ['incoming', 'incoming', 'incoming'] }),
    ['incoming'],
  );
});

test('chrome shape ({ staffPins, orgDefault }) resolves inherit vs cleared', () => {
  // Fresh staffer inherits the (already role→org folded) default.
  assert.deepEqual(
    resolveUnboxPinnedTabs({ staffPins: undefined, orgDefault: ['incoming'] }),
    ['incoming'],
  );
  // Staffer who set their own pins keeps them.
  assert.deepEqual(
    resolveUnboxPinnedTabs({ staffPins: ['incoming'], orgDefault: [] }),
    ['incoming'],
  );
  // Staffer who cleared theirs stays empty even if the org default is on.
  assert.deepEqual(
    resolveUnboxPinnedTabs({ staffPins: [], orgDefault: ['incoming'] }),
    [],
  );
});
