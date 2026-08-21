import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  __resetCommandAliasesForTests,
  areCommandAliasesHydrated,
  listCommandAliases,
  resolveCommandAlias,
  setCommandAliases,
} from './command-alias-store';
import { ALIAS_CODE_RE, listAliasTargets, validateAlias } from './command-alias-validate';
import { NAV_COMMAND_CODES } from './nav-command-codes';
import { ACTION_COMMAND_CODES } from './action-command-codes';
import { STATION_COMMAND_CODES } from './station-command-codes';

describe('command-alias-store', () => {
  beforeEach(() => {
    __resetCommandAliasesForTests();
  });

  it('resolves an alias to its TARGET, not to itself', () => {
    // Everything downstream — permission gate, destination, verdict — is decided
    // by the target, which is what stops an alias becoming a second code path.
    setCommandAliases([
      { code: 'CMD-GO-BENCH-3', targetCode: 'CMD-GO-QC', label: 'Bench 3', sortOrder: 10 },
    ]);
    assert.equal(resolveCommandAlias('CMD-GO-BENCH-3'), 'CMD-GO-QC');
  });

  it('resolves the mangled and lower-cased forms of an alias', () => {
    setCommandAliases([
      { code: 'CMD-GO-BENCH-3', targetCode: 'CMD-GO-QC', label: 'Bench 3', sortOrder: 10 },
    ]);
    assert.equal(resolveCommandAlias('cmdgobench3'), 'CMD-GO-QC');
    assert.equal(resolveCommandAlias('  cmd-go-bench-3 '), 'CMD-GO-QC');
  });

  it('returns null for a non-alias and reports hydration state', () => {
    assert.equal(areCommandAliasesHydrated(), false);
    assert.equal(resolveCommandAlias('CMD-GO-QC'), null);
    setCommandAliases([]);
    assert.equal(areCommandAliasesHydrated(), true);
  });

  it('replaces the set rather than merging on re-hydration', () => {
    setCommandAliases([{ code: 'CMD-A', targetCode: 'CMD-GO-QC', label: 'A', sortOrder: 1 }]);
    setCommandAliases([{ code: 'CMD-B', targetCode: 'CMD-GO-QC', label: 'B', sortOrder: 1 }]);
    assert.equal(resolveCommandAlias('CMD-A'), null);
    assert.equal(resolveCommandAlias('CMD-B'), 'CMD-GO-QC');
  });

  it('lists in book order', () => {
    setCommandAliases([
      { code: 'CMD-B', targetCode: 'CMD-GO-QC', label: 'B', sortOrder: 20 },
      { code: 'CMD-A', targetCode: 'CMD-GO-QC', label: 'A', sortOrder: 10 },
    ]);
    assert.deepEqual(listCommandAliases().map((a) => a.code), ['CMD-A', 'CMD-B']);
  });
});

describe('validateAlias', () => {
  const ok = { code: 'CMD-GO-BENCH-3', targetCode: 'CMD-GO-QC', label: 'Bench 3' };

  it('accepts a well-formed alias and normalises case', () => {
    const r = validateAlias({ code: 'cmd-go-bench-3', targetCode: 'cmd-go-qc', label: ' Bench 3 ' });
    assert.equal(r.ok, true);
    assert.deepEqual(r.ok && r.value, {
      code: 'CMD-GO-BENCH-3',
      targetCode: 'CMD-GO-QC',
      label: 'Bench 3',
    });
  });

  it('refuses a code outside the CMD- namespace', () => {
    // Not a style rule: the classifier claims `CMD-` wholesale so a command can
    // never be read as a serial. `BENCH-3` would classify as a serial fragment
    // and be looked up against tech_serial_numbers.
    for (const code of ['BENCH-3', 'CMD_GO_QC', 'CMD-', 'GO-QC', 'CMD-GO QC']) {
      const r = validateAlias({ ...ok, code });
      assert.equal(r.ok, false, code);
    }
  });

  it('refuses a target that is not a built-in command', () => {
    const r = validateAlias({ ...ok, targetCode: 'CMD-GO-NOWHERE' });
    assert.equal(r.ok, false);
    assert.match(r.ok === false ? r.error : '', /cannot create a new one/);
  });

  it('refuses shadowing a built-in code', () => {
    // Shadowing would make the built-in unreachable by its own printed sticker,
    // and every book already in the building would be wrong.
    const r = validateAlias({ ...ok, code: 'CMD-GO-READY' });
    assert.equal(r.ok, false);
    assert.match(r.ok === false ? r.error : '', /built-in command/);
  });

  it('refuses a self-referential alias and an empty label', () => {
    assert.equal(validateAlias({ ...ok, label: '   ' }).ok, false);
    // Shadowing catches the exact-self case first; the squash check covers the
    // punctuation-variant case that would otherwise slip through.
    const r = validateAlias({ code: 'CMD-GOQC', targetCode: 'CMD-GO-QC', label: 'x' });
    assert.equal(r.ok, false);
  });

  it('offers every built-in command as a target, and only those', () => {
    const offered = listAliasTargets().map((t) => t.code).sort();
    const registered = [
      ...NAV_COMMAND_CODES,
      ...ACTION_COMMAND_CODES,
      ...STATION_COMMAND_CODES,
    ].map((c) => c.code).sort();
    assert.deepEqual(offered, registered);
  });

  it('every built-in code satisfies the alias namespace shape', () => {
    // The alias CHECK and the built-in vocabulary must agree, or a target would
    // be unreachable by any code the form will accept.
    for (const t of listAliasTargets()) {
      assert.match(t.code, ALIAS_CODE_RE, t.code);
    }
  });
});
