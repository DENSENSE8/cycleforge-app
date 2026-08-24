/**
 * DB-free unit tests for the applyAgentMutation chokepoint (universal-feed
 * plan §2.6). A fake tenant client scripts row reads and captures writes; a
 * fake sideEffects captures the post-commit audit/ops/Ably payload.
 * Run: npm run test:assistant
 */

// The @/lib/workflow barrel (imported below for hasNode's node-type registry)
// transitively loads @/lib/drizzle/db, which needs a well-formed DATABASE_URL
// at load. `npm run test:assistant` supplies one via tsx's .env injection; no
// query ever runs (every DB call goes through the injected fake client).
import '@/lib/assistant/test-db-url'; // MUST be first: sets DATABASE_URL before the barrel loads
import { test } from 'node:test';
import assert from 'node:assert/strict';
import '@/lib/workflow'; // side-effect: registers built-in node types (hasNode)
import {
  applyAgentMutation,
  revertAgentMutation,
  type AgentMutationSideEffects,
  type ApplyAgentMutationDeps,
} from './apply-agent-mutation';
import { applySessionAction } from '@/lib/reversibility/apply-session-action';

const ORG = '11111111-2222-3333-4444-555555555555';

interface Cap {
  queries: Array<{ text: string; params: ReadonlyArray<unknown> }>;
  side: AgentMutationSideEffects[];
}

/**
 * scriptRows(text) → rows for a matching SELECT/RETURNING; default the
 * agent_mutations INSERT returns id 500.
 */
function fakes(scriptRows: (text: string) => Array<Record<string, unknown>> = () => []) {
  const cap: Cap = { queries: [], side: [] };
  let nextMutationId = 500;
  const client = {
    async query(text: string, params: ReadonlyArray<unknown> = []) {
      cap.queries.push({ text, params });
      if (text.includes('INSERT INTO agent_mutations')) {
        return { rows: [{ id: nextMutationId++ }], rowCount: 1 };
      }
      const rows = scriptRows(text);
      return { rows, rowCount: rows.length };
    },
  };
  const deps: ApplyAgentMutationDeps = {
    runTransaction: async (_orgId, fn) => fn(client as never),
    sideEffects: async (e) => {
      cap.side.push(e);
    },
  };
  return { deps, cap };
}

test('review-class (staff.create): proposes only, never applies', async () => {
  const { deps, cap } = fakes();
  const out = await applyAgentMutation(
    { organizationId: ORG, mutationKind: 'staff.create', payload: { name: 'New Tech' }, proposedByStaffId: 3 },
    deps,
  );
  assert.deepEqual(out, {
    ok: true,
    status: 'proposed',
    mutationId: 500,
    trust: 'review',
    targetRef: null,
    // A proposal APPLIED nothing, so it is not 'irreversible' either — that
    // word describes a change that happened.
    reversibility: 'unknown',
    irreversibleReason: null,
  });
  // Only the proposal INSERT (+ no affects, no dispatch write).
  const inserts = cap.queries.filter((q) => q.text.includes('INSERT INTO agent_mutations'));
  assert.equal(inserts.length, 1);
  assert.ok(inserts[0].text.includes("'proposed'"));
  assert.equal(cap.side[0].action, 'agent_mutation.propose');
  // No staff table touched.
  assert.ok(!cap.queries.some((q) => q.text.includes('INSERT INTO staff')));
});

test('auto-class (staff_rail_exclusion.insert): applies + affects + side-effects', async () => {
  const { deps, cap } = fakes();
  const out = await applyAgentMutation(
    {
      organizationId: ORG,
      mutationKind: 'staff_rail_exclusion.insert',
      payload: { staffId: 4, station: 'PACKING', feedKey: 'receiving_triage', entityType: 'RECEIVING', entityId: 77 },
      proposedByStaffId: 4,
    },
    deps,
  );
  assert.equal(out.ok, true);
  assert.equal((out as { status: string }).status, 'applied');
  assert.equal((out as { trust: string }).trust, 'auto');
  assert.equal((out as { targetRef: string }).targetRef, '77');

  assert.ok(cap.queries.some((q) => q.text.includes('INSERT INTO staff_rail_exclusions')));
  const mut = cap.queries.find((q) => q.text.includes('INSERT INTO agent_mutations'))!;
  assert.ok(mut.text.includes("'applied'"));
  // extra_audit carries the inverse for revert.
  const extra = JSON.parse(String(mut.params[5])) as { inverse: { kind: string } };
  assert.equal(extra.inverse.kind, 'staff_rail_exclusion.delete');
  assert.ok(cap.queries.some((q) => q.text.includes('INSERT INTO agent_mutation_affects')));
  assert.equal(cap.side[0].action, 'agent_mutation.apply');
});

