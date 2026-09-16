import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isCredentialAuthFailure,
  isTransientCredentialFailure,
} from './credential-auth-failure';

/**
 * The exact prod message that latched Zoho off for 25 h on 2026-09-14. It
 * contains "token refresh", so the auth classifier used to claim it and flip
 * organization_integrations.status to 'error' — a state only a human OAuth run
 * cleared. It is a 10-minute throttle. It MUST classify as transient only.
 */
const ZOHO_MINT_THROTTLE =
  'Zoho token refresh failed: 400 (Access Denied): You have made too many requests continuously. Please try again after some time.';

test('mint throttle is transient and never a dead credential', () => {
  assert.equal(isTransientCredentialFailure(new Error(ZOHO_MINT_THROTTLE)), true);
  assert.equal(isCredentialAuthFailure(new Error(ZOHO_MINT_THROTTLE)), false);
});

test('isTransientCredentialFailure: throttles, timeouts, upstream 5xx, open breaker', () => {
  for (const message of [
    'Zoho API error 429',
    'The API call for this organization has exceeded the maximum call rate limit of 5,000',
    'Zoho rate limit',
    'request timed out after 10000ms',
    'fetch failed',
    'read ECONNRESET',
    'Zoho API error 503 Service Unavailable',
    'Zoho circuit open for another 12s',
  ]) {
    assert.equal(isTransientCredentialFailure(new Error(message)), true, message);
    assert.equal(isCredentialAuthFailure(new Error(message)), false, message);
  }
});

test('isTransientCredentialFailure: real credential deaths are NOT transient', () => {
  for (const message of [
    'Zoho token refresh error: invalid_code: already revoked',
    'invalid_grant',
    'Request failed with status 401',
    'No active Zoho connection for org x',
  ]) {
    assert.equal(isTransientCredentialFailure(new Error(message)), false, message);
    assert.equal(isCredentialAuthFailure(new Error(message)), true, message);
  }
});

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
