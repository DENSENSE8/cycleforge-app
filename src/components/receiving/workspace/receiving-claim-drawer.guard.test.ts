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
const MODE = 'src/components/receiving/workspace/claim/components/ClaimModeSelect.tsx';
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

  it('ClaimModeSelect is Create/Link flush combobox — no ScrollSpy or LinearWorkflowStepper', () => {
    const src = read(MODE);
    assert.match(src, /SearchableSelectField/);
    assert.match(src, /appearance="flush"/);
    assert.match(src, /label: 'Create'/);
    assert.match(src, /label: 'Link'/);
    assert.match(src, /useSegmentChords/);
    assert.doesNotMatch(src, /ScrollSpyNav/);
    assert.doesNotMatch(src, /LinearWorkflowStepper/);
    assert.doesNotMatch(src, /TabDisplay/);
  });

  it('Create|Link lives in the Claim body for Displays and modal — not leaf trailing', () => {
    const panel = read(PANEL);
    assert.match(panel, /ClaimModeSelect/);
    assert.doesNotMatch(panel, /setLeafTrailing/);
    assert.doesNotMatch(panel, /ClaimWizardNav/);
    assert.doesNotMatch(panel, /placement="leaf-header"/);
  });

  it('empty tracking-seed Create helper mounts after mode select — not Link pick copy', () => {
    const panel = read(PANEL);
    const helper = read(
      'src/components/receiving/workspace/claim/components/ClaimEmptySeedCreateHelper.tsx',
    );
    const controller = read(
      'src/components/receiving/workspace/claim/hooks/useReceivingClaimController.ts',
    );
    assert.match(panel, /ClaimEmptySeedCreateHelper/);
    assert.match(helper, /autoCreateFromEmptyTracking/);
    assert.match(helper, /TrackingChip/);
    assert.match(helper, /OrderIdChip/);
    assert.doesNotMatch(helper, /PlatformMark/);
    assert.doesNotMatch(helper, /BrandIdentityDot/);
    assert.doesNotMatch(helper, /platformMetaBrandDot/);
    assert.match(helper, /No ticket/);
    assert.doesNotMatch(helper, /create below/);
    assert.match(helper, /claim-empty-seed-create-helper/);
    assert.doesNotMatch(helper, /Pick the existing ticket/);
    assert.doesNotMatch(helper, /No ticket matched tracking/);
    assert.match(controller, /autoCreateFromEmptyTracking/);
    assert.match(controller, /empty-seed-flip/);
    assert.match(controller, /nextAutoCreateFromEmptyTrackingFlag/);
    assert.doesNotMatch(
      controller,
      /toast\.info\(['"]No ticket matched this tracking/,
      'in-surface helper replaces the empty-seed toast',
    );
  });

  it('Link mounts find + photos + compose together (shared template body)', () => {
    const panel = read(PANEL);
    assert.match(
      panel,
      /\['find', 'photos', 'compose'\]/,
      'Link always shows picker + photos + compose',
    );
    assert.doesNotMatch(
      panel,
      /linkCommitStatus === 'committed'/,
      'compose must not wait for link commit',
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

  it('Claim compose mounts Platform · Type · Claim above Subject, then Body', () => {
    const compose = read(COMPOSE);
    const template = read(
      'src/components/receiving/workspace/claim/components/ClaimTemplateEditor.tsx',
    );
    assert.match(compose, /data-testid="claim-compose-carton-identity"/);
    assert.match(compose, /beforeSubject=\{beforeSubject\}/);
    assert.doesNotMatch(compose, /afterSubject=\{/);
    assert.match(compose, /useSourcePlatform/);
    assert.match(compose, /useReceivingType/);
    assert.match(compose, /applyCartonIdentity/);
    assert.match(compose, /ariaLabel="Platform"/);
    assert.match(compose, /ariaLabel="Type"/);
    assert.match(compose, /ariaLabel="Claim"/);
    assert.doesNotMatch(compose, /ariaLabel="Claim type"/);
    assert.match(compose, />\s*Claim\s*</);
    assert.doesNotMatch(compose, />\s*Claim type\s*</);
    assert.match(template, /beforeSubject/);
    // Platform · Type · Claim precede Subject; Subject precedes Body.
    assert.match(
      template,
      /\{beforeSubject\}[\s\S]*claim-subject[\s\S]*claim-body/,
      'order is Platform/Type/Claim → Subject → Body',
    );
    const claimIdx = compose.indexOf('ariaLabel="Claim"');
    const beforeSubjectProp = compose.indexOf('beforeSubject={beforeSubject}');
    assert.ok(claimIdx > 0 && beforeSubjectProp > claimIdx, 'Claim lives in beforeSubject');
  });
});