test('draft-scoped (workflow_draft.add_node): validates draft + node type, mints id, applies', async () => {
  const { deps, cap } = fakes((text) => {
    if (text.includes('FROM workflow_definitions') && text.includes('FOR UPDATE')) {
      return [{ id: 12, is_active: false }]; // a draft
    }
    return [];
  });
  const out = await applyAgentMutation(
    { organizationId: ORG, mutationKind: 'workflow_draft.add_node', payload: { definitionId: 12, type: 'inspection' } },
    deps,
  );
  assert.equal(out.ok, true);
  assert.equal((out as { status: string }).status, 'applied');
  const targetRef = (out as { targetRef: string }).targetRef;
  assert.match(targetRef, /^n-/); // minted node id
  assert.ok(cap.queries.some((q) => q.text.includes('INSERT INTO workflow_nodes')));
});

test('draft-scoped rejects edits to the ACTIVE version (409)', async () => {
  const { deps } = fakes((text) =>
    text.includes('FROM workflow_definitions') && text.includes('FOR UPDATE') ? [{ id: 12, is_active: true }] : [],
  );
  const out = await applyAgentMutation(
    { organizationId: ORG, mutationKind: 'workflow_draft.add_node', payload: { definitionId: 12, type: 'inspection' } },
    deps,
  );
  assert.deepEqual(out, { ok: false, status: 409, error: 'the active version is read-only — edit a draft and publish it' });
});

test('unknown node type in a draft edit → 400 (mapped from the 422 writer status)', async () => {
  const { deps } = fakes((text) =>
    text.includes('FROM workflow_definitions') && text.includes('FOR UPDATE') ? [{ id: 12, is_active: false }] : [],
  );
  const out = await applyAgentMutation(
    { organizationId: ORG, mutationKind: 'workflow_draft.add_node', payload: { definitionId: 12, type: 'not_a_real_node_type_xyz' } },
    deps,
  );
  assert.equal(out.ok, false);
  assert.equal((out as { status: number }).status, 400);
});

test('unknown mutation kind → 400, no side effects', async () => {
  const { deps, cap } = fakes();
  const out = await applyAgentMutation({ organizationId: ORG, mutationKind: 'staff.delete', payload: {} }, deps);
  assert.deepEqual(out, { ok: false, status: 400, error: 'unknown mutation kind "staff.delete"' });
  assert.equal(cap.queries.length, 0);
  assert.equal(cap.side.length, 0);
});

test('entity_signal.insert is append-only: applied but non-revertable (null inverse)', async () => {
  const { deps, cap } = fakes(() => [{ id: 900 }]); // signal insert RETURNING id
  const out = await applyAgentMutation(
    {
      organizationId: ORG,
      mutationKind: 'entity_signal.insert',
      payload: { entityType: 'SERIAL_UNIT', entityId: 5, signalKind: 'test_fail_reason', notes: 'x' },
    },
    deps,
  );
  assert.equal(out.ok, true);
  const mut = cap.queries.find((q) => q.text.includes('INSERT INTO agent_mutations'))!;
  const extra = JSON.parse(String(mut.params[5])) as { inverse: unknown };
  assert.equal(extra.inverse, null);
});

