import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isCredentialAuthFailure } from './credential-auth-failure';

test('isCredentialAuthFailure: token mint / OAuth failures', () => {
  assert.equal(isCredentialAuthFailure(new Error('Zoho token refresh failed: 400')), true);
  assert.equal(isCredentialAuthFailure(new Error('Zoho token refresh error: invalid_code')), true);
  assert.equal(isCredentialAuthFailure(new Error('invalid_grant')), true);
  assert.equal(isCredentialAuthFailure(new Error('Request failed with status 401')), true);
  assert.equal(isCredentialAuthFailure(new Error('No active Zoho connection for org x')), true);
  // Enriched mint messages from formatZohoTokenRefreshHttpError / BodyError.
  assert.equal(
    isCredentialAuthFailure(
      new Error('Zoho token refresh failed: 400 (invalid_code): The refresh token is revoked.'),
    ),
    true,
  );
  assert.equal(
    isCredentialAuthFailure(
      new Error('Zoho token refresh failed: 400 (invalid_client_secret): Client secret is invalid'),
    ),
    true,
  );
  assert.equal(
    isCredentialAuthFailure(
      new Error('Zoho token refresh error: invalid_code: already revoked'),
    ),
    true,
  );
});

test('isCredentialAuthFailure: resource / business misses do NOT poison the vault', () => {
  assert.equal(isCredentialAuthFailure(new Error('Purchase Order does not exist.')), false);
  assert.equal(
    isCredentialAuthFailure(
      new Error('The API call for this organization has exceeded the maximum call rate limit of 5,000'),
    ),
    false,
  );
  assert.equal(isCredentialAuthFailure(new Error('Select an item.')), false);
  assert.equal(isCredentialAuthFailure(new Error('Zoho circuit open for another 12s')), false);
});
