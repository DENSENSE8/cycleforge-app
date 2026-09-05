/**
 * Self-hosted CI — tripwire for the receipt contract.
 *
 * Plan: `docs/todo/self-hosted-ci-and-fork-teardown-PLAN.md` §3.3 steps 1–2,
 * §4.1. The runner is I/O; the rules it must obey live in
 * `scripts/ci/ci-core.mjs` and are proved here:
 *
 * - a gate that declares no inputs is never cached (no hash ⇒ no hit);
 * - the hash moves with content, toolchain, and the gate's own definition,
 *   and NOT with the worktree path the command was resolved under;
 * - the lockfile is an input to lint / typecheck / unit tests;
 * - `main` earns the full profile, everything else fast;
 * - a receipt carries (gate, inputHash, hit|ran, status, durationMs, logPath)
 *   and is green iff every hard gate passed;
 * - the queue drains `main` first, collapses duplicate shas, and survives
 *   lines appended while a run is in progress.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildReceipt,
  detectFlakes,
  gateInputHash,
  gateSlug,
  hitRatio,
  isFirstRed,
  isQuarantined,
  mergeFlakes,
  parseQueue,
  profileForBranch,
  queueWithout,
  receiptOk,
  selectAffectedTests,
} from '../../../scripts/ci/ci-core.mjs';
import { ALL_GATES, buildGates, gatesForProfile } from '../../../scripts/verify-profile.mjs';

const toolchain = {
  node: 'v26.7.0',
  pnpm: '11.5.1',
  platform: 'linux',
  arch: 'x64',
  nodeModules: 'symlink:/repo/node_modules',
};

const lsFiles = [
  '100644 aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa 0\tsrc/a.ts',
  '100644 bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb 0\tpnpm-lock.yaml',
].join('\n');

describe('ci-core — input-hashed gates', () => {
  it('an undeclared gate is never cached', () => {
    const gate = { name: 'Mystery', cmd: 'node', args: ['x.mjs'] };
    assert.equal(gateInputHash({ gate, toolchain, lsFiles }), null);
    assert.equal(gateInputHash({ gate: { ...gate, inputs: [] }, toolchain, lsFiles }), null);
  });

  it('the hash is stable for identical inputs and ignores the worktree path of the binary', () => {
    const a = { name: 'Typecheck', cmd: '/var/tmp/ci/aaa/node_modules/.bin/tsc', args: ['--noEmit'], inputs: ['src'] };
    const b = { name: 'Typecheck', cmd: '/var/tmp/ci/bbb/node_modules/.bin/tsc', args: ['--noEmit'], inputs: ['src'] };
    assert.equal(
      gateInputHash({ gate: a, toolchain, lsFiles }),
      gateInputHash({ gate: b, toolchain, lsFiles }),
    );
  });

  it('the hash moves with content, toolchain, and the gate definition', () => {
    const gate = { name: 'Lint', cmd: 'eslint', args: ['src'], inputs: ['src'] };
    const base = gateInputHash({ gate, toolchain, lsFiles });
    assert.notEqual(
      base,
      gateInputHash({ gate, toolchain, lsFiles: lsFiles.replace(/aaaa/g, 'cccc') }),
      'a changed blob id must change the key',
    );
    assert.notEqual(
      base,
      gateInputHash({ gate, toolchain: { ...toolchain, node: 'v27.0.0' }, lsFiles }),
      'a toolchain bump must change the key',
    );
    assert.notEqual(
      base,
      gateInputHash({ gate: { ...gate, args: ['src', '--fix'] }, toolchain, lsFiles }),
      'a changed gate definition must change the key',
    );
    assert.notEqual(
      base,
      gateInputHash({ gate: { ...gate, inputs: ['src', 'tools'] }, toolchain, lsFiles }),
      'a changed input declaration must change the key',
    );
  });

  it('keyArgs let the runner vary a non-semantic arg (cache dir) without a miss', () => {
    const gate = { name: 'Lint', cmd: 'eslint', args: ['src', '--cache-location', '/tmp/a'], keyArgs: ['src'], inputs: ['src'] };
    const other = { ...gate, args: ['src', '--cache-location', '/tmp/b'] };
    assert.equal(gateInputHash({ gate, toolchain, lsFiles }), gateInputHash({ gate: other, toolchain, lsFiles }));
  });
});

describe('ci-core — the gate list declares its inputs', () => {
  it('every verify gate declares inputs, and the lockfile is an input to lint / typecheck / unit', () => {
    for (const gate of ALL_GATES) {
      assert.ok(gate.inputs && gate.inputs.length > 0, `${gate.name} declares no inputs — it would run every time and never hit`);
    }
    for (const name of ['Lint', 'Typecheck', 'Unit tests']) {
      const gate = ALL_GATES.find((g) => g.name === name);
      assert.ok(gate, `${name} gate exists`);
      assert.ok(gate.inputs.includes('pnpm-lock.yaml'), `${name}: pnpm-lock.yaml must be an input (a dependency bump changes what tsc says about src/)`);
      assert.ok(gate.inputs.includes('src'), `${name}: src must be an input`);
    }
  });

  it('gates resolve their local bins against the root they are built for', () => {
    const gates = buildGates('/var/tmp/cycleforge-ci/deadbeef');
    const tsc = gates.find((g) => g.name === 'Typecheck');
    assert.ok(tsc.cmd.startsWith('/var/tmp/cycleforge-ci/deadbeef/node_modules/.bin/'), tsc.cmd);
  });

  it('the full profile is a superset of fast, and carries the two display cohorts', () => {
    const fast = gatesForProfile('fast').map((g) => g.name);
    const full = gatesForProfile('full').map((g) => g.name);
    for (const name of fast) assert.ok(full.includes(name), `${name} in full`);
    assert.ok(full.includes('Cohort: slot-table'));
    assert.ok(full.includes('Cohort: shortcuts'));
    assert.ok(!fast.includes('Cohort: slot-table'), 'cohorts are full-tier');
  });
});

describe('ci-core — profile, receipt, queue', () => {
  it('main earns full; everything else fast', () => {
    assert.equal(profileForBranch('main'), 'full');
    assert.equal(profileForBranch('feature/x'), 'fast');
    assert.equal(profileForBranch(null), 'fast');
  });

  it('gate slugs are filesystem-safe', () => {
    assert.equal(gateSlug('Unit tests'), 'unit-tests');
    assert.equal(gateSlug('Cohort: slot-table'), 'cohort-slot-table');
  });

  it('a receipt carries the contract and is green iff every hard gate passed', () => {
    const gates = [
      { gate: 'Lint', slug: 'lint', inputHash: 'h1', cached: 'hit', status: 'pass', durationMs: 10, logPath: '.ci/logs/x/lint.log', from: 'abc', command: 'eslint src' },
      { gate: 'Typecheck', slug: 'typecheck', inputHash: 'h2', cached: 'ran', status: 'pass', durationMs: 90_000, logPath: '.ci/logs/x/typecheck.log', command: 'tsc --noEmit' },
    ];
    const receipt = buildReceipt({
      sha: 'x',
      branch: 'main',
      profile: 'full',
      startedAt: '2026-09-04T00:00:00.000Z',
      finishedAt: '2026-09-04T00:02:00.000Z',
      worktree: '/var/tmp/cycleforge-ci/x',
      toolchain,
      untracked: [],
      warnings: [],
      gates,
    });
    assert.equal(receipt.version, 1);
    assert.equal(receipt.ok, true);
    assert.equal(receipt.durationMs, 120_000);
    for (const g of receipt.gates) {
      for (const key of ['gate', 'inputHash', 'cached', 'status', 'durationMs', 'logPath']) {
        assert.ok(key in g, `${g.gate} carries ${key}`);
      }
    }
    assert.equal(receiptOk([...gates, { ...gates[0], status: 'advisory-fail' }]), true, 'advisory failures never block');
    assert.equal(receiptOk([...gates, { ...gates[0], status: 'fail' }]), false);
  });

  it('hit ratio counts only hashable gates', () => {
    const r = (gates) => ({ gates });
    const { hits, ran, ratio } = hitRatio([
      r([{ inputHash: 'a', cached: 'hit' }, { inputHash: 'b', cached: 'ran' }, { inputHash: null, cached: 'ran' }]),
      r([{ inputHash: 'a', cached: 'hit' }]),
    ]);
    assert.deepEqual({ hits, ran }, { hits: 2, ran: 1 });
    assert.ok(Math.abs(ratio - 2 / 3) < 1e-9);
    assert.equal(hitRatio([]).ratio, 0);
  });

  it('first red notifies once per breakage', () => {
    const green = { ok: true };
    const red = { ok: false };
    assert.equal(isFirstRed(red, null), true);
    assert.equal(isFirstRed(red, green), true);
    assert.equal(isFirstRed(red, red), false);
    assert.equal(isFirstRed(green, red), false);
  });

  it('queue: main first, duplicates collapse, appended lines survive a drain', () => {
    const text = [
      'aaaaaaa feature 1',
      'bbbbbbb main 2',
      'aaaaaaa other 3',
      'ccccccc detached 4',
      'not-a-sha main 5',
    ].join('\n');
    const jobs = parseQueue(text);
    assert.deepEqual(
      jobs.map((j) => [j.sha, j.branch]),
      [
        ['bbbbbbb', 'main'],
        ['aaaaaaa', 'other'],
        ['ccccccc', null],
      ],
    );
    const later = `${text}\nddddddd main 6\n`;
    assert.equal(queueWithout(later, ['aaaaaaa', 'bbbbbbb']), 'ccccccc detached 4\nnot-a-sha main 5\nddddddd main 6\n');
    assert.equal(queueWithout('aaaaaaa main 1\n', ['aaaaaaa']), '');
  });
});

describe('ci-core — affected-test selection (§4.2)', () => {
  const hasTest = (file: string) =>
    ['src/lib/a.test.ts', 'src/lib/b.test.ts', 'src/lib/c.test.ts'].includes(file);

  it('selects the co-located tests of everything the change reaches', () => {
    const { files, stale } = selectAffectedTests({
      changed: ['src/lib/a.ts'],
      impacted: ['src/lib/a.ts', 'src/lib/b.ts', 'src/lib/nope.ts'],
      hasTest,
    });
    assert.equal(stale, false);
    assert.deepEqual(files, ['src/lib/a.test.ts', 'src/lib/b.test.ts']);
  });

  it('always runs a test the change edited, whatever it covers', () => {
    const { files } = selectAffectedTests({
      changed: ['src/lib/c.test.ts'],
      impacted: ['src/lib/c.test.ts'],
      hasTest,
    });
    assert.deepEqual(files, ['src/lib/c.test.ts']);
  });

  it('selects NOTHING for a docs-only commit', () => {
    const { files, stale, reason } = selectAffectedTests({
      changed: ['docs/plan.md', 'README.md'],
      impacted: [],
      hasTest,
    });
    assert.deepEqual(files, []);
    assert.equal(stale, false);
    assert.match(reason, /no source files changed/);
  });

  it('falls back to the FULL run when the graph reached nothing from a source change', () => {
    // The dangerous case: an empty impact set and a real source edit are
    // indistinguishable from "nothing depends on this", and presubmit has no
    // second net. Under-selecting silently is the one outcome not allowed.
    const { files, stale, reason } = selectAffectedTests({
      changed: ['src/lib/brand-new.ts'],
      impacted: [],
      hasTest,
    });
    assert.deepEqual(files, []);
    assert.equal(stale, true);
    assert.match(reason, /graph stale/);
  });
});

describe('ci-core — flake quarantine (§4.3)', () => {
  const history = [
    { inputHash: 'h1', sha: 'aaa', status: 'fail', at: '2026-09-05T00:00:00Z' },
    { inputHash: 'h1', sha: 'bbb', status: 'pass', at: '2026-09-05T01:00:00Z' },
    { inputHash: 'h2', sha: 'ccc', status: 'fail', at: '2026-09-05T02:00:00Z' },
    { inputHash: 'h3', sha: 'ddd', status: 'pass', at: '2026-09-05T03:00:00Z' },
  ];

  it('flags a gate that answered twice on identical inputs, and only that one', () => {
    const found = detectFlakes('Unit tests', history);
    assert.equal(found.length, 1);
    assert.equal(found[0].inputHash, 'h1');
    assert.deepEqual(found[0].outcomes, ['fail', 'pass']);
    assert.deepEqual(found[0].seen, ['aaa', 'bbb']);
  });

  it('does not flag a gate that consistently fails — that is a real red', () => {
    const consistent = history.filter((h) => h.inputHash === 'h2');
    assert.deepEqual(detectFlakes('Unit tests', consistent), []);
  });

  it('quarantine is exact: gate AND input hash, never a whole gate forever', () => {
    const flaky = detectFlakes('Unit tests', history);
    assert.equal(isQuarantined(flaky, 'Unit tests', 'h1'), true);
    assert.equal(isQuarantined(flaky, 'Unit tests', 'h2'), false, 'a different input is not quarantined');
    assert.equal(isQuarantined(flaky, 'Lint', 'h1'), false, 'a different gate is not quarantined');
    assert.equal(isQuarantined(flaky, 'Unit tests', null), false, 'an unhashable gate cannot be quarantined');
  });

  it('merging only ever adds — clearing an entry is a human decision', () => {
    const stored = [{ gate: 'Lint', inputHash: 'old', outcomes: ['fail', 'pass'], seen: ['zzz'] }];
    const merged = mergeFlakes(stored, detectFlakes('Unit tests', history));
    assert.equal(merged.length, 2);
    assert.ok(merged.some((f) => f.gate === 'Lint' && f.inputHash === 'old'));
    assert.ok(merged.some((f) => f.gate === 'Unit tests' && f.inputHash === 'h1'));
    // Re-merging the same finding updates it in place rather than duplicating.
    assert.equal(mergeFlakes(merged, detectFlakes('Unit tests', history)).length, 2);
  });
});