test('entity_signal.insert with an invalid signal_kind is NOT recorded as applied', async () => {
  // Regression: emitEntitySignalSafe swallowed bad signals, so the chokepoint
  // committed an "applied" mutation for a write that never happened. Now a
  // validation failure surfaces as a non-applied 400 with no agent_mutations row.
  const { deps, cap } = fakes(() => [{ id: 900 }]);
  const out = await applyAgentMutation(
    {
      organizationId: ORG,
      mutationKind: 'entity_signal.insert',
      payload: { entityType: 'SERIAL_UNIT', entityId: 5, signalKind: 'definitely_not_a_signal', notes: 'x' },
    },
    deps,
  );
  assert.equal(out.ok, false);
  assert.equal((out as { status: number }).status, 400);
  // No "applied" agent_mutations row, and no post-commit side-effects fired.
  assert.ok(!cap.queries.some((q) => q.text.includes('INSERT INTO agent_mutations')));
  assert.equal(cap.side.length, 0);
});

test('revert side-effects carry the ORIGINAL mutation kind, not a placeholder', async () => {
  const inverse = { kind: 'feed_membership.set_state', payload: { feedKey: 'receiving_triage', entityType: 'RECEIVING', entityId: 42, state: 'active' } };
  const { deps, cap } = fakes((text) => {
    if (text.includes('FROM agent_mutations') && text.includes('FOR UPDATE')) {
      return [{ status: 'applied', mutation_kind: 'feed_membership.set_state', extra_audit: { inverse } }];
    }
    if (text.includes('SELECT state FROM feed_memberships')) return [{ state: 'done' }];
    return [];
  });
  const out = await revertAgentMutation(500, ORG, 4, deps);
  assert.equal(out.ok, true);
  assert.equal(cap.side[0].action, 'agent_mutation.revert');
  assert.equal(cap.side[0].mutationKind, 'feed_membership.set_state'); // not the 'entity_signal.insert' placeholder
});

test('revert: applied draft edit is undone via its captured inverse; status → reverted', async () => {
  const inverse = { kind: 'workflow_draft.remove_node', payload: { definitionId: 12, nodeId: 'n-abc' } };
  const { deps, cap } = fakes((text) => {
    if (text.includes('FROM agent_mutations') && text.includes('FOR UPDATE')) {
      return [{ status: 'applied', mutation_kind: 'workflow_draft.add_node', extra_audit: { inverse } }];
    }
    if (text.includes('FROM workflow_definitions') && text.includes('FOR UPDATE')) return [{ id: 12, is_active: false }];
    if (text.includes('FROM workflow_nodes') && text.includes('WHERE workflow_definition_id')) {
      return [{ id: 'n-abc', type: 'inspection', position_x: 0, position_y: 0, config: {} }];
    }
    return [];
  });
  const out = await revertAgentMutation(500, ORG, 4, deps);
  assert.equal(out.ok, true);
  assert.equal(out.status, 200);
  // The inverse (remove_node) ran + status flipped to reverted.
  assert.ok(cap.queries.some((q) => q.text.includes('DELETE FROM workflow_nodes')));
  assert.ok(cap.queries.some((q) => q.text.includes("SET status = 'reverted'")));
  assert.equal(cap.side[0].action, 'agent_mutation.revert');
});

test('revert: a non-applied mutation is 409; a missing one is 404', async () => {
  const proposed = fakes((text) =>
    text.includes('FROM agent_mutations') && text.includes('FOR UPDATE')
      ? [{ status: 'proposed', mutation_kind: 'staff.create', extra_audit: {} }]
      : [],
  );
  const r1 = await revertAgentMutation(500, ORG, 4, proposed.deps);
  assert.equal(r1.status, 409);

  const missing = fakes(() => []);
  const r2 = await revertAgentMutation(999, ORG, 4, missing.deps);
  assert.equal(r2.status, 404);
});

test('revert of an append-only mutation (null inverse) is 409', async () => {
  const { deps } = fakes((text) =>
    text.includes('FROM agent_mutations') && text.includes('FOR UPDATE')
      ? [{ status: 'applied', mutation_kind: 'entity_signal.insert', extra_audit: { inverse: null } }]
      : [],
  );
  const out = await revertAgentMutation(500, ORG, 4, deps);
  assert.equal(out.status, 409);
  // The refusal now states WHY, using the kind's declared reason, instead of
  // making an operator guess between "append-only" and "nobody wrote an
  // inverse" — two very different situations behind one old message.
  assert.match(out.error ?? '', /append-only observation/);
});

