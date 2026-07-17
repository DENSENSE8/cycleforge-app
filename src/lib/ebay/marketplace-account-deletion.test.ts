import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, test } from 'node:test';
import {
  buildChallengeResponse,
  extractDeletionSubjects,
  isValidVerificationToken,
  parseEbaySignatureHeader,
} from './marketplace-account-deletion';

describe('buildChallengeResponse', () => {
  test('matches sequential SHA-256(code + token + endpoint) hex (eBay SDK)', () => {
    const challengeCode = '1234567890abcdef';
    const token = 'a'.repeat(32);
    const endpoint =
      'https://app.cycleforge.ai/api/webhooks/ebay/marketplace-account-deletion';

    const expected = createHash('sha256')
      .update(challengeCode)
      .update(token)
      .update(endpoint)
      .digest('hex');

    assert.equal(buildChallengeResponse(challengeCode, token, endpoint), expected);
  });

  test('differs when endpoint URL differs by a single character', () => {
    const code = 'challenge';
    const token = 'b'.repeat(40);
    const a = buildChallengeResponse(code, token, 'https://app.cycleforge.ai/api/webhooks/ebay/marketplace-account-deletion');
    const b = buildChallengeResponse(code, token, 'https://app.cycleforge.ai/api/webhooks/ebay/marketplace-account-deletion/');
    assert.notEqual(a, b);
  });
});

describe('isValidVerificationToken', () => {
  test('accepts 32–80 [A-Za-z0-9_-]', () => {
    assert.equal(isValidVerificationToken('a'.repeat(32)), true);
    assert.equal(isValidVerificationToken('Abc_123-xyz'.padEnd(40, '0')), true);
    assert.equal(isValidVerificationToken('z'.repeat(80)), true);
  });

  test('rejects short, long, or illegal chars', () => {
    assert.equal(isValidVerificationToken('too-short'), false);
    assert.equal(isValidVerificationToken('a'.repeat(31)), false);
    assert.equal(isValidVerificationToken('a'.repeat(81)), false);
    assert.equal(isValidVerificationToken(`${'a'.repeat(31)}!`), false);
    assert.equal(isValidVerificationToken(`${'a'.repeat(31)} `), false);
  });
});

describe('parseEbaySignatureHeader', () => {
  test('decodes base64 JSON kid+signature', () => {
    const payload = Buffer.from(
      JSON.stringify({ alg: 'sha1', kid: 'key-1', signature: 'abc=', digest: 'SHA1' }),
    ).toString('base64');
    const parsed = parseEbaySignatureHeader(payload);
    assert.deepEqual(parsed, { alg: 'sha1', kid: 'key-1', signature: 'abc=', digest: 'SHA1' });
  });

  test('returns null for garbage or missing fields', () => {
    assert.equal(parseEbaySignatureHeader('not-base64-json!!!'), null);
    const missing = Buffer.from(JSON.stringify({ alg: 'sha1' })).toString('base64');
    assert.equal(parseEbaySignatureHeader(missing), null);
  });
});

describe('extractDeletionSubjects', () => {
  test('pulls userId, username, notificationId', () => {
    assert.deepEqual(
      extractDeletionSubjects({
        metadata: { topic: 'MARKETPLACE_ACCOUNT_DELETION' },
        notification: {
          notificationId: 'n-1',
          data: { userId: 'u123', username: 'seller_x', eiasToken: 'eias' },
        },
      }),
      { userId: 'u123', username: 'seller_x', notificationId: 'n-1' },
    );
  });

  test('nulls empty subjects', () => {
    assert.deepEqual(extractDeletionSubjects({}), {
      userId: null,
      username: null,
      notificationId: null,
    });
  });
});
