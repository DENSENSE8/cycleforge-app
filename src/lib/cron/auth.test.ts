import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { isAuthorizedCronRequest, unauthorizedCronResponse } from './auth';

const originalCronSecret = process.env.CRON_SECRET;
const originalVercel = process.env.VERCEL;

afterEach(() => {
  if (originalCronSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalCronSecret;

  if (originalVercel === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = originalVercel;
});

describe('cron request authentication', () => {
  it('accepts the configured bearer secret', () => {
    process.env.CRON_SECRET = 'expected-secret';

    const headers = new Headers({ authorization: 'Bearer expected-secret' });

    assert.equal(isAuthorizedCronRequest(headers), true);
  });

  it('rejects missing, malformed, and incorrect bearer credentials', () => {
    process.env.CRON_SECRET = 'expected-secret';

    assert.equal(isAuthorizedCronRequest(new Headers()), false);
    assert.equal(
      isAuthorizedCronRequest(new Headers({ authorization: 'Basic expected-secret' })),
      false,
    );
    assert.equal(
      isAuthorizedCronRequest(new Headers({ authorization: 'Bearer wrong-secret' })),
      false,
    );
  });

  it('does not trust x-vercel-cron, even in a Vercel environment', () => {
    process.env.CRON_SECRET = 'expected-secret';
    process.env.VERCEL = '1';

    const headers = new Headers({ 'x-vercel-cron': '1' });

    assert.equal(isAuthorizedCronRequest(headers), false);
  });

  it('fails closed when CRON_SECRET is missing or blank', () => {
    delete process.env.CRON_SECRET;
    assert.equal(
      isAuthorizedCronRequest(new Headers({ authorization: 'Bearer undefined' })),
      false,
    );

    process.env.CRON_SECRET = '   ';
    assert.equal(isAuthorizedCronRequest(new Headers({ authorization: 'Bearer ' })), false);
  });

  it('returns the canonical unauthorized response', async () => {
    const response = unauthorizedCronResponse();
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'Unauthorized' });
  });
});
