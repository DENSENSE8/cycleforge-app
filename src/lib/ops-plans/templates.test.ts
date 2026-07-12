import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PLAN_TEMPLATES,
  CONNECTIONS_GAP_ADOPTION_KEY,
  getPlanTemplate,
  listPlanTemplateKeys,
  normalizeTemplateTask,
} from './templates';
import { OPS_PLAN_STATIONS } from './constants';
import {
  CONN_ADOPT_TASK_KEY_PREFIX,
  MASTER_PLAN_TASK_KEY_PREFIX,
} from '@/lib/master-plan/ops-plans-bridge-constants';
import {
  adoptionTasksForDeployedConnTickets,
  assertAdoptionKeySafe,
  connAdoptClientEventId,
  isConnAdoptClientEventId,
  listConnectionsAdoptionTemplateEventIds,
  shouldSeedConnectionsAdoption,
} from './conn-adoption';

test('listPlanTemplateKeys includes inventory + connections adoption', () => {
  const keys = listPlanTemplateKeys();
  assert.ok(keys.includes('inventory_accuracy_cycle_count'));
  assert.ok(keys.includes(CONNECTIONS_GAP_ADOPTION_KEY));
  assert.equal(getPlanTemplate('nope'), null);
});

test('connections_gap_adoption is human adoption (not product code tasks)', () => {
  const tpl = getPlanTemplate(CONNECTIONS_GAP_ADOPTION_KEY);
  assert.ok(tpl);
  assert.equal(tpl!.templateKey, CONNECTIONS_GAP_ADOPTION_KEY);
  assert.match(tpl!.description, /config|training|adopt/i);
  assert.ok(tpl!.phases.length >= 5);

  const stations = new Set(tpl!.phases.map((p) => p.station));
  assert.ok(stations.has('ADMIN'));
  assert.ok(stations.has('RECEIVING'));
  assert.ok(stations.has('TECH'));

  let taskCount = 0;
  for (const phase of tpl!.phases) {
    assert.ok((OPS_PLAN_STATIONS as readonly string[]).includes(phase.station));
    assert.ok(phase.tasks.length >= 1);
    for (const raw of phase.tasks) {
      taskCount += 1;
      const { title, clientEventId } = normalizeTemplateTask(raw);
      assert.ok(title.length > 8);
      // Must not read like implementer tickets
      assert.doesNotMatch(title, /implement recordUnitEvent|write migration|PR to src\//i);
      if (clientEventId) {
        assert.ok(
          clientEventId.startsWith(CONN_ADOPT_TASK_KEY_PREFIX),
          `adoption task id must use ${CONN_ADOPT_TASK_KEY_PREFIX}: ${clientEventId}`,
        );
        assert.ok(!clientEventId.startsWith(MASTER_PLAN_TASK_KEY_PREFIX));
        assertAdoptionKeySafe(clientEventId);
      }
    }
  }
  assert.ok(taskCount >= 12, `expected substantial checklist, got ${taskCount}`);
});

test('normalizeTemplateTask accepts string or object form', () => {
  assert.deepEqual(normalizeTemplateTask('Hello'), { title: 'Hello', clientEventId: null });
  assert.deepEqual(normalizeTemplateTask({ title: 'T', clientEventId: 'conn-adopt:x' }), {
    title: 'T',
    clientEventId: 'conn-adopt:x',
  });
});

test('conn-adopt keys never collide with master-plan product prefix', () => {
  const id = connAdoptClientEventId('CONN-start-stories');
  assert.equal(id, 'conn-adopt:CONN-start-stories');
  assert.equal(isConnAdoptClientEventId(id), true);
  assert.equal(isConnAdoptClientEventId('master-plan:CONN-start-stories'), false);
  assert.throws(() => assertAdoptionKeySafe('master-plan:CONN-x'));
});

test('shouldSeedConnectionsAdoption is false for forge org only', () => {
  const forge = '00000000-0000-0000-0000-000000000001';
  const qa = '00000000-0000-0000-0000-000000000002';
  assert.equal(shouldSeedConnectionsAdoption(forge, { FORGE_ORG_ID: forge }), false);
  assert.equal(shouldSeedConnectionsAdoption(qa, { FORGE_ORG_ID: forge }), true);
});

test('listConnectionsAdoptionTemplateEventIds are unique conn-adopt keys', () => {
  const ids = listConnectionsAdoptionTemplateEventIds();
  assert.ok(ids.length >= 10);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) {
    assert.ok(id.startsWith(CONN_ADOPT_TASK_KEY_PREFIX));
  }
});

test('adoptionTasksForDeployedConnTickets maps product tickets to adoption nudges', () => {
  const rows = adoptionTasksForDeployedConnTickets(['CONN-loc-current', 'ALP-1.1', 'CONN-tix-fail']);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].clientEventId, 'conn-adopt:CONN-loc-current');
  assert.match(rows[0].title, /CONN-loc-current/);
});

test('inventory template still present and valid', () => {
  const inv = PLAN_TEMPLATES.inventory_accuracy_cycle_count;
  assert.ok(inv.phases.every((p) => p.tasks.length > 0));
});
