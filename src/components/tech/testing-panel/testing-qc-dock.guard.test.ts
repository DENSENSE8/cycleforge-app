/**
 * Testing QC dock is station-local — never UnboxDockHost / UNBOX_STEP_DOCK_CONTROLS.
 *
 * Run: `node --require ./scripts/register-server-only-shim.cjs --import tsx \
 *        --test src/components/tech/testing-panel/testing-qc-dock.guard.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(process.cwd(), 'src/components/tech');

function src(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

test('TestingPanel mounts TestingDockHost + works-as-listed — not UnboxDockHost', () => {
  const panel = src('TestingPanel.tsx');
  assert.match(panel, /TestingDockHost/, 'QC dock host');
  assert.match(panel, /WorksAsListedDockControl/, 'works-as-listed CTA');
  assert.doesNotMatch(panel, /UnboxDockHost/, 'must not reuse Unbox dock host');
  assert.doesNotMatch(panel, /UNBOX_STEP_DOCK_CONTROLS/, 'must not import Unbox dock registry');
});

test('Listing verify leaf + claim prefill are wired', () => {
  const panel = src('TestingPanel.tsx');
  assert.match(panel, /buildNotAsListedIssue/, 'not-as-listed builds claim issue');
  assert.match(panel, /claimPrefill/, 'prefill state for Ticket claim');
  assert.match(panel, /useSellerClaimedCondition/, 'real sold-as / listing facts');
  assert.doesNotMatch(
    panel,
    /resolveSellerClaimedCondition\(\{\s*\}\)/,
    'must not pass empty facts forever',
  );
  assert.match(
    panel,
    /setActiveSideTab\(ctx\.open \? 'ticket' : 'listing'\)/,
    'line open → Listing unless Ticket wins',
  );

  const displays = src('testing-panel/build-testing-displays.tsx');
  assert.match(displays, /TestingListingVerifyHost/, 'Listing Displays leaf');
  assert.match(displays, /id: 'listing'/, 'listing tab id');
  assert.match(displays, /returnClaimPrefill=\{claimPrefill\}/, 'issue → claim reason');
});

test('tech tree never imports Unbox dock registry', () => {
  const strip = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  const panel = strip(src('TestingPanel.tsx'));
  const dock = strip(src('testing-panel/TestingDockHost.tsx'));
  const wal = strip(src('testing-panel/WorksAsListedDockControl.tsx'));
  for (const [name, body] of [
    ['TestingPanel', panel],
    ['TestingDockHost', dock],
    ['WorksAsListedDockControl', wal],
  ] as const) {
    assert.doesNotMatch(body, /UnboxDockHost/, `${name}: no UnboxDockHost`);
    assert.doesNotMatch(body, /UNBOX_STEP_DOCK_/, `${name}: no Unbox dock registry`);
  }
});

test('seller-claimed condition SoT never reads warehouse condition_grade as input', () => {
  const sot = readFileSync(
    join(process.cwd(), 'src/lib/receiving/seller-claimed-condition.ts'),
    'utf8',
  )
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
  assert.doesNotMatch(
    sot,
    /condition_grade/,
    'warehouse grade is not an input to resolveSellerClaimedCondition',
  );
  assert.match(sot, /matchedOrderCondition/, 'sold-as order is an input');
  assert.match(sot, /listingCondition/, 'listing condition is an input');
});

test('Testing QC vocab keeps listing_context as Displays-only (no dock CTA)', async () => {
  const {
    testingQcStepsWithoutDockAction,
    testingQcCaptureKeys,
    TESTING_QC_STEP_LABEL,
  } = await import('@/lib/stations/testing-procedure');
  assert.deepEqual(testingQcCaptureKeys(), ['listing_context', 'works_as_listed']);
  assert.deepEqual(testingQcStepsWithoutDockAction(), ['listing_context']);
  assert.equal(TESTING_QC_STEP_LABEL.works_as_listed, 'Works as listed');
  assert.equal(TESTING_QC_STEP_LABEL.listing_context, 'Listing');
});
