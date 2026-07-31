import test from 'node:test';
import assert from 'node:assert/strict';
import { reparentReceivingCartonPhotos } from './reparent-carton-photos';
import type { TxClient } from './relink-po';

test('reparentReceivingCartonPhotos no-ops when from === to', async () => {
  const queries: string[] = [];
  const client: TxClient = {
    query: async (text) => {
      queries.push(text);
      return { rows: [], rowCount: 0 };
    },
  };
  const res = await reparentReceivingCartonPhotos(
    { orgId: 'org-1', fromReceivingId: 5, toReceivingId: 5 },
    client,
  );
  assert.equal(res.moved, 0);
  assert.equal(queries.length, 0);
});

test('reparentReceivingCartonPhotos moves carton + line links and stamps po_ref', async () => {
  const queries: Array<{ text: string; params: unknown[] }> = [];
  const client: TxClient = {
    query: async (text, params = []) => {
      queries.push({ text, params });
      if (/UPDATE photo_entity_links\b/.test(text) && /entity_type = 'RECEIVING'/.test(text) && !/FROM receiving_line/.test(text)) {
        return { rows: [{ photo_id: 10 }, { photo_id: 11 }], rowCount: 2 };
      }
      if (/FROM receiving_line/.test(text)) {
        return { rows: [{ photo_id: 12 }], rowCount: 1 };
      }
      return { rows: [], rowCount: 3 };
    },
  };

  const res = await reparentReceivingCartonPhotos(
    {
      orgId: 'org-1',
      fromReceivingId: 50292,
      toReceivingId: 49932,
      poRef: '23-14904-89272',
    },
    client,
  );

  assert.equal(res.moved, 3);
  assert.deepEqual(res.photoIds.sort((a, b) => a - b), [10, 11, 12]);

  const cartonMove = queries.find(
    (q) => /UPDATE photo_entity_links/.test(q.text) && !/FROM receiving_line/.test(q.text),
  );
  assert.ok(cartonMove);
  assert.deepEqual(cartonMove!.params.slice(0, 3), [49932, 'org-1', 50292]);

  const poRefUpdate = queries.find((q) => /UPDATE photos/.test(q.text));
  assert.ok(poRefUpdate);
  assert.equal(poRefUpdate!.params[2], '23-14904-89272');
});
