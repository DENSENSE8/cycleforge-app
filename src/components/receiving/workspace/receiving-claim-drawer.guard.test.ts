/**
 * Receiving claim drawer — right slide-over + stacked sections (no ScrollSpy).
 * Photos → Ticket (editable only); sticky File footer hosts backup note + CTA; no Cancel / no Review dupe.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

const read = (rel: string) => stripComments(readFileSync(join(process.cwd(), rel), 'utf8'));

const MODAL = 'src/components/receiving/workspace/ReceivingClaimModal.tsx';
const PANEL = 'src/components/receiving/workspace/ReceivingClaimPanel.tsx';
const NAV = 'src/components/receiving/workspace/claim/components/ClaimWizardNav.tsx';
const TYPES = 'src/components/receiving/workspace/claim/claim-types.ts';
const COMPOSE = 'src/components/receiving/workspace/claim/components/ClaimComposeStep.tsx';
const BACKUP = 'src/components/receiving/workspace/claim/components/ClaimBackupStep.tsx';
const PHASE = 'src/components/receiving/workspace/claim/components/ClaimPhaseActions.tsx';

describe('Receiving claim drawer (stacked sections, no ScrollSpy)', () => {
  it('ReceivingClaimModal is a right viewport slide-over', () => {
    const src = read(MODAL);
    assert.match(src, /align="right"/);
    assert.match(src, /anchor="viewport"/);
    assert.match(src, /width=\{560\}/);
    assert.doesNotMatch(src, /align="center"/);
  });

  it('ReceivingClaimPanel mounts stacked sections + sticky File footer without ScrollSpy', () => {
    const src = read(PANEL);
    assert.match(src, /claimSectionDomId/);
    assert.doesNotMatch(src, /useScrollSpy/);
    assert.doesNotMatch(src, /ScrollSpyNav/);
    assert.match(src, /ClaimActionFooter/);
    assert.doesNotMatch(src, /AnimatePresence/);
    assert.doesNotMatch(src, /ClaimReviewStep/);
    assert.doesNotMatch(
      src,
      /ClaimBackupStep/,
      'backup note lives on the sticky footer, not a scroll section',
    );
  });

  it('ClaimWizardNav is New/Link TabDisplay only — no ScrollSpy or LinearWorkflowStepper', () => {
    const src = read(NAV);
    assert.match(src, /TabDisplay/);
    assert.doesNotMatch(src, /ScrollSpyNav/);
    assert.doesNotMatch(src, /LinearWorkflowStepper/);
  });

  it('Displays Claim parks New·Link in leaf header; modal keeps body strip', () => {
    const panel = read(PANEL);
    assert.match(panel, /setLeafTrailing/);
    assert.match(panel, /placement="leaf-header"/);
    assert.match(
      panel,
      /chrome === 'modal' \? <ClaimWizardNav/,
      'modal still mounts ClaimWizardNav in the body',
    );
    assert.doesNotMatch(
      panel,
      /chrome === 'display' \? <ClaimWizardNav/,
      'display chrome must not keep a body ClaimWizardNav strip',
    );
  });

  it('Ticket is editable-only; Backup sits on sticky File footer; no Review dupe', () => {
    const types = read(TYPES);
    const compose = read(COMPOSE);
    const backup = read(BACKUP);
    const phase = read(PHASE);
    assert.doesNotMatch(types, /key: 'review'/);
    assert.doesNotMatch(types, /key: 'backup'/);
    assert.doesNotMatch(compose, /ClaimReviewStep|Review before filing/);
    assert.doesNotMatch(compose, /ClaimPhaseActions/);
    assert.match(backup, /claim-backup-section/);
    assert.match(phase, /ClaimBackupStep/);
    assert.match(phase, /ClaimActionFooter/);
    assert.match(phase, /File ticket →/);
    assert.doesNotMatch(phase, /\bCancel\b/);
  });
});
