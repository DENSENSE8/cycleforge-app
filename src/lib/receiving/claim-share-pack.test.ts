import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildClaimSharePack, claimOpeningBody } from './claim-share-pack';

const ORG = '00000000-0000-0000-0000-000000000001';
const pack = { packId: 7, publicToken: 't', shareUrl: 'https://x/s/t', expiresAt: null };

test('the pack link rides in the message, not after it', () => {
  const body = claimOpeningBody('Issue: Damage\nItem: Speakers', 'https://x/s/abc');
  assert.match(body, /Photo share pack: https:\/\/x\/s\/abc/);
  // ONE message: the link is part of the body the ticket opens with.
  assert.ok(body.startsWith('Issue: Damage'));
  assert.equal(body.split('Photo share pack:').length, 2, 'exactly one pack line');
});

test('no pack means no pack line — never an empty label', () => {
  assert.equal(claimOpeningBody('Issue: Damage', null), 'Issue: Damage');
});

test('an explicit attach set is what gets shared; empty falls back to the carton', async () => {
  let sawIds: number[] = [];
  const createPack = (async (input: { photoIds: number[] }) => {
    sawIds = input.photoIds;
    return pack;
  }) as never;
  const listPhotos = (async () => [11, 12, 13]) as never;

  await buildClaimSharePack({
    orgId: ORG, staffId: 1, receivingId: 5, photoIds: [4, 9], origin: 'https://x',
    createPack, listPhotos,
  });
  assert.deepEqual(sawIds, [4, 9]);

  await buildClaimSharePack({
    orgId: ORG, staffId: 1, receivingId: 5, photoIds: [], origin: 'https://x',
    createPack, listPhotos,
  });
  assert.deepEqual(sawIds, [11, 12, 13], 'no attach set → every carton photo');
});

test('the pack is named by the carton — it is built before a ticket exists', async () => {
  let title = '';
  let ticketId: unknown = 'unset';
  const createPack = (async (input: { title: string; zendeskTicketId?: number }) => {
    title = input.title;
    ticketId = input.zendeskTicketId;
    return pack;
  }) as never;
  const out = await buildClaimSharePack({
    orgId: ORG, staffId: 1, receivingId: 42, photoIds: [1], origin: 'https://x',
    createPack, listPhotos: (async () => []) as never,
  });
  assert.match(title, /carton 42/);
  assert.equal(ticketId, undefined, 'no ticket id yet — the caller backfills it');
  assert.deepEqual(out, { packId: 7, shareUrl: 'https://x/s/t', photoIds: [1] });
});

test('a claim is never blocked on its photo link', async () => {
  const boom = (async () => {
    throw new Error('share service down');
  }) as never;
  assert.equal(
    await buildClaimSharePack({
      orgId: ORG, staffId: 1, receivingId: 5, photoIds: [1], origin: 'https://x',
      createPack: boom, listPhotos: (async () => []) as never,
    }),
    null,
  );
  // No origin / no staff → nothing to build, quietly.
  assert.equal(
    await buildClaimSharePack({
      orgId: ORG, staffId: null, receivingId: 5, photoIds: [1], origin: 'https://x',
      createPack: boom, listPhotos: (async () => []) as never,
    }),
    null,
  );
});
