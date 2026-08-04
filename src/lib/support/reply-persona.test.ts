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

test('the system prompt opens with the resolved clause', () => {
  const prompt = buildSupportSystemPrompt({ businessName: 'Acme Resale' });
  assert.ok(prompt.startsWith('You are a senior customer-support agent for Acme Resale, a reseller.'));
  // The rules that make the draft safe survive the reframing.
  assert.match(prompt, /ONLY the grounding facts/);
  assert.match(prompt, /Never invent model numbers/);
});

/**
 * The regression this file exists for: a hardcoded brand in shared
 * multi-tenant code. A second tenant on that prompt got a model claiming to
 * work for a company they have no relationship with. Shrink-only — a vendor
 * name must never come back into the drafting path.
 */
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
