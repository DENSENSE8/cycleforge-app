import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Guard: Link-mode Subject replaces from the picked ticket (sync candidate
 * subject + preview race ref), sole tracking suggestion auto-selects, and
 * claim mode defaults to link.
 */
const TEMPLATE = resolve(
  process.cwd(),
  'src/components/receiving/workspace/claim/hooks/useClaimTemplate.ts',
);
const CONTROLLER = resolve(
  process.cwd(),
  'src/components/receiving/workspace/claim/hooks/useReceivingClaimController.ts',
);
const DISPLAY_VIEW = resolve(
  process.cwd(),
  'src/components/receiving/workspace/line-edit/hooks/useUnboxDisplayView.ts',
);

describe('claim subject replace + link default', () => {
  const template = readFileSync(TEMPLATE, 'utf8');
  const controller = readFileSync(CONTROLLER, 'utf8');
  const displayView = readFileSync(DISPLAY_VIEW, 'utf8');

  it('useClaimTemplate syncs Subject from linkedTicketSubject and guards preview with a ref', () => {
    assert.match(template, /linkedTicketSubject/);
    assert.match(template, /linkedTicketIdRef/);
    assert.match(template, /if \(!linkedTicketIdRef\.current\)/);
    assert.match(
      template,
      /fromCandidate/,
      'applies candidate subject synchronously before thread fallback',
    );
  });

  it('claim-type flip patches claim segment only — identity patch stays on full load', () => {
    assert.match(template, /claimTypeOnly/);
    assert.match(template, /replaceClaimSubjectClaimTypeSegment/);
    // Identity re-align must live in the else (full preview / reset), never after
    // both branches — claim "Return" + resolveClaimSubjectIdentity collapses /
    // rewrites Platform identity.
    assert.match(
      template,
      /if \(claimTypeOnly && existing\.includes\(' \/\/ '\)\) \{[\s\S]*?replaceClaimSubjectClaimTypeSegment\([\s\S]*?\} else \{[\s\S]*?setSubject\(data\.subject\);[\s\S]*?patchSubjectIdentityFromState\(\);/,
    );
  });

  it('template clear does not re-fire when Type/Platform row props drift mid-session', () => {
    // Same bug class as controller openSeedRef: live Classify saves must patch
    // identity via applyCartonIdentity, never wipe Subject/Body for a full reload.
    assert.match(template, /identitySeedRef/);
    assert.match(
      template,
      /}, \[open, receivingId, lineId\]\);/,
      'template clear deps are open + carton/line only',
    );
    assert.doesNotMatch(
      template,
      /}, \[\s*open,\s*receivingId,\s*lineId,\s*initialSourcePlatform/,
      'Classify seed props must not clear the template mid-session',
    );
  });

  it('controller wires linkedTicketSubject and auto-selects sole seeded result', () => {
    assert.match(controller, /linkedTicketSubject:/);
    assert.match(controller, /search\.selectedTicket\?\.subject/);
    assert.match(controller, /ticketResults\.length !== 1/);
    assert.match(controller, /seededQuery/);
    assert.match(controller, /initialMode = 'link'/);
  });

  it('open reset does not re-fire when Type save changes default claim type', () => {
    // Live intake Type edits update row → defaultReceivingClaimType. That must
    // not re-run the open reset (would setMode(link) and re-ping ticket search).
    assert.match(controller, /openSeedRef/);
    assert.match(
      controller,
      /}, \[open, receivingId, lineId\]\);/,
      'open reset deps are open + carton/line only',
    );
    assert.doesNotMatch(
      controller,
      /}, \[open, receivingId, lineId, initialClaimType/,
      'initialClaimType must not be an open-reset dependency',
    );
  });

  it('Unbox Displays defaults claimMode to link', () => {
    assert.match(displayView, /claimMode: 'link'/);
    assert.match(displayView, /let claimMode: ClaimModalMode = 'link'/);
    assert.match(
      displayView,
      /if \(opts\.claimMode === 'create'\) claimMode = 'create'/,
      'explicit create still wins',
    );
  });
});
