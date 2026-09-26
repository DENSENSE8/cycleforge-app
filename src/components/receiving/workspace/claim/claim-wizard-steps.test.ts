import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  claimSectionDomId,
  claimWizardStartStep,
  claimWizardStepsForMode,
} from './claim-types';

test('neither mode carries a Photos section any more', () => {
  for (const mode of ['create', 'link'] as const) {
    for (const seller of [false, true]) {
      const keys = claimWizardStepsForMode(mode, seller).map((s) => s.key);
      assert.ok(!keys.includes('photos' as never), `${mode} still lists Photos`);
      assert.ok(keys.includes('compose'), `${mode} lost the Ticket section`);
    }
  }
});

test('create opens on the ticket draft, link still opens on the picker', () => {
  assert.equal(claimWizardStartStep('create'), 'compose');
  assert.equal(claimWizardStartStep('link'), 'find');
  // The DOM id is what the panel scrolls to — a stale 'photos' id would scroll
  // to nothing rather than throw.
  assert.equal(claimSectionDomId('compose'), 'claim-section-compose');
});
