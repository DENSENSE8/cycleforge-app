import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSupportSystemPrompt, supportReplyPersonaClause } from './reply-persona';

test('no persona ⇒ generic clause, never anyone’s brand', () => {
  assert.equal(supportReplyPersonaClause(null), 'a reseller');
  assert.equal(supportReplyPersonaClause({}), 'a reseller');
  assert.equal(supportReplyPersonaClause({ businessName: '  ', vertical: '' }), 'a reseller');
});

test('the tenant’s own name and vertical frame the agent', () => {
  assert.equal(
    supportReplyPersonaClause({ businessName: 'USAV Solutions', vertical: 'audio' }),
    'USAV Solutions, an audio reseller',
  );
  assert.equal(supportReplyPersonaClause({ businessName: 'USAV Solutions' }), 'USAV Solutions, a reseller');
  assert.equal(supportReplyPersonaClause({ vertical: 'networking' }), 'a networking reseller');
});

test('the system prompt speaks for the resolved tenant', () => {
  assert.ok(buildSupportSystemPrompt({ businessName: 'Acme Resale' }).includes('Acme Resale, a reseller'));
});

/** The regression this file exists for: */
test('no vendor brand is hardcoded anywhere in the drafting path', () => {
  for (const file of ['./src/lib/support/suggest-reply.ts', './src/lib/support/reply-persona.ts']) {
    const src = readFileSync(file, 'utf8');
    assert.equal(
      /\bBose\b/i.test(src),
      false,
      `${file} names a vendor brand — the tenant framing must resolve from org settings`,
    );
  }
});
