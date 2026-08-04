import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seedComposerDraft } from './composer-draft';

function harness(currentBody: string, answer = true) {
  const state = { body: currentBody, isPublic: false, confirms: 0, applied: 0 };
  return {
    state,
    run: (text: string, mode?: 'public' | 'internal') =>
      seedComposerDraft({
        currentBody: state.body,
        text,
        mode,
        applyBody: (t) => { state.body = t; },
        applyMode: (p) => { state.isPublic = p; },
        confirm: async () => { state.confirms += 1; return answer; },
        onApplied: () => { state.applied += 1; },
      }),
  };
}

test('empty composer: applies with NO confirm', async () => {
  const h = harness('');
  assert.equal(await h.run('Drafted reply.'), 'applied');
  assert.equal(h.state.body, 'Drafted reply.');
  assert.equal(h.state.confirms, 0);
  assert.equal(h.state.applied, 1);
});

test('whitespace-only composer counts as empty — no dialog about text that is not there', async () => {
  const h = harness('   \n  ');
  assert.equal(await h.run('Drafted reply.'), 'applied');
  assert.equal(h.state.confirms, 0);
});

test('operator text is NEVER clobbered without a confirm', async () => {
  const h = harness('I already typed this.', false);
  assert.equal(await h.run('Drafted reply.'), 'declined');
  // The whole point: their words survive.
  assert.equal(h.state.body, 'I already typed this.');
  assert.equal(h.state.confirms, 1);
  assert.equal(h.state.applied, 0);
});

test('confirming replaces the draft', async () => {
  const h = harness('I already typed this.', true);
  assert.equal(await h.run('Drafted reply.'), 'applied');
  assert.equal(h.state.body, 'Drafted reply.');
  assert.equal(h.state.confirms, 1);
});

test('re-inserting the SAME text needs no confirm', async () => {
  const h = harness('Drafted reply.');
  assert.equal(await h.run('  Drafted reply.  '), 'applied');
  assert.equal(h.state.confirms, 0);
});

test('mode sets the visibility toggle so a draft cannot land in the wrong lane', async () => {
  const h = harness('');
  await h.run('Hello customer.', 'public');
  assert.equal(h.state.isPublic, true);

  const h2 = harness('');
  h2.state.isPublic = true;
  await h2.run('Note to self.', 'internal');
  assert.equal(h2.state.isPublic, false);
});

test('no mode leaves the toggle alone', async () => {
  const h = harness('');
  h.state.isPublic = true;
  await h.run('Text.');
  assert.equal(h.state.isPublic, true);
});

test('empty draft text is a no-op, never a clear', async () => {
  const h = harness('I already typed this.');
  assert.equal(await h.run('   '), 'noop');
  assert.equal(h.state.body, 'I already typed this.');
  assert.equal(h.state.confirms, 0);
});