test('feed_membership.set_state captures the PRIOR state as the inverse', async () => {
  const { deps, cap } = fakes((text) =>
    text.includes('SELECT state FROM feed_memberships') ? [{ state: 'active' }] : [],
  );
  const out = await applyAgentMutation(
    {
      organizationId: ORG,
      mutationKind: 'feed_membership.set_state',
      payload: { feedKey: 'receiving_triage', entityType: 'RECEIVING', entityId: 42, state: 'done' },
    },
    deps,
  );
  assert.equal(out.ok, true);
  const mut = cap.queries.find((q) => q.text.includes('INSERT INTO agent_mutations'))!;
  const extra = JSON.parse(String(mut.params[5])) as { inverse: { payload: { state: string } } };
  assert.equal(extra.inverse.payload.state, 'active'); // restores prior
});

// ─── receiving_photo.reassign ────────────────────────────────────────────────
// The move an operator asks for in chat ("move the photos from order A to
// order B on this carton"). It is `auto` because it is reversible and
// non-destructive — so the INVERSE is what makes that trust class defensible,
// and it is pinned hardest here.

/**
 * Scripts the reads reassignReceivingPhoto makes.
 *
 * `origins` lets a batch test give each photo a DIFFERENT prior home, which is
 * the case the per-photo inverse exists for.
 */
function makePhotoMoveRows(
  origins: Array<{ entity_type: string; entity_id: string }> = [
    { entity_type: 'RECEIVING_LINE', entity_id: '700' },
  ],
) {
  let call = 0;
  return function photoMoveRows(text: string): Array<Record<string, unknown>> {
    if (text.includes('FROM photos p')) {
      const o = origins[Math.min(call++, origins.length - 1)]!;
      return [
        {
          entity_type: o.entity_type,
          entity_id: o.entity_id,
          photo_type: 'item',
          receiving_id_resolved: '42',
        },
      ];
    }
    return rest(text);
  };
}

function rest(text: string): Array<Record<string, unknown>> {
  if (text.includes('FROM receiving_line')) {
    return [{ id: '800', receiving_id: '42' }];
  }
  if (text.includes('FROM receiving_carton')) {
    return [{ id: '42' }];
  }
  if (text.includes('UPDATE photo_entity_links')) return [{ ok: 1 }];
  // resolvePoRef now joins this transaction too (executor pattern), so the
  // fake has to answer it — proof the po_ref read is no longer a second
  // connection outside the atomic unit.
  if (text.includes('AS po')) return [{ po: 'PO_42' }];
  return [];
}

const photoMoveRows = makePhotoMoveRows();

test('receiving_photo.reassign applies and captures the REVERSE move as its inverse', async () => {
  const { deps, cap } = fakes(photoMoveRows);

  const out = await applyAgentMutation(
    {
      organizationId: ORG,
      mutationKind: 'receiving_photo.reassign',
      payload: { photoId: 900, targetEntityType: 'RECEIVING_LINE', targetEntityId: 800 },
      proposedByStaffId: 7,
    },
    deps,
  );

  assert.equal(out.ok, true);
  assert.equal(out.ok && out.status, 'applied', 'auto trust class applies immediately');
  assert.equal(out.ok && out.trust, 'auto');
  assert.equal(out.ok && out.targetRef, '900');

  // The inverse must point at where the photo ACTUALLY was (line 700), not at
  // anything the caller supplied — that is what makes revert trustworthy when
  // the model guessed the source wrong.
  const insert = cap.queries.find((q) => q.text.includes('INSERT INTO agent_mutations'));
  assert.ok(insert, 'a mutation row is written');
  // extra_audit is param $6, a JSON string of { inverse, trust,
  // irreversibleReason }. Indexed, not "the last param" — 2026-08-23a appended
  // actor_kind / work_session_id / reversibility AFTER it precisely so this
  // position could stay put.
  const extraAudit = JSON.parse(String(insert!.params[5])) as {
    inverse: { kind: string; payload: Record<string, unknown> } | null;
  };
  // The inverse is ALWAYS the canonical per-photo `moves[]` form, even for a
  // single photo — so revert can re-dispatch the same kind with no special case.
  assert.deepEqual(extraAudit.inverse, {
    kind: 'receiving_photo.reassign',
    payload: {
      moves: [{ photoId: 900, targetEntityType: 'RECEIVING_LINE', targetEntityId: 700 }],
    },
  });
});

