import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseIntegrationPayloadInput,
} from './credential-schemas';
import { mergeVaultPayload, maskSecretValue } from './credential-payload';

describe('credential-schemas', () => {
  it('validates Zendesk credentials', () => {
    const r = parseIntegrationPayloadInput('zendesk', {
      subdomain: 'acme',
      email: 'ops@acme.com',
      apiToken: 'secret-token',
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.payload.subdomain, 'acme');
    }
  });

  it('rejects invalid Zendesk email', () => {
    const r = parseIntegrationPayloadInput('zendesk', {
      subdomain: 'acme',
      email: 'not-an-email',
      apiToken: 'secret-token',
    });
    assert.equal(r.ok, false);
  });

  it('strips blank secrets in partial mode', () => {
    const r = parseIntegrationPayloadInput(
      'zendesk',
      { subdomain: 'acme', email: 'ops@acme.com', apiToken: '' },
      { partial: true },
    );
    assert.equal(r.ok, true);
    if (r.ok) assert.equal('apiToken' in r.payload, false);
  });
});

describe('credential-payload', () => {
  it('mergeVaultPayload keeps existing secrets when incoming is blank', () => {
    const merged = mergeVaultPayload(
      'zendesk',
      { subdomain: 'old', email: 'old@acme.com', apiToken: 'keep-me' },
      { subdomain: 'new', email: 'new@acme.com', apiToken: '' },
    );
    assert.equal(merged.subdomain, 'new');
    assert.equal(merged.apiToken, 'keep-me');
  });

  it('maskSecretValue shows last eight chars', () => {
    assert.equal(maskSecretValue('abcdefghij'), '••••ghij');
  });
});
