import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCompanionContext,
  buildCompanionHandoff,
  createCompanionSeqGuard,
  isCompanionPhoneMember,
  parseCompanionDraft,
  parseCompanionHandoff,
  parseCompanionSubmit,
} from './companion-composer';

test('buildCompanionContext never ships the skill fragment', () => {
  const ctx = buildCompanionContext(
    { page: 'packer-station', station: 'PACKING', selection: { kind: 'order', id: 42 }, skill: 'secret prompt' },
    '/packing?view=queue',
  );
  assert.deepEqual(ctx, {
    page: 'packer-station',
    station: 'PACKING',
    mode: null,
    selection: { kind: 'order', id: 42 },
    route: '/packing?view=queue',
  });
  assert.equal('skill' in ctx, false);
});

test('handoff round-trips through the wire parser', () => {
  const payload = buildCompanionHandoff(
    buildCompanionContext({ page: 'operations', mode: 'analytics' }, '/operations'),
    'req-1',
    new Date('2026-09-03T10:00:00Z'),
  );
  const parsed = parseCompanionHandoff(JSON.parse(JSON.stringify(payload)));
  assert.deepEqual(parsed, payload);
});

test('handoff with a null request id parses and wants no ack', () => {
  const parsed = parseCompanionHandoff({ request_id: null, context: { page: 'home' }, sent_at: '' });
  assert.ok(parsed);
  assert.equal(parsed.request_id, null);
  assert.equal(parsed.context.route, '/');
});

test('handoff without a page is rejected', () => {
  assert.equal(parseCompanionHandoff({ context: {} }), null);
  assert.equal(parseCompanionHandoff('nope'), null);
});

test('draft accepts empty text (phone cleared the field) but needs a seq', () => {
  assert.deepEqual(parseCompanionDraft({ text: '', seq: 3 }), { text: '', seq: 3, source: 'keyboard' });
  assert.deepEqual(parseCompanionDraft({ text: 'hi', seq: 4, source: 'voice' }), { text: 'hi', seq: 4, source: 'voice' });
  assert.equal(parseCompanionDraft({ text: 'hi' }), null);
  assert.equal(parseCompanionDraft({ text: 'hi', seq: -1 }), null);
});

test('submit rejects blank text', () => {
  assert.equal(parseCompanionSubmit({ text: '   ', seq: 1 }), null);
  assert.deepEqual(parseCompanionSubmit({ text: ' ship it ', seq: 9 }), { text: 'ship it', seq: 9 });
});

test('seq guard drops stale and duplicate messages', () => {
  const guard = createCompanionSeqGuard();
  assert.equal(guard.accept(1), true);
  assert.equal(guard.accept(3), true);
  assert.equal(guard.accept(2), false);
  assert.equal(guard.accept(3), false);
  guard.reset();
  assert.equal(guard.accept(0), true);
});

test('phone presence member is recognised by its data, not its client id', () => {
  assert.equal(isCompanionPhoneMember({ data: { device: 'phone' } }), true);
  assert.equal(isCompanionPhoneMember({ data: { device: 'desk' } }), false);
  assert.equal(isCompanionPhoneMember({}), false);
  assert.equal(isCompanionPhoneMember(null), false);
});