test('the photo move and its mutation row share ONE transaction', async () => {
  // Not incidental: if the move committed on its own connection, a failure
  // writing the mutation row would leave a moved photo with no audit trail and
  // no revert path.
  const { deps, cap } = fakes(photoMoveRows);

  await applyAgentMutation(
    {
      organizationId: ORG,
      mutationKind: 'receiving_photo.reassign',
      payload: { photoId: 900, targetEntityType: 'RECEIVING_LINE', targetEntityId: 800 },
    },
    deps,
  );

  const sawMove = cap.queries.some((q) => q.text.includes('UPDATE photo_entity_links'));
  const sawRow = cap.queries.some((q) => q.text.includes('INSERT INTO agent_mutations'));
  assert.ok(sawMove && sawRow, 'both writes ran on the injected client');
});

test('a bad target entity type is rejected before any write', async () => {
  const { deps, cap } = fakes(photoMoveRows);

  const out = await applyAgentMutation(
    {
      organizationId: ORG,
      mutationKind: 'receiving_photo.reassign',
      payload: { photoId: 900, targetEntityType: 'ORDER', targetEntityId: 800 },
    },
    deps,
  );

  assert.equal(out.ok, false);
  assert.equal(!out.ok && out.status, 400);
  assert.ok(!cap.queries.some((q) => q.text.includes('UPDATE photo_entity_links')));
});

test('a non-numeric photoId is rejected, not coerced', async () => {
  const { deps } = fakes(photoMoveRows);

  const out = await applyAgentMutation(
    {
      organizationId: ORG,
      mutationKind: 'receiving_photo.reassign',
      payload: { photoId: 'the first one', targetEntityType: 'RECEIVING', targetEntityId: 42 },
    },
    deps,
  );

  assert.equal(out.ok, false);
  assert.equal(!out.ok && out.status, 400);
});

test('a missing photo surfaces the domain 404 rather than throwing out of the loop', async () => {
  // A tool error the model can route around; never a 500 out of the chokepoint.
  const { deps } = fakes(() => []);

  const out = await applyAgentMutation(
    {
      organizationId: ORG,
      mutationKind: 'receiving_photo.reassign',
      payload: { photoId: 900, targetEntityType: 'RECEIVING_LINE', targetEntityId: 800 },
    },
    deps,
  );

  assert.equal(out.ok, false);
  assert.equal(!out.ok && out.status, 404);
});

test('batch: many photos to one destination move together', async () => {
  const { deps, cap } = fakes(makePhotoMoveRows());

  const out = await applyAgentMutation(
    {
      organizationId: ORG,
      mutationKind: 'receiving_photo.reassign',
      payload: { photoIds: [901, 902, 903], targetEntityType: 'RECEIVING_LINE', targetEntityId: 800 },
    },
    deps,
  );

  assert.equal(out.ok, true);
  assert.equal(out.ok && out.targetRef, '3 photos');
  const moves = cap.queries.filter((q) => q.text.includes('UPDATE photo_entity_links'));
  assert.equal(moves.length, 3, 'one link update per photo, all on the same client');
});

