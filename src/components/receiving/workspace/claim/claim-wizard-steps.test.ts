import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  claimSectionDomId,
  claimWizardStartStep,
  claimWizardStepsForMode,
} from './claim-types';

const here = dirname(fileURLToPath(import.meta.url));
const src = (rel: string) => readFileSync(resolve(here, rel), 'utf8');

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

test('the claim panel mounts no photo grid and the controller holds no photo state', () => {
  // The panel renders in BOTH the rail and the centre, so a grid here is one
  // mount and one /api/receiving-photos pull per surface. Attaching is the
  // composer's job now.
  const panel = src('../ReceivingClaimPanel.tsx');
  assert.doesNotMatch(panel, /ClaimPhoto(Picker|sStep)/);
  assert.ok(!existsSync(resolve(here, 'components/ClaimPhotosStep.tsx')));

  const controller = src('hooks/useReceivingClaimController.ts');
  assert.doesNotMatch(controller, /useClaimPhotos/, 'controller must not pull the photo list');
  assert.doesNotMatch(controller, /attachPhotoIds/, 'claim POSTs must not carry an attach set');
});

test('the sticky footer still promises the backup, which never read the picker', () => {
  // `archiveAndStampReceivingClaimPhotos` sweeps the whole carton server-side —
  // independent of what the picker had selected, so it outlived the picker.
  const backup = src('components/ClaimBackupStep.tsx');
  assert.doesNotMatch(backup, /ReceivingClaimController|c\.photos/);
  assert.match(backup, /Backs up carton photos/);

  const filing = readFileSync(
    resolve(here, '../../../../lib/receiving/file-receiving-claim.ts'),
    'utf8',
  );
  const archiveCall = filing.slice(filing.indexOf('deps.archivePhotos({'));
  assert.doesNotMatch(
    archiveCall.slice(0, 400),
    /attachPhotoIds|photoIds/,
    'the NAS archive must stay independent of any attach selection',
  );

  const createRoute = readFileSync(
    resolve(here, '../../../../app/api/receiving/zendesk-claim/route.ts'),
    'utf8',
  );
  assert.match(
    createRoute,
    /archiveOk: filed\.archiveOk/,
    'create must return the auto-archive result so the filed step is not a false fail',
  );
});

test('the shared photo picker survives for its non-claim hosts', () => {
  // Deleting the hook with the claim's picker breaks Send-photo-note and
  // Move-photos, which mount the same grid for their own cartons.
  assert.ok(existsSync(resolve(here, 'hooks/useClaimPhotos.ts')));
  assert.ok(existsSync(resolve(here, 'components/ClaimPhotoPicker.tsx')));
  for (const host of ['../SendPhotoNotePanel.tsx', '../line-edit/MovePhotosBetweenPoPanel.tsx']) {
    assert.match(src(host), /useClaimPhotos/, `${host} lost its photo list`);
  }
});
