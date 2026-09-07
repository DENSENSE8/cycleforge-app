/**
 * Session-memory cohort tripwire.
 *
 * Run: `node --import tsx --test src/lib/assistant/session-memory-cohort.test.ts`
 *
 * These assertions read the ENGINE SOURCE, not a rendered tree: the laws they
 * defend are shapes a refactor silently loses — a restore branch deleted, a
 * glyph resolver that asks the href first, a re-pin that hand-picks fields and
 * drops the session binding. Each one had already regressed once (measured
 * 2026-09-07), so the grep is the ratchet that stops the second time.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PIN_FACE_RESOLVERS,
  SESSION_MEMORY_CONTRACT,
  SESSION_MEMORY_CONTRACT_FILES,
  SESSION_MEMORY_ENGINE,
  SESSION_MEMORY_FORBIDDEN,
  SESSION_MEMORY_FORBIDDEN_FILES,
  sessionMemorySource,
} from './session-memory-cohort';

/** A contract marker is literal text — escape it before it becomes a regex. */
const lit = (marker: string) => new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

test('every engine file the cohort names exists', () => {
  for (const [alias, rel] of Object.entries(SESSION_MEMORY_ENGINE)) {
    assert.doesNotThrow(() => sessionMemorySource(rel), `${alias} -> ${rel}`);
  }
});

test('every contract marker is present in the file that owns it', () => {
  for (const [name, marker] of Object.entries(SESSION_MEMORY_CONTRACT)) {
    const rel = SESSION_MEMORY_CONTRACT_FILES[name as keyof typeof SESSION_MEMORY_CONTRACT];
    assert.ok(rel, `${name} names no engine file — an unenforceable law`);
    assert.match(sessionMemorySource(rel), lit(marker), `${name} missing from ${rel}`);
  }
});

test('no forbidden shape survives in the files it is swept over', () => {
  for (const [name, pattern] of Object.entries(SESSION_MEMORY_FORBIDDEN)) {
    const files = SESSION_MEMORY_FORBIDDEN_FILES[name as keyof typeof SESSION_MEMORY_FORBIDDEN];
    assert.ok(files?.length, `${name} sweeps no files`);
    for (const rel of files) {
      assert.doesNotMatch(sessionMemorySource(rel), pattern, `${name} in ${rel}`);
    }
  }
});

test('a session pin is asked what it IS before where it points', () => {
  for (const rel of PIN_FACE_RESOLVERS) {
    const src = sessionMemorySource(rel);
    const start = src.indexOf('function resolvePinIcon');
    assert.notEqual(start, -1, `${rel} has no resolvePinIcon`);
    const body = src.slice(start, src.indexOf('\n}', start));
    const session = body.indexOf('isSessionPin(');
    const href = body.indexOf('masterNavFaceForPinHref(');
    assert.notEqual(session, -1, `${rel} never asks isSessionPin — threads wear the Home glyph`);
    assert.notEqual(href, -1, `${rel} no longer resolves an href face`);
    assert.ok(
      session < href,
      `${rel} resolves the href face first; '/?session=<id>' is the Home face, so every pinned thread would paint as Home`,
    );
  }
});

test('the restore write clears the tombstone it does not stamp one', () => {
  const src = sessionMemorySource(SESSION_MEMORY_ENGINE.sessionRoute);
  const restore = src.indexOf('body.restore === true');
  assert.notEqual(restore, -1, 'the restore branch is gone — delete became irreversible');
  const branch = src.slice(restore, restore + 900);
  assert.match(branch, lit('deletedAt: null'), 'restore must clear deleted_at');
  assert.doesNotMatch(branch, /deletedAt:\s*sql/, 'restore must not stamp a tombstone');
});

test('the delete write is an update, and both halves are tenant-scoped', () => {
  const src = sessionMemorySource(SESSION_MEMORY_ENGINE.sessionRoute);
  assert.match(src, /\.update\(aiChatSessions\)/, 'a session row is tombstoned, never dropped');
  const orgScopes = src.match(/eq\(aiChatSessions\.organizationId/g) ?? [];
  assert.ok(
    orgScopes.length >= 3,
    `restore, rename and delete each scope to the org; found ${orgScopes.length}`,
  );
});

test('the undo hand-back converts a whole stored pin', () => {
  const src = sessionMemorySource(SESSION_MEMORY_ENGINE.pinUndo);
  assert.match(
    src,
    /pinAt\(pinInputFromPinned\(pin\)/,
    'the re-pin must go through the total converter — a field subset drops sessionId',
  );
});

test('insertPin persists the session binding, exactly like addPin', () => {
  const src = sessionMemorySource(SESSION_MEMORY_ENGINE.pinStorage);
  const writes = src.match(/sessionId: input\.sessionId \|\| undefined/g) ?? [];
  assert.equal(
    writes.length,
    2,
    'both pin writers (addPin, insertPin) must carry the binding; a writer without it loses the thread on undo',
  );
});