test("batch inverse restores each photo to its OWN prior home", async () => {
  // The reason the inverse is a list: three photos landing on one line can
  // have come from three different places, so a single reverse target would
  // send two of them somewhere they never were.
  const { deps, cap } = fakes(
    makePhotoMoveRows([
      { entity_type: 'RECEIVING_LINE', entity_id: '700' },
      { entity_type: 'RECEIVING', entity_id: '42' },
      { entity_type: 'RECEIVING_LINE', entity_id: '701' },
    ]),
  );

  await applyAgentMutation(
    {
      organizationId: ORG,
      mutationKind: 'receiving_photo.reassign',
      payload: { photoIds: [901, 902, 903], targetEntityType: 'RECEIVING_LINE', targetEntityId: 800 },
    },
    deps,
  );

  const insert = cap.queries.find((q) => q.text.includes('INSERT INTO agent_mutations'));
  const extraAudit = JSON.parse(String(insert!.params[5])) as {
    inverse: { payload: { moves: Array<{ photoId: number; targetEntityType: string; targetEntityId: number }> } };
  };
  assert.deepEqual(extraAudit.inverse.payload.moves, [
    { photoId: 901, targetEntityType: 'RECEIVING_LINE', targetEntityId: 700 },
    { photoId: 902, targetEntityType: 'RECEIVING', targetEntityId: 42 },
    { photoId: 903, targetEntityType: 'RECEIVING_LINE', targetEntityId: 701 },
  ]);
});

test('batch is ALL-OR-NOTHING: one bad photo moves none of them', async () => {
  // Photo 2 has no primary link. Partial success would leave the operator
  // diffing a carton by hand to find out what actually happened.
  let seen = 0;
  const { deps } = fakes((text) => {
    if (text.includes('FROM photos p')) {
      seen += 1;
      return seen === 2
        ? []
        : [{ entity_type: 'RECEIVING_LINE', entity_id: '700', photo_type: 'item', receiving_id_resolved: '42' }];
    }
    return rest(text);
  });

  const out = await applyAgentMutation(
    {
      organizationId: ORG,
      mutationKind: 'receiving_photo.reassign',
      payload: { photoIds: [901, 902, 903], targetEntityType: 'RECEIVING_LINE', targetEntityId: 800 },
    },
    deps,
  );

  assert.equal(out.ok, false);
  assert.equal(!out.ok && out.status, 404);
  assert.match(!out.ok ? out.error : '', /no photos were moved/);
});

test('a batch over the cap is refused before any write', async () => {
  const { deps, cap } = fakes(makePhotoMoveRows());

  const out = await applyAgentMutation(
    {
      organizationId: ORG,
      mutationKind: 'receiving_photo.reassign',
      payload: {
        photoIds: Array.from({ length: 51 }, (_, i) => i + 1),
        targetEntityType: 'RECEIVING_LINE',
        targetEntityId: 800,
      },
    },
    deps,
  );

  assert.equal(out.ok, false);
  assert.equal(!out.ok && out.status, 400);
  assert.ok(!cap.queries.some((q) => q.text.includes('UPDATE photo_entity_links')));
});

test('revert round-trip: a batch inverse re-dispatches the SAME kind and sends each photo home', async () => {
  // The reason the forward and inverse payloads share one shape: revert needs
  // no batch-aware special case, it just dispatches the kind again.
  const inverse = {
    kind: 'receiving_photo.reassign',
    payload: {
      moves: [
        { photoId: 901, targetEntityType: 'RECEIVING_LINE', targetEntityId: 700 },
        { photoId: 902, targetEntityType: 'RECEIVING', targetEntityId: 42 },
      ],
    },
  };
  const { deps, cap } = fakes((text) => {
    if (text.includes('FROM agent_mutations') && text.includes('FOR UPDATE')) {
      return [{ status: 'applied', mutation_kind: 'receiving_photo.reassign', extra_audit: { inverse } }];
    }
    if (text.includes('FROM photos p')) {
      return [
        { entity_type: 'RECEIVING_LINE', entity_id: '800', photo_type: 'item', receiving_id_resolved: '42' },
      ];
    }
    return rest(text);
  });

  const out = await revertAgentMutation(500, ORG, 4, deps, new Set(['receiving.upload_photo']));

  assert.equal(out.ok, true);
  assert.equal(out.status, 200);
  const moves = cap.queries.filter((q) => q.text.includes('UPDATE photo_entity_links'));
  assert.equal(moves.length, 2, 'both photos went back');
  assert.ok(cap.queries.some((q) => q.text.includes("SET status = 'reverted'")));
});

