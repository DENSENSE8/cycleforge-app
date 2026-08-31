import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLAIM_RENDERS_IN_BOTH } from './claim-surfaces';

const here = dirname(fileURLToPath(import.meta.url));
const src = (rel: string) => readFileSync(resolve(here, rel), 'utf8');

const UNBOX = '../LineEditPanel.tsx';
const TESTING = '../../../tech/TestingPanel.tsx';
const TRIAGE = '../../triage/TriagePanel.tsx';

/** The `onOpenClaim` callback body, so we assert on the OPEN path only. */
function openClaimBody(text: string): string {
  const start = text.indexOf('const onOpenClaim = useCallback(');
  assert.notEqual(start, -1, 'onOpenClaim not found');
  const end = text.indexOf('const c = use', start);
  assert.notEqual(end, -1, 'controller call after onOpenClaim not found');
  return text.slice(start, end);
}

test('the transitional pairing is on', () => {
  assert.equal(CLAIM_RENDERS_IN_BOTH, true);
});

test('both dual-surface stations read the shared switch, never a local copy', () => {
  for (const rel of [UNBOX, TESTING]) {
    const text = src(rel);
    assert.match(
      text,
      /import \{ CLAIM_RENDERS_IN_BOTH \} from '[^']*claim\/claim-surfaces'/,
      `${rel} must import the shared switch`,
    );
    // A second declaration is a fork: the flag has one end date, not two.
    assert.doesNotMatch(
      text,
      /const CLAIM_RENDERS_IN_BOTH\s*=/,
      `${rel} must not redeclare the switch`,
    );
  }
});

test('filing a claim lights the centre AND the right rail on Unbox', () => {
  const body = openClaimBody(src(UNBOX));
  assert.match(body, /setComposerMode\('ticket'\)/, 'centre pane not opened');
  assert.match(body, /if \(CLAIM_RENDERS_IN_BOTH\)/, 'rail open not behind the switch');
  assert.match(
    body,
    /setRequestedSideTab\('ticket',\s*\{ ticketAction: 'claim', claimMode: mode \}\)/,
    'rail Ticket leaf not opened in the same mode',
  );
});

test('filing a claim lights the centre AND the right rail on Testing', () => {
  const body = openClaimBody(src(TESTING));
  assert.match(body, /setClaimMode\(mode\)/, 'mode not seeded for both surfaces');
  assert.match(body, /setComposerMode\('ticket'\)/, 'centre pane not opened');
  assert.match(body, /if \(CLAIM_RENDERS_IN_BOTH\) setActiveSideTab\('ticket'\)/, 'rail Ticket leaf not opened');
});

test('closing the claim never yanks the rail shut', () => {
  // Open pairs the surfaces; close is centre-only. The rail is what the floor
  // already trusts, so dismissing the centre must not take it away.
  const unbox = src(UNBOX);
  const close = unbox.slice(
    unbox.indexOf('const closeClaimView = useCallback('),
    unbox.indexOf('const onClaimTicketCreated'),
  );
  assert.ok(close.length > 0, 'closeClaimView not found');
  assert.doesNotMatch(close, /setRequestedSideTab/, 'close must not touch the rail');
});

test('Triage is rail-only by construction and does not read the switch', () => {
  // No centre Ticket pane there — nothing to pair with, so porting the flag
  // would be cargo cult rather than parity.
  const triage = src(TRIAGE);
  assert.doesNotMatch(triage, /CLAIM_RENDERS_IN_BOTH/);
  assert.doesNotMatch(triage, /StationTicketPane/);
});

/**
 * The Displays push stack's `onTabChange` handler — the row-press path, not the
 * `displaysVisitFrame` snapshot that also branches on `tab === 'ticket'`.
 */
function indexTicketBranch(text: string): string {
  const open = text.indexOf('onTabChange={(id) => {');
  assert.notEqual(open, -1, 'onTabChange handler not found');
  const close = text.indexOf('onClose={', open);
  assert.notEqual(close, -1, 'end of onTabChange handler not found');
  const handler = text.slice(open, close);
  const start = handler.search(/if \((?:tab|id) === 'ticket'\) \{/);
  assert.notEqual(start, -1, "onTabChange 'ticket' branch not found");
  return handler.slice(start);
}

test('the Displays index Ticket row opens the rail leaf, never bounces to the index', () => {
  // The regression the operator hit: pressing Ticket in the open Displays
  // column flipped the CENTRE and re-parked the rail on the index, so the row
  // read as dead — the rail it was pressed in never moved.
  for (const [rel, park] of [
    [UNBOX, 'UNBOX_DISPLAY_INDEX'],
    [TESTING, 'STATION_DISPLAY_INDEX'],
  ] as const) {
    const branch = indexTicketBranch(src(rel));
    assert.match(branch, /CLAIM_RENDERS_IN_BOTH \? 'ticket'/, `${rel} must open the leaf`);
    // The index park survives only as the retired-flag fallback, never bare.
    assert.doesNotMatch(
      branch,
      new RegExp(`(?<!\\? 'ticket'\\s*:\\s*)\\b${park}\\b(?![^)]*\\))`),
      `${rel} must not unconditionally re-park the rail`,
    );
  }
});

test('an unlinked carton routes the index Ticket row through the one claim door', () => {
  for (const rel of [UNBOX, TESTING]) {
    assert.match(
      indexTicketBranch(src(rel)),
      /onOpenClaim\(/,
      `${rel} must open the claim through onOpenClaim so both surfaces light`,
    );
  }
});

test('Unbox claim chips go through the one door, not a bare composer flip', () => {
  const unbox = src(UNBOX);
  // "Find ticket" on an unlinked carton, and the carton-context Claim chip.
  assert.match(
    unbox,
    /const openFindTicketDisplay = useCallback\(\(\) => \{[\s\S]*?onOpenClaim\('link'\)/,
    'Find ticket must route through onOpenClaim',
  );
  assert.match(
    unbox,
    /onToggleClaimView=\{\(\) => \{[\s\S]*?else onOpenClaim\('link'\)/,
    'the Claim chip must route through onOpenClaim',
  );
});
