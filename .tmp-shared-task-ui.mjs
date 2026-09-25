import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:3050';
const TASK = Number(process.argv[2]);
const roster = (await (await fetch(`${BASE}/api/auth/staff-picker`, { headers: { 'x-tenant-slug': 'usav' } })).json()).staff;
const me = roster.find((p) => p.name === 'Michael');
const login = await fetch(`${BASE}/api/auth/signin`, {
  method: 'POST', headers: { 'x-tenant-slug': 'usav', 'content-type': 'application/json' },
  body: JSON.stringify({ staffId: me.id, deviceKind: 'personal' }),
});
const [name, value] = login.headers.getSetCookie().map((v) => v.split(';')[0]).find((v) => /^cf_sid/.test(v)).split('=');
const browser = await chromium.launch({ headless: true });
const errors = [];

const desk = await browser.newContext({ viewport: { width: 1680, height: 1000 } });
await desk.addCookies([{ name, value, url: BASE }]);
const d = await desk.newPage();
d.on('pageerror', (e) => errors.push(`desk ${e.message}`));
await d.goto(`${BASE}/?task=${TASK}&scope=everyone`, { waitUntil: 'domcontentloaded', timeout: 90000 });
const evidence = d.getByTestId('task-evidence');
await evidence.waitFor({ timeout: 90000 });
const projectInput = evidence.locator('input[value="Return and replacement"]');
await projectInput.waitFor({ timeout: 60000 });
await projectInput.scrollIntoViewIfNeeded();
await d.screenshot({ path: '/tmp/cfsmoke/shared-desk-detail.png' });
console.log('desk detail shows project name');

const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await phoneCtx.addCookies([{ name, value, url: BASE }]);
const p = await phoneCtx.newPage();
p.on('pageerror', (e) => errors.push(`phone ${e.message}`));
await p.goto(`${BASE}/m/home`, { waitUntil: 'domcontentloaded', timeout: 90000 });
p.on('console', (m) => { if (m.type() === 'error') console.log('phone console:', m.text().slice(0, 300)); });
await p.getByText('Assigned to me', { exact: false }).first().waitFor({ timeout: 90000 });
await p.waitForTimeout(1500);
await p.getByRole('button', { name: 'Add task' }).click({ timeout: 90000 });
const chooser = p.getByRole('button', { name: /Shared task/ }).first();
if (await chooser.waitFor({ timeout: 10000 }).then(() => true, () => false)) await chooser.click();
const composer = p.getByTestId('mobile-shared-task-composer');
await composer.waitFor({ timeout: 30000 }).catch(async (error) => {
  await p.screenshot({ path: '/tmp/cfsmoke/shared-phone-fail.png' });
  console.log('buttons:', (await p.getByRole('button').allInnerTexts()).join(' | ').slice(0, 800));
  throw error;
});
const record = composer.getByRole('textbox').first();
await record.fill('113-0586702-7374608');
await composer.getByRole('button', { name: 'Find', exact: true }).click();
await p.waitForTimeout(4000);
await p.getByTestId('mobile-task-project').fill('Return and replacement UI QA');
const team = composer.getByRole('group', { name: /Task assignees/i });
const boxes = team.getByRole('checkbox');
await boxes.nth(1).check();
await boxes.nth(2).check();
await p.screenshot({ path: '/tmp/cfsmoke/shared-phone-composer.png' });
const create = composer.getByRole('button', { name: /Create shared task/ });
const enabled = await create.isEnabled();
console.log('phone composer ready; create enabled =', enabled);
if (enabled) {
  const response = p.waitForResponse((r) => r.url().endsWith('/api/tasks') && r.request().method() === 'POST', { timeout: 30000 });
  await create.click();
  const res = await response;
  const body = await res.json();
  console.log('phone POST', res.status(), body.task?.id, body.task?.assigneeStaffIds, body.task?.projectName);
  assert.equal(res.status(), 201);
  console.log('PHONE_TASK_ID', body.task.id);
}
assert.deepEqual(errors, []);
await browser.close();
