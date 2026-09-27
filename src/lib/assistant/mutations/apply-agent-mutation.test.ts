/** DB-free unit tests for the applyAgentMutation chokepoint (universal-feed plan §2.6). */

// The @/lib/workflow barrel (imported below for hasNode's node-type registry) transitively loads @/lib/drizzle/db, which needs a…
import '@/lib/assistant/test-db-url'; // MUST be first: sets DATABASE_URL before the barrel loads
import { test } from 'node:test';
import assert from 'node:assert/strict';
import '@/lib/workflow'; // side-effect: registers built-in node types (hasNode)
import {
  applyAgentMutation,
  revertAgentMutation,
  reviewAgentMutation,
  type AgentMutationSideEffects,
  type ApplyAgentMutationDeps,
} from './apply-agent-mutation';

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
  assert.deepEqual(out, { ok: true, status: 'proposed', mutationId: 500, trust: 'review', targetRef: null });
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
  assert.match(out.error ?? '', /not revertable/);
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

// ─── receiving_photo.reassign ──────────────────────────────────────────────── The move an operator asks for in chat ("move the photos…

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
  // extra_audit is the last param, a JSON string of { inverse, trust }.
  const extraAudit = JSON.parse(String(insert!.params[insert!.params.length - 1])) as {
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
  const extraAudit = JSON.parse(String(insert!.params[insert!.params.length - 1])) as {
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

/* ── review queue (approval-first, LAWS T28): brand proposals ─────────────── */

const MANAGE = new Set(['sku_stock.manage']);

/** A queued sku_brand.assign proposal for catalog row 7, brand 3 active, SKU currently unbranded. */
function brandQueue(status = 'proposed', payload: Record<string, unknown> = { skuCatalogId: 7, brandId: 3, source: 'listing', confidence: 0.6, reason: 'below_threshold' }) {
  return fakes((text) => {
    if (text.includes('FROM agent_mutations') && text.includes('FOR UPDATE')) {
      return [{ status, mutation_kind: 'sku_brand.assign', payload }];
    }
    if (text.includes('FROM product_brands b WHERE b.organization_id = $1 AND b.id = $2')) {
      return [{ id: 3, name: 'Sony', slug: 'sony', normalized_name: 'sony', kind: 'brand', parent_brand_id: null, publisher: null, is_active: true, created_at: 't', updated_at: 't' }];
    }
    if (text.includes('WITH prev AS')) return [{ brand_id: null, brand_confidence: null, brand_source: null }];
    return [];
  });
}

test('review approve: a queued SKU brand lands as a human fact (operator, 1.00) with a revertable inverse', async () => {
  const { deps, cap } = brandQueue();
  const out = await reviewAgentMutation(
    { organizationId: ORG, mutationId: 77, decision: 'approve', actorStaffId: 4, actorPermissions: MANAGE },
    deps,
  );
  assert.deepEqual(out, { ok: true, status: 'applied', mutationId: 77, targetRef: '7' });
  const write = cap.queries.find((q) => q.text.includes('WITH prev AS'))!;
  assert.deepEqual(write.params, [ORG, 7, 3, 1, 'operator']);
  const done = cap.queries.find((q) => q.text.includes("SET status = 'applied'"))!;
  const extra = JSON.parse(String(done.params[5])) as { inverse: { kind: string; payload: Record<string, unknown> } };
  assert.deepEqual(extra.inverse, {
    kind: 'sku_brand.assign',
    payload: { skuCatalogId: 7, brandId: null, restore: { brandId: null, confidence: null, source: null } },
  });
  assert.deepEqual(cap.side.map((e) => [e.action, e.actorStaffId]), [['agent_mutation.apply', 4]]);
});

test('review refuses a reviewer without the kind permission — nothing written, nothing emitted', async () => {
  const { deps, cap } = brandQueue();
  const out = await reviewAgentMutation(
    { organizationId: ORG, mutationId: 77, decision: 'approve', actorStaffId: 4, actorPermissions: new Set(['sku_stock.view']) },
    deps,
  );
  assert.deepEqual(out, { ok: false, status: 403, error: 'reviewing "sku_brand.assign" requires sku_stock.manage' });
  assert.ok(!cap.queries.some((q) => /^\s*(UPDATE|WITH prev)/.test(q.text)));
  assert.equal(cap.side.length, 0);
});

test('review: a decided proposal cannot be decided again', async () => {
  const { deps, cap } = brandQueue('rejected');
  const out = await reviewAgentMutation(
    { organizationId: ORG, mutationId: 77, decision: 'approve', actorStaffId: 4, actorPermissions: MANAGE },
    deps,
  );
  assert.equal(out.ok ? 200 : out.status, 409);
  assert.equal(cap.side.length, 0);
});

test('review reject closes the proposal without touching the SKU', async () => {
  const { deps, cap } = brandQueue();
  const out = await reviewAgentMutation(
    { organizationId: ORG, mutationId: 77, decision: 'reject', actorStaffId: 4, actorPermissions: MANAGE, notes: 'mispaired listing' },
    deps,
  );
  assert.deepEqual(out, { ok: true, status: 'rejected', mutationId: 77, targetRef: null });
  assert.ok(cap.queries.some((q) => q.text.includes("SET status = 'rejected'") && q.params[2] === 'mispaired listing'));
  assert.ok(!cap.queries.some((q) => q.text.includes('WITH prev AS')));
  assert.equal(cap.side[0]!.action, 'agent_mutation.reject');
});

test('review: a compatibility proposal names no brand, so approval needs the reviewer to pick one', async () => {
  const compat = { skuCatalogId: 7, brandId: null, source: 'compat', confidence: 0.3, reason: 'compat_mention', compatBrandId: 1 };
  const bare = brandQueue('proposed', compat);
  const refused = await reviewAgentMutation(
    { organizationId: ORG, mutationId: 78, decision: 'approve', actorStaffId: 4, actorPermissions: MANAGE },
    bare.deps,
  );
  assert.equal(refused.ok ? 200 : refused.status, 400);
  assert.ok(!bare.cap.queries.some((q) => q.text.includes('WITH prev AS')));

  const picked = brandQueue('proposed', compat);
  const ok = await reviewAgentMutation(
    { organizationId: ORG, mutationId: 78, decision: 'approve', actorStaffId: 4, actorPermissions: MANAGE, payloadPatch: { brandId: 3 } },
    picked.deps,
  );
  assert.equal(ok.ok, true);
  assert.deepEqual(picked.cap.queries.find((q) => q.text.includes('WITH prev AS'))!.params, [ORG, 7, 3, 1, 'operator']);
});

test('review scoped to brand kinds leaves a staff.create proposal untouched', async () => {
  const { deps, cap } = fakes((text) =>
    text.includes('FROM agent_mutations') && text.includes('FOR UPDATE')
      ? [{ status: 'proposed', mutation_kind: 'staff.create', payload: {} }]
      : [],
  );
  const out = await reviewAgentMutation(
    {
      organizationId: ORG,
      mutationId: 79,
      decision: 'reject',
      actorStaffId: 4,
      actorPermissions: new Set(['admin.manage_staff']),
      kinds: ['sku_brand.assign', 'brand.create', 'brand.update'],
    },
    deps,
  );
  assert.equal(out.ok ? 200 : out.status, 400);
  assert.ok(!cap.queries.some((q) => q.text.includes('UPDATE agent_mutations')));
});

test('assistant-proposed brand kinds are review-class: queued, never applied', async () => {
  const { deps, cap } = fakes();
  const out = await applyAgentMutation(
    { organizationId: ORG, mutationKind: 'brand.create', payload: { name: 'Sonos' }, proposedByStaffId: 3 },
    deps,
  );
  assert.equal(out.ok && out.status, 'proposed');
  assert.ok(!cap.queries.some((q) => q.text.includes('product_brands')));
});
