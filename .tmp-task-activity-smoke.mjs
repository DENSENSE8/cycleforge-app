import assert from 'node:assert/strict';

const BASE = 'http://localhost:3050';
const tenant = 'usav';
const picker = await fetch(`${BASE}/api/auth/staff-picker`, { headers: { 'x-tenant-slug': tenant }, signal: AbortSignal.timeout(60000) });
if (!picker.ok) throw new Error(`staff picker ${picker.status}: ${await picker.text()}`);
const pickerBody = await picker.json();
const staff = (pickerBody.staff ?? pickerBody.staffList ?? pickerBody).find((person) => person.name === 'Michael');
assert.ok(staff?.id, 'Michael account available');
const login = await fetch(`${BASE}/api/auth/signin`, {
  method: 'POST', headers: { 'x-tenant-slug': tenant, 'content-type': 'application/json' },
  body: JSON.stringify({ staffId: staff.id, deviceKind: 'personal' }), signal: AbortSignal.timeout(60000),
});
assert.equal(login.status, 200, await login.text());
const cookie = login.headers.getSetCookie().map((value) => value.split(';')[0]).find((value) => /^cf_sid(?:__[A-Za-z0-9_-]+)?=/.test(value));
assert.ok(cookie);
const headers = { cookie, 'x-tenant-slug': tenant };
async function call(path, method = 'GET', body) {
  const response = await fetch(`${BASE}${path}`, {
    method, headers: { ...headers, ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(60000),
  });
  const payload = await response.json();
  assert.ok(response.ok, `${method} ${path}: ${response.status} ${JSON.stringify(payload)}`);
  return { status: response.status, payload };
}
const taskId = 14091;
const tasks = (await call('/api/tasks?lane=all&assignee=all&limit=200&q=Reship%20steps')).payload.tasks;
const qa = tasks.find((task) => task.id === taskId);
assert.ok(qa && qa.note?.includes('Reship'), 'Only exercise the known QA task');
console.log('QA task', taskId, qa.status);

const url = 'https://youtu.be/dQw4w9WgXcQ';
const added = await call(`/api/tasks/${taskId}/media/links`, 'POST', { url, title: 'QA linked walkthrough' });
assert.equal(added.payload.link.provider, 'youtube');
const linkId = added.payload.link.id;
const replay = await call(`/api/tasks/${taskId}/media/links`, 'POST', { url });
assert.equal(replay.status, 200);
assert.equal(replay.payload.link.id, linkId);
const updated = await call(`/api/tasks/${taskId}/media/links?linkId=${linkId}`, 'PATCH', {
  url: 'https://picsum.photos/id/1/200/200.jpg', title: 'QA linked photo',
});
assert.equal(updated.payload.link.kind, 'photo');
const media = (await call(`/api/tasks/${taskId}/media`)).payload;
assert.ok(media.links.some((link) => link.id === linkId && link.provider === 'image'));
console.log('media CRUD', media.photos.length, media.videos.length, media.links.length);

const eventId = crypto.randomUUID();
const viewed = await call('/api/pomodoro', 'POST', { kind: 'task', id: taskId, action: 'view', clientEventId: eventId });
const duplicate = await call('/api/pomodoro', 'POST', { kind: 'task', id: taskId, action: 'view', clientEventId: eventId });
assert.equal(viewed.payload.changed, true);
assert.equal(duplicate.payload.changed, false);
const started = await call('/api/pomodoro', 'POST', { kind: 'task', id: taskId, action: 'start' });
assert.equal(started.payload.timer.running, true);
await new Promise((resolve) => setTimeout(resolve, 1200));
const paused = await call('/api/pomodoro', 'POST', { kind: 'task', id: taskId, action: 'pause' });
assert.equal(paused.payload.timer.running, false);
assert.ok(paused.payload.timer.elapsedSeconds >= 1);
const secondPause = await call('/api/pomodoro', 'POST', { kind: 'task', id: taskId, action: 'pause' });
assert.equal(secondPause.payload.changed, false);
console.log('timer elapsed', paused.payload.timer.elapsedSeconds);

const today = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map(({ type, value }) => [type, value]));
const date = `${today.year}-${today.month}-${today.day}`;
const report = (await call(`/api/pomodoro/report?from=${date}&to=${date}`)).payload;
const row = report.rows.find((entry) => entry.kind === 'task' && entry.id === taskId && entry.staffId === staff.id);
assert.ok(row, 'manager report includes QA task / staff / day');
assert.ok(row.viewedAt.length >= 1 && row.workedAt.length >= 1 && row.measuredFocusSeconds >= 1);
assert.ok(report.events.some((event) => event.kind === 'task' && event.id === taskId && event.event === 'viewed'));
console.log('report rows/events', report.rows.length, report.events.length, 'QA', row.viewedAt.length, row.workedAt.length, row.measuredFocusSeconds);
await call(`/api/tasks/${taskId}/media/links?linkId=${linkId}`, 'DELETE');
const after = (await call(`/api/tasks/${taskId}/media`)).payload;
assert.ok(!after.links.some((link) => link.id === linkId));
console.log('media link delete verified');

const taskStarted = await call(`/api/tasks/${taskId}`, 'PATCH', { status: 'IN_PROGRESS' });
assert.equal(taskStarted.payload.task.status, 'IN_PROGRESS');
await call('/api/pomodoro', 'POST', { kind: 'task', id: taskId, action: 'start' });
await new Promise((resolve) => setTimeout(resolve, 1200));
const taskFinished = await call(`/api/tasks/${taskId}`, 'PATCH', { status: 'DONE' });
assert.equal(taskFinished.payload.task.status, 'DONE');
const stopped = (await call(`/api/pomodoro?kind=task&id=${taskId}`)).payload.timer;
assert.equal(stopped.running, false, 'task completion stops focus without a browser pause');
const finalReport = (await call(`/api/pomodoro/report?from=${date}&to=${date}`)).payload;
const completedRow = finalReport.rows.find((entry) => entry.kind === 'task' && entry.id === taskId && entry.staffId === staff.id);
assert.ok(completedRow?.completedAt.length >= 1 && completedRow.workedAt.length >= 1);
assert.ok(finalReport.taskLifecycles.some((entry) => entry.taskId === taskId && entry.elapsedSeconds >= 0));
console.log('completion attributed', completedRow.staffId, completedRow.completedAt.length, 'global lifecycles', finalReport.taskLifecycles.length);
