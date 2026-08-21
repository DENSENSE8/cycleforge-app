/**
 * DB-free tests for the assistant write tools (propose_mutation / revert).
 * Run: npm run test:assistant
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWriteTools, type AssistantWriteDeps } from './write-tools';
import type { AssistantToolCtx } from './types';

const ORG = '11111111-2222-3333-4444-555555555555';
/**
 * A Studio admin who ALSO holds operations.view — the per-kind model means a
 * ctx now needs the permission for each kind it exercises, not one blanket gate.
 */
const CTX: AssistantToolCtx = {
  organizationId: ORG,
  staffId: 9,
  permissions: new Set(['assistant.chat', 'studio.manage', 'operations.view']),
};

function fakes(
  apply: (input: unknown) => ReturnType<AssistantWriteDeps['apply']>,
  revert: () => ReturnType<AssistantWriteDeps['revert']> = async () => ({ ok: true, status: 200 }),
) {
  const cap: { applied: unknown[] } = { applied: [] };
  const deps: AssistantWriteDeps = {
    apply: (async (input) => {
      cap.applied.push(input);
      return apply(input);
    }) as AssistantWriteDeps['apply'],
    revert: (async () => revert()) as AssistantWriteDeps['revert'],
  };
  return { deps, cap };
}

test('both tools carry the assistant.chat FLOOR; authority is per mutation kind', () => {
  // The blanket studio.manage gate is gone: it made the chat path both tighter
  // (a receiving operator could not ask for a move they could do by hand) and
  // looser (a Studio admin could make receiving changes without any receiving
  // permission) than the UI it shadows.
  const tools = buildWriteTools('asst-1');
  assert.deepEqual(tools.map((t) => t.name).sort(), ['propose_mutation', 'revert_mutation']);
  for (const t of tools) assert.equal(t.permission, 'assistant.chat');
});

test('propose_mutation refuses a kind the actor lacks permission for', async () => {
  const { deps, cap } = fakes(async () => ({ ok: true, status: 'applied', mutationId: 1, trust: 'auto', targetRef: '1' }));
  const [propose] = buildWriteTools('s', deps);
  const receivingOnly: AssistantToolCtx = {
    organizationId: ORG,
    staffId: 4,
    permissions: new Set(['assistant.chat', 'receiving.upload_photo']),
  };

  const out = (await propose.run(
    { mutationKind: 'staff.create', payload: { name: 'Nope' } },
    receivingOnly,
    {} as never,
  )) as { ok: boolean; error: string; httpStatus: number };

  assert.equal(out.ok, false);
  assert.equal(out.httpStatus, 403);
  assert.match(out.error, /admin\.manage_staff/, 'names the missing permission so the model can say which');
  assert.equal(cap.applied.length, 0, 'never reaches the chokepoint');
});

test('a receiving operator CAN move a photo without studio.manage', async () => {
  // The whole point of gap 3: the chat path now mirrors the hands-on route
  // (receiving.upload_photo), instead of demanding a Studio permission.
  const { deps, cap } = fakes(async () => ({ ok: true, status: 'applied', mutationId: 5, trust: 'auto', targetRef: '900' }));
  const [propose] = buildWriteTools('s', deps);
  const receivingOnly: AssistantToolCtx = {
    organizationId: ORG,
    staffId: 4,
    permissions: new Set(['assistant.chat', 'receiving.upload_photo']),
  };

  const out = (await propose.run(
    {
      mutationKind: 'receiving_photo.reassign',
      payload: { photoId: 900, targetEntityType: 'RECEIVING_LINE', targetEntityId: 800 },
    },
    receivingOnly,
    {} as never,
  )) as { ok: boolean; status: string };

  assert.equal(out.ok, true);
  assert.equal(out.status, 'applied');
  assert.equal(cap.applied.length, 1);
});

test('a Studio admin may NOT move a receiving photo without the receiving permission', async () => {
  // The other direction of the same fix — the gate is not merely looser.
  const { deps, cap } = fakes(async () => ({ ok: true, status: 'applied', mutationId: 6, trust: 'auto', targetRef: '900' }));
  const [propose] = buildWriteTools('s', deps);
  const studioOnly: AssistantToolCtx = {
    organizationId: ORG,
    staffId: 5,
    permissions: new Set(['assistant.chat', 'studio.manage']),
  };

  const out = (await propose.run(
    {
      mutationKind: 'receiving_photo.reassign',
      payload: { photoId: 900, targetEntityType: 'RECEIVING_LINE', targetEntityId: 800 },
    },
    studioOnly,
    {} as never,
  )) as { ok: boolean; httpStatus: number };

  assert.equal(out.ok, false);
  assert.equal(out.httpStatus, 403);
  assert.equal(cap.applied.length, 0);
});

