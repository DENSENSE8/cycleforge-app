import { test } from 'node:test';
import { deepStrictEqual, strictEqual } from 'node:assert';

import {
  rankTriageSteps,
  type TriagePastDecision,
  type TriageRankInput,
  type TriageResolution,
  type TriageSignals,
} from './rank';

const BATTERY_DEAD = 2;
const CHARGE_PORT = 4;

function signals(over: Partial<TriageSignals> = {}): TriageSignals {
  return { readings: [], codes: [], checklist: [], failureTags: [], latestVerdict: null, repairs: [], ...over };
}

function input(over: Partial<TriageRankInput> = {}): TriageRankInput {
  return {
    signals: signals({ failureTags: [{ id: 50, failureModeId: BATTERY_DEAD, status: 'open' }] }),
    failureModes: [
      { id: BATTERY_DEAD, code: 'BATTERY_DEAD', label: 'Battery dead' },
      { id: CHARGE_PORT, code: 'CHARGE_PORT_FAULT', label: 'Charge port fault' },
    ],
    resolutions: [],
    decisions: [],
    ...over,
  };
}

let repairSeq = 1;
function resolution(parts: string[], over: Partial<TriageResolution> = {}): TriageResolution {
  return { repairId: repairSeq++, failureModeId: BATTERY_DEAD, scope: 'sku', status: 'completed', parts, summary: '', ...over };
}

function decision(stepKey: string, d: TriagePastDecision['decision'], n = 1): TriagePastDecision[] {
  return Array.from({ length: n }, () => ({
    stepKey,
    step: stepKey,
    kind: 'FIX' as const,
    failureModeId: BATTERY_DEAD,
    scope: 'sku' as const,
    decision: d,
  }));
}

const HISTORY: TriageResolution[] = [
  resolution(['battery']),
  resolution(['battery']),
  resolution(['Battery ']),
  resolution(['charge port']),
  resolution(['charge port'], { scope: 'family' }),
  resolution(['charge port'], { scope: 'family' }),
];

test('ranks fixes by weighted same-SKU/family resolution frequency', () => {
  const steps = rankTriageSteps(input({ resolutions: HISTORY }));
  deepStrictEqual(
    steps.map((s) => [s.key, s.kind, s.confidence]),
    [
      // hits 3 of 5 weighted (4 sku + 2×½ family), prior 2 → 3/7
      ['FIX:m2:replace battery', 'FIX', 0.429],
      ['CHECK:m2', 'CHECK', 0.35],
      // hits 1 + 2×½ = 2, misses 3 → 2/7
      ['FIX:m2:replace charge port', 'FIX', 0.286],
    ],
  );
  const battery = steps[0];
  deepStrictEqual(battery.evidence[0], { type: 'failure_tag', id: '50', label: 'Battery dead' });
  strictEqual(battery.evidence.filter((e) => e.type === 'repair').length, 3);
});

test('human decisions move the ranking on the next call', () => {
  const steps = rankTriageSteps(
    input({
      resolutions: HISTORY,
      decisions: [
        ...decision('FIX:m2:replace battery', 'REJECTED', 3),
        ...decision('FIX:m2:replace charge port', 'ACCEPTED', 2),
      ],
    }),
  );
  deepStrictEqual(
    steps.map((s) => [s.key, s.confidence]),
    [
      ['FIX:m2:replace charge port', 0.444], // (2+2)/(2+4+3)
      ['CHECK:m2', 0.35],
      ['FIX:m2:replace battery', 0.3], // 3/(2+3+5)
    ],
  );
  strictEqual(steps[0].why.endsWith('Techs accepted 2, rejected 0 before.'), true);
});

test('a failed repair counts against the fix it tried', () => {
  const steps = rankTriageSteps(
    input({ resolutions: [resolution(['battery']), resolution(['battery'], { status: 'failed' })] }),
  );
  const battery = steps.find((s) => s.key === 'FIX:m2:replace battery');
  strictEqual(battery?.confidence, 0.25); // 1/(2+1+1)
});