test('revert is refused when the actor lacks the KIND permission (gap 3, on the undo path)', async () => {
  // Applying and undoing must require the same permission — otherwise a change
  // can be made and not taken back.
  const inverse = {
    kind: 'receiving_photo.reassign',
    payload: { moves: [{ photoId: 901, targetEntityType: 'RECEIVING', targetEntityId: 42 }] },
  };
  const { deps, cap } = fakes((text) => {
    if (text.includes('FROM agent_mutations') && text.includes('FOR UPDATE')) {
      return [{ status: 'applied', mutation_kind: 'receiving_photo.reassign', extra_audit: { inverse } }];
    }
    return rest(text);
  });

  const out = await revertAgentMutation(500, ORG, 4, deps, new Set(['studio.manage']));

  assert.equal(out.ok, false);
  assert.equal(out.status, 403);
  assert.ok(!cap.queries.some((q) => q.text.includes('UPDATE photo_entity_links')));
});

// ─── operator actions ────────────────────────────────────────────────────────
// The same chokepoint, the same ledger, a different actor. These pin the three
// things that make the Process tool honest: the actor is recorded as a person
// rather than as the assistant, a park captures a resume it can actually
// replay, and an action with no inverse says WHY instead of going quiet.

const SESSION = { workSessionId: 77, sessionType: 'unbox' } as const;

/** A work_sessions row as the fake client would return it. */
function sessionRow(over: Record<string, unknown> = {}) {
  return {
    id: 77,
    organization_id: ORG,
    kind: 'scan',
    scan_type: 'unbox',
    armed: false,
    surface_key: 'unbox',
    status: 'open',
    version: 3,
    staff_id: 9,
    claimed_by_staff_id: null,
    claim_expires_at: null,
    device_id: null,
    client_event_id: 'ce-1',
    started_at: '2026-08-23T10:00:00.000Z',
    ended_at: null,
    state: {},
    ...over,
  };
}

test('operator park: recorded as an operator + session, with a replayable resume inverse', async () => {
  // Matches the UPDATE … RETURNING statements as well as the SELECT … FOR
  // UPDATE; work-sessions.ts reads its own writes back.
  const { deps, cap } = fakes((text) =>
    text.includes('work_sessions') ? [sessionRow({ armed: true })] : [],
  );

  const out = await applySessionAction(
    {
      organizationId: ORG,
      staffId: 9,
      session: SESSION,
      kind: 'work_session.park',
      payload: { sessionId: 77 },
    },
    deps,
  );

  assert.equal(out.ok, true);
  assert.equal((out as { trust: string }).trust, 'operator');
  assert.equal((out as { reversibility: string }).reversibility, 'revertable');

  const mut = cap.queries.find((q) => q.text.includes('INSERT INTO agent_mutations'))!;
  // actor_kind / work_session_id ride in the columns 2026-08-23a added, AFTER
  // extra_audit so the existing param positions are untouched.
  assert.equal(mut.params[6], 'operator');
  assert.equal(mut.params[7], 77);
  assert.equal(mut.params[8], 'revertable');

  // The session held the wedge, so the inverse must give it back — an unpark
  // that left the scanner dead would be a half-undo.
  const extra = JSON.parse(String(mut.params[5])) as {
    inverse: { kind: string; payload: { rearm: boolean } };
  };
  assert.equal(extra.inverse.kind, 'work_session.resume');
  assert.equal(extra.inverse.payload.rearm, true);

  assert.ok(cap.queries.some((q) => q.text.includes("SET status = 'parked'")));
  assert.equal(cap.side[0].actorKind, 'operator');
  assert.deepEqual(cap.side[0].session, SESSION);
});

