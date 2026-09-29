import assert from 'node:assert/strict';
import test from 'node:test';

import { shippingCredentialRecoveryPredicate } from './credential-recovery';

test('credential recovery is disabled while no carrier credentials exist', () => {
  assert.equal(shippingCredentialRecoveryPredicate({ ups: false, fedex: false }), null);
});

test('credential recovery only releases the carrier whose credentials now exist', () => {
  const ups = shippingCredentialRecoveryPredicate({ ups: true, fedex: false });
  assert.match(ups ?? '', /upper\(carrier\) = 'UPS'/);
  assert.doesNotMatch(ups ?? '', /FEDEX_CLIENT_ID/);

  const fedex = shippingCredentialRecoveryPredicate({ ups: false, fedex: true });
  assert.match(fedex ?? '', /upper\(carrier\) = 'FEDEX'/);
  assert.doesNotMatch(fedex ?? '', /UPS_CLIENT_ID/);
});

test('credential recovery is narrow to the persisted missing-secret failure', () => {
  const predicate = shippingCredentialRecoveryPredicate({ ups: true, fedex: true });
  assert.match(predicate ?? '', /last_error_code = 'SYNC_ERROR'/);
  assert.match(predicate ?? '', /UPS_CLIENT_ID and UPS_CLIENT_SECRET are required/);
  assert.match(predicate ?? '', /FEDEX_CLIENT_ID and FEDEX_CLIENT_SECRET are required/);
});