test('an accepted step returns for the same suspected mode without repair history', () => {
  const accepted: TriagePastDecision = {
    stepKey: 'FIX:m2:reseat battery connector',
    step: 'Reseat battery connector',
    kind: 'FIX',
    failureModeId: BATTERY_DEAD,
    scope: 'family',
    decision: 'ACCEPTED',
  };
  const other: TriagePastDecision = { ...accepted, stepKey: 'FIX:m4:clean port', step: 'Clean port', failureModeId: CHARGE_PORT };
  const keys = rankTriageSteps(input({ decisions: [accepted, other] })).map((s) => [s.key, s.confidence]);
  // ½ weight accepted → 0.5/2.5; the charge-port step stays out (mode not suspected).
  deepStrictEqual(keys, [
    ['CHECK:m2', 0.35],
    ['FIX:m2:reseat battery connector', 0.2],
  ]);
});

test('signals without a failure mode still yield CHECK steps; passing and informational ones do not', () => {
  const steps = rankTriageSteps(
    input({
      signals: signals({
        checklist: [
          { stepId: 7, label: 'Speaker sweep', passed: false, value: '40 dB', failureModeId: null },
          { stepId: 8, label: 'Mic', passed: true, value: null, failureModeId: null },
        ],
        readings: [
          { id: 'r1', key: 'battery.health_pct', label: 'Battery health', value: '61%', passed: false, failureModeId: null },
          { id: 'r2', key: 'battery.cycles', label: 'Cycle count', value: '410', passed: null, failureModeId: null },
        ],
        codes: [{ id: 'c1', code: 'E42', label: '', failureModeId: null }],
      }),
    }),
  );
  deepStrictEqual(
    steps.map((s) => s.key),
    ['CHECK:code:E42', 'CHECK:reading:battery.health_pct', 'CHECK:step:7'],
  );
});

test('retest after a repair newer than the failing verdict ranks first; a later PASS clears it', () => {
  const repairs = [{ id: 9, summary: 'Swapped battery', completedAt: '2026-09-20T10:00:00Z' }];
  const failing = { id: 3, verdict: 'TESTING_FAILED' as const, at: '2026-09-19T10:00:00Z', notes: null };
  const first = rankTriageSteps(
    input({ signals: signals({ failureTags: [{ id: 50, failureModeId: BATTERY_DEAD, status: 'open' }], latestVerdict: failing, repairs }) }),
  )[0];
  deepStrictEqual([first.key, first.kind, first.confidence], ['RETEST:after_repair', 'RETEST', 0.85]);

  const passed = rankTriageSteps(
    input({ signals: signals({ latestVerdict: { id: 4, verdict: 'PASS', at: '2026-09-21T10:00:00Z', notes: null }, repairs }) }),
  );
  strictEqual(passed.some((s) => s.kind === 'RETEST'), false);
});

test('a failed verdict with nothing tagged asks to name the fault; a tag replaces that step', () => {
  const failing = { id: 3, verdict: 'TESTING_FAILED' as const, at: '2026-09-19T10:00:00Z', notes: 'no sound' };
  deepStrictEqual(
    rankTriageSteps(input({ signals: signals({ latestVerdict: failing }) })).map((s) => [s.key, s.why]),
    [['CHECK:verdict_failed', 'Last verdict TESTING_FAILED ("no sound") with no failure mode tagged.']],
  );
  const tagged = rankTriageSteps(
    input({ signals: signals({ latestVerdict: failing, failureTags: [{ id: 50, failureModeId: BATTERY_DEAD, status: 'open' }] }) }),
  );
  deepStrictEqual(tagged.map((s) => s.key), ['CHECK:m2']);
});

test('resolved tags raise nothing', () => {
  deepStrictEqual(
    rankTriageSteps(input({ signals: signals({ failureTags: [{ id: 1, failureModeId: BATTERY_DEAD, status: 'resolved' }] }), resolutions: HISTORY })),
    [],
  );
});
