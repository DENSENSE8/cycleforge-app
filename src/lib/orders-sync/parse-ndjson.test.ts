/**
 *   npx tsx --test src/lib/orders-sync/parse-ndjson.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  consumeNdjsonBuffer,
  consumeNdjsonTrailing,
  malformedToErrorEvent,
} from './parse-ndjson';

describe('consumeNdjsonBuffer', () => {
  it('splits complete lines and keeps a partial tail for the next chunk', () => {
    const first = consumeNdjsonBuffer<{ type: string; n?: number }>(
      '{"type":"phase","n":1}\n{"type":"exception","n":2}\n{"type":"exc',
    );
    assert.deepEqual(first.events, [
      { type: 'phase', n: 1 },
      { type: 'exception', n: 2 },
    ]);
    assert.equal(first.rest, '{"type":"exc');
    assert.deepEqual(first.malformed, []);

    const second = consumeNdjsonBuffer<{ type: string; n?: number }>(
      first.rest + 'eption","n":3}\n',
    );
    assert.deepEqual(second.events, [{ type: 'exception', n: 3 }]);
    assert.equal(second.rest, '');
  });

  it('surfaces a malformed line without killing the rest of the chunk', () => {
    const out = consumeNdjsonBuffer('{"type":"ok"}\nNOT-JSON\n{"type":"still"}\n');
    assert.deepEqual(out.events, [{ type: 'ok' }, { type: 'still' }]);
    assert.deepEqual(out.malformed, ['NOT-JSON']);
  });
});

describe('consumeNdjsonTrailing / malformedToErrorEvent', () => {
  it('parses a final line that never got a trailing newline', () => {
    const out = consumeNdjsonTrailing('{"type":"result","ok":true}');
    assert.deepEqual(out.events, [{ type: 'result', ok: true }]);
    assert.deepEqual(out.malformed, []);
  });

  it('maps a bad line to a typed error event the UI already understands', () => {
    const err = malformedToErrorEvent<{ type: string; error: string }>('nope');
    assert.equal(err.type, 'error');
    assert.match(err.error, /Malformed sync event/);
  });
});
