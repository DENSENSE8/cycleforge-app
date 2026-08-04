import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeVisionLane, resolveSupportVisionLane } from './vision-lane';

test('nothing configured anywhere ⇒ local-only (the local-first default)', () => {
  assert.equal(
    resolveSupportVisionLane({ orgLane: null, envLane: undefined, cloudAvailable: true }),
    'local-only',
  );
});

test('the org setting wins over the deployment env', () => {
  assert.equal(
    resolveSupportVisionLane({
      orgLane: 'cloud-multimodal',
      envLane: 'local-only',
      cloudAvailable: true,
    }),
    'cloud-multimodal',
  );
  assert.equal(
    resolveSupportVisionLane({
      orgLane: 'local-only',
      envLane: 'cloud-multimodal',
      cloudAvailable: true,
    }),
    'local-only',
  );
});

/**
 * The load-bearing one: an org can ASK for the cloud lane and still get
 * local-only. Reporting `cloud-multimodal` when nothing was configured to send
 * an image would tell the operator their customer's photo left the building.
 */
test('cloud-multimodal is a request, not a guarantee', () => {
  assert.equal(
    resolveSupportVisionLane({
      orgLane: 'cloud-multimodal',
      envLane: null,
      cloudAvailable: false,
    }),
    'local-only',
  );
});

test('an unrecognised value falls through instead of failing open', () => {
  assert.equal(normalizeVisionLane('gpt-please'), null);
  assert.equal(
    resolveSupportVisionLane({ orgLane: 'gpt-please', envLane: null, cloudAvailable: true }),
    'local-only',
  );
});

test('the aliases an operator or an env var actually types', () => {
  assert.equal(normalizeVisionLane('cloud'), 'cloud-multimodal');
  assert.equal(normalizeVisionLane('multimodal'), 'cloud-multimodal');
  assert.equal(normalizeVisionLane('LOCAL'), 'local-only');
  assert.equal(normalizeVisionLane('off'), 'local-only');
  assert.equal(normalizeVisionLane(''), null);
});