test('operator end: applied, and classified irreversible WITH the reason', async () => {
  const { deps, cap } = fakes((text) => (text.includes('work_sessions') ? [sessionRow()] : []));

  const out = await applySessionAction(
    {
      organizationId: ORG,
      staffId: 9,
      session: SESSION,
      kind: 'work_session.end',
      payload: { sessionId: 77 },
    },
    deps,
  );

  assert.equal(out.ok, true);
  assert.equal((out as { reversibility: string }).reversibility, 'irreversible');
  assert.match((out as { irreversibleReason: string }).irreversibleReason, /terminal/);

  const mut = cap.queries.find((q) => q.text.includes('INSERT INTO agent_mutations'))!;
  assert.equal(mut.params[8], 'irreversible');
  const extra = JSON.parse(String(mut.params[5])) as { inverse: unknown; irreversibleReason: string };
  assert.equal(extra.inverse, null);
  // The reason is STORED, not re-derived later — a row must be able to explain
  // itself even if the registry's wording changes.
  assert.match(extra.irreversibleReason, /SESSION_ALREADY_ENDED/);
});

test('an operator kind cannot be applied through the agent path (and vice versa)', async () => {
  // Mixing them would file human work in the AI's trust statistics, which are
  // the evidence used to widen a mutation kind's trust class.
  const asAgent = fakes();
  const r1 = await applyAgentMutation(
    { organizationId: ORG, mutationKind: 'work_session.park', payload: { sessionId: 77 }, proposedByStaffId: 9 },
    asAgent.deps,
  );
  assert.equal(r1.ok, false);
  assert.match((r1 as { error: string }).error, /requires an operator actor/);
  assert.equal(asAgent.cap.queries.length, 0);

  const asOperator = fakes();
  const r2 = await applyAgentMutation(
    {
      organizationId: ORG,
      mutationKind: 'feed_membership.set_state',
      payload: {},
      actor: { kind: 'operator', staffId: 9, session: SESSION },
    },
    asOperator.deps,
  );
  assert.equal(r2.ok, false);
  assert.match((r2 as { error: string }).error, /cannot be applied as an operator action/);
  assert.equal(asOperator.cap.queries.length, 0);
});

test('revert replays a SESSION inverse (the guard now asks both registries)', async () => {
  // Before this change the inverse-kind guard knew only MUTATION_KINDS and the
  // `workflow_draft.` prefix, so a captured `work_session.resume` would have
  // been rejected as an unknown inverse kind — an undo that could not run.
  const inverse = { kind: 'work_session.resume', payload: { sessionId: 77, rearm: false } };
  const { deps, cap } = fakes((text) => {
    if (text.includes('FROM agent_mutations') && text.includes('FOR UPDATE')) {
      return [
        {
          status: 'applied',
          mutation_kind: 'work_session.park',
          extra_audit: { inverse },
          actor_kind: 'operator',
          work_session_id: 77,
          reversibility: 'revertable',
        },
      ];
    }
    if (text.includes('work_sessions')) return [sessionRow({ status: 'parked' })];
    return [];
  });

  const out = await revertAgentMutation(500, ORG, 9, deps, new Set(['operations.view']));

  assert.equal(out.ok, true);
  assert.equal(out.status, 200);
  assert.ok(cap.queries.some((q) => q.text.includes("SET status = 'open'")));
  assert.ok(cap.queries.some((q) => q.text.includes("SET status = 'reverted'")));
  // The revert is filed against the operator, not as assistant activity.
  assert.equal(cap.side[0].actorKind, 'operator');
  assert.equal(cap.side[0].mutationKind, 'work_session.park');
});

test('an idempotent operator action still lands a row, classified as a no-op', async () => {
  const { deps, cap } = fakes((text) =>
    text.includes('work_sessions') ? [sessionRow({ status: 'parked' })] : [],
  );

  const out = await applySessionAction(
    { organizationId: ORG, staffId: 9, session: SESSION, kind: 'work_session.park', payload: { sessionId: 77 } },
    deps,
  );

  assert.equal(out.ok, true);
  // The operator pressed the button, so the record says so — but an undo
  // control on a no-op would either do nothing or do the opposite.
  assert.equal((out as { reversibility: string }).reversibility, 'irreversible');
  assert.match((out as { irreversibleReason: string }).irreversibleReason, /Nothing changed/);
  assert.ok(cap.queries.some((q) => q.text.includes('INSERT INTO agent_mutations')));
  assert.ok(!cap.queries.some((q) => q.text.includes("SET status = 'parked'")));
});