test('an unknown mutation kind is rejected before the permission check', async () => {
  const { deps, cap } = fakes(async () => ({ ok: true, status: 'applied', mutationId: 1, trust: 'auto', targetRef: '1' }));
  const [propose] = buildWriteTools('s', deps);

  const out = (await propose.run(
    { mutationKind: 'photos.delete_everything', payload: {} },
    CTX,
    {} as never,
  )) as { ok: boolean; httpStatus: number; error: string };

  assert.equal(out.ok, false);
  assert.equal(out.httpStatus, 400);
  assert.equal(cap.applied.length, 0);
});

test('the advertised kind list is narrowed to what the actor may actually do', async () => {
  const receivingOnly = new Set(['assistant.chat', 'receiving.upload_photo']);
  const [propose] = buildWriteTools('s', undefined, receivingOnly);

  assert.match(propose.description, /receiving_photo\.reassign/);
  assert.ok(
    !propose.description.includes('staff.create'),
    'must not advertise kinds the actor cannot use — every one costs a wasted turn',
  );
});

test('propose_mutation: applied view-layer change threads org/staff/session from ctx, reports "applied"', async () => {
  const { deps, cap } = fakes(async () => ({ ok: true, status: 'applied', mutationId: 42, trust: 'auto', targetRef: '7' }));
  const [propose] = buildWriteTools('asst-77', deps);
  const out = (await propose.run(
    { mutationKind: 'feed_membership.set_state', payload: { feedKey: 'receiving_triage', entityType: 'RECEIVING', entityId: 7, state: 'done' } },
    CTX,
    {} as never,
  )) as { ok: boolean; status: string; mutationId: number; explanation: string };

  assert.equal(out.ok, true);
  assert.equal(out.status, 'applied');
  assert.equal(out.mutationId, 42);
  assert.match(out.explanation, /Applied now/);
  const applied = cap.applied[0] as { organizationId: string; proposedByStaffId: number; aiChatSessionId: string };
  assert.equal(applied.organizationId, ORG);
  assert.equal(applied.proposedByStaffId, 9); // from ctx, not the payload
  assert.equal(applied.aiChatSessionId, 'asst-77');
});

test('propose_mutation: draft edit explanation tells the user it hit their draft', async () => {
  const { deps } = fakes(async () => ({ ok: true, status: 'applied', mutationId: 1, trust: 'draft_scoped', targetRef: 'n-x' }));
  const [propose] = buildWriteTools('s', deps);
  const out = (await propose.run(
    { mutationKind: 'workflow_draft.add_node', payload: { definitionId: 12, type: 'inspection' } },
    CTX,
    {} as never,
  )) as { explanation: string };
  assert.match(out.explanation, /draft/i);
  assert.match(out.explanation, /revert/i);
});

test('permission and trust are DIFFERENT gates: an admin may ask, review still applies', async () => {
  // Holding admin.manage_staff answers "may you ask for this change".
  // trust='review' answers "how does it land" — a human still applies it.
  // Conflating the two is what the single studio.manage gate used to do.
  const { deps } = fakes(async () => ({ ok: true, status: 'proposed', mutationId: 5, trust: 'review', targetRef: null }));
  const [propose] = buildWriteTools('s', deps);
  const staffAdmin: AssistantToolCtx = {
    organizationId: ORG,
    staffId: 9,
    permissions: new Set(['assistant.chat', 'admin.manage_staff']),
  };
  const out = (await propose.run(
    { mutationKind: 'staff.create', payload: { name: 'X' } },
    staffAdmin,
    {} as never,
  )) as { status: string; explanation: string };
  assert.equal(out.status, 'proposed');
  assert.match(out.explanation, /review/i);
});

test('propose_mutation: a rejected mutation surfaces the error, not a throw', async () => {
  const { deps } = fakes(async () => ({ ok: false, status: 409, error: 'the active version is read-only' }));
  const [propose] = buildWriteTools('s', deps);
  const out = (await propose.run(
    { mutationKind: 'workflow_draft.add_node', payload: { definitionId: 12, type: 'inspection' } },
    CTX,
    {} as never,
  )) as { ok: boolean; error: string };
  assert.equal(out.ok, false);
  assert.match(out.error, /read-only/);
});

test('revert_mutation: passes the id + ctx org/staff to the revert chokepoint', async () => {
  const revertCalls: number[] = [];
  const deps: AssistantWriteDeps = {
    apply: (async () => ({ ok: true, status: 'applied', mutationId: 1, trust: 'auto', targetRef: null })) as AssistantWriteDeps['apply'],
    revert: (async (id: number) => {
      revertCalls.push(id);
      return { ok: true, status: 200 };
    }) as AssistantWriteDeps['revert'],
  };
  const [, revert] = buildWriteTools('s', deps);
  const out = (await revert.run({ mutationId: 55 }, CTX, {} as never)) as { ok: boolean; reverted: boolean };
  assert.equal(out.ok, true);
  assert.equal(out.reverted, true);
  assert.deepEqual(revertCalls, [55]);
});
