import assert from 'node:assert/strict';

const BASE = 'http://localhost:3050';
const tenant = 'usav';
const pickerBody = await (await fetch(`${BASE}/api/auth/staff-picker`, { headers: { 'x-tenant-slug': tenant } })).json();
const roster = pickerBody.staff ?? [];
const me = roster.find((person) => person.name === 'Michael');
const others = roster.filter((person) => person.id !== me.id).slice(0, 2);
assert.equal(others.length, 2, 'need two colleagues');
const login = await fetch(`${BASE}/api/auth/signin`, {
  method: 'POST', headers: { 'x-tenant-slug': tenant, 'content-type': 'application/json' },
  body: JSON.stringify({ staffId: me.id, deviceKind: 'personal' }),
});
assert.equal(login.status, 200);
const cookie = login.headers.getSetCookie().map((v) => v.split(';')[0]).find((v) => /^cf_sid(?:__[A-Za-z0-9_-]+)?=/.test(v));
async function call(path, method = 'GET', body, expectOk = true) {
  const res = await fetch(`${BASE}${path}`, {
    method, headers: { cookie, 'x-tenant-slug': tenant, ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await res.json();
  if (expectOk) assert.ok(res.ok, `${method} ${path}: ${res.status} ${JSON.stringify(payload)}`);
  return { status: res.status, payload };
}

const [a, b] = others;
const project = `Return and replacement QA ${Date.now()}`;
const created = await call('/api/tasks', 'POST', {
  entityType: 'order', entityId: 13964, assigneeStaffIds: [a.id, b.id, me.id],
  projectName: `  ${project}  `, note: 'Swap unit, print return label',
});
const task = created.payload.task;
console.log('created', task.id, task.assigneeStaffIds, task.projectName, created.payload.notifications);
assert.deepEqual(task.assigneeStaffIds, [a.id, b.id, me.id]);
assert.equal(task.projectName, project);
assert.deepEqual(created.payload.notifications.map((n) => n.staffId), [a.id, b.id], 'creator not notified');

for (const who of [a.id, b.id, me.id]) {
  const rows = (await call(`/api/tasks?lane=all&assignee=${who}&limit=500`)).payload.tasks.filter((row) => row.id === task.id);
  assert.equal(rows.length, 1, `staff ${who} sees the task exactly once`);
  assert.equal(rows[0].projectName, project);
}
const found = (await call(`/api/tasks?lane=all&assignee=all&q=${encodeURIComponent(project)}`)).payload.tasks;
assert.deepEqual(found.map((row) => row.id), [task.id], 'project name is searchable');
console.log('visible once to each member; searchable by project');

const selfOnly = await call('/api/tasks', 'POST', { entityType: 'order', entityId: 13964, assigneeStaffIds: [me.id] }, false);
assert.equal(selfOnly.status, 409);
const foreign = await call('/api/tasks', 'POST', { entityType: 'order', entityId: 13964, assigneeStaffIds: [a.id, 2147480000] }, false);
assert.equal(foreign.status, 400);
console.log('self-only 409, unknown staff 400');

const patched = (await call(`/api/tasks/${task.id}`, 'PATCH', { assigneeStaffIds: [b.id], projectName: 'Return and replacement' })).payload.task;
assert.deepEqual(patched.assignees.map((p) => p.id), [b.id]);
assert.equal(patched.assignee.id, b.id);
assert.equal(patched.projectName, 'Return and replacement');
const aRows = (await call(`/api/tasks?lane=all&assignee=${a.id}&limit=500`)).payload.tasks.filter((row) => row.id === task.id);
assert.equal(aRows.length, 0, 'removed member no longer sees it');
const legacy = (await call(`/api/tasks/${task.id}`, 'PATCH', { assigneeStaffId: a.id })).payload.task;
assert.deepEqual(legacy.assignees.map((p) => p.id), [a.id], 'legacy single handoff replaces membership');
console.log('membership replace + legacy handoff ok');

const done = (await call(`/api/tasks/${task.id}`, 'PATCH', { status: 'DONE' })).payload.task;
assert.equal(done.status, 'DONE');
console.log('shared status ok; TASK_ID', task.id);
