import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatZohoTokenRefreshBodyError,
  formatZohoTokenRefreshHttpError,
  parseZohoTokenErrorBody,
} from '@/lib/zoho/token-refresh-error';

describe('parseZohoTokenErrorBody', () => {
  it('reads error + error_description from JSON', () => {
    assert.deepEqual(
      parseZohoTokenErrorBody(
        JSON.stringify({
          error: 'invalid_code',
          error_description: 'The refresh token is revoked.',
        }),
      ),
      { error: 'invalid_code', errorDescription: 'The refresh token is revoked.' },
    );
  });

  it('reads invalid_client_secret', () => {
    assert.equal(
      parseZohoTokenErrorBody(JSON.stringify({ error: 'invalid_client_secret' })).error,
      'invalid_client_secret',
    );
  });

  it('treats plain text as description', () => {
    assert.deepEqual(parseZohoTokenErrorBody('not json at all'), {
      errorDescription: 'not json at all',
    });
  });

  it('handles empty body', () => {
    assert.deepEqual(parseZohoTokenErrorBody(''), {});
    assert.deepEqual(parseZohoTokenErrorBody('   '), {});
  });
});

describe('formatZohoTokenRefreshHttpError', () => {
  it('includes status, code, and description', () => {
    const msg = formatZohoTokenRefreshHttpError(
      400,
      JSON.stringify({
        error: 'invalid_code',
        error_description: 'already revoked',
      }),
    );
    assert.match(msg, /token refresh failed: 400/);
    assert.match(msg, /invalid_code/);
    assert.match(msg, /already revoked/);
  });

  it('status-only when body empty', () => {
    assert.equal(formatZohoTokenRefreshHttpError(400, ''), 'Zoho token refresh failed: 400');
  });

  it('plain body without JSON code', () => {
    const msg = formatZohoTokenRefreshHttpError(401, 'Unauthorized');
    assert.equal(msg, 'Zoho token refresh failed: 401: Unauthorized');
  });
});

describe('formatZohoTokenRefreshBodyError', () => {
  it('includes description when present', () => {
    assert.equal(
      formatZohoTokenRefreshBodyError({
        error: 'invalid_code',
        error_description: 'bad grant',
      }),
      'Zoho token refresh error: invalid_code: bad grant',
    );
  });

  it('code only when no description', () => {
    assert.equal(
      formatZohoTokenRefreshBodyError({ error: 'invalid_token' }),
      'Zoho token refresh error: invalid_token',
    );
  });
});
