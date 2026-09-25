import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:3050';
const picker = await fetch(`${BASE}/api/auth/staff-picker`, { headers: { 'x-tenant-slug': 'usav' } });
assert.equal(picker.status, 200);
const staff = ((await picker.json()).staff ?? []).find((person) => person.name === 'Michael');
assert.ok(staff);
const login = await fetch(`${BASE}/api/auth/signin`, {
  method: 'POST', headers: { 'x-tenant-slug': 'usav', 'content-type': 'application/json' },
  body: JSON.stringify({ staffId: staff.id, deviceKind: 'personal' }),
});
assert.equal(login.status, 200);
const raw = login.headers.getSetCookie().map((value) => value.split(';')[0]).find((value) => /^cf_sid(?:__[A-Za-z0-9_-]+)?=/.test(value));
assert.ok(raw);
const [name, value] = raw.split('=');
const today = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map(({ type, value }) => [type, value]));
const date = `${today.year}-${today.month}-${today.day}`;
const browser = await chromium.launch({ headless: true });
const errors = [];
const ctx = await browser.newContext({ viewport: { width: 1680, height: 1000 } });
await ctx.addCookies([{ name, value, url: BASE }]);
const desk = await ctx.newPage();
desk.on('pageerror', (error) => errors.push(`desktop ${error.message}`));
await desk.goto(`${BASE}/?task=14091&scope=mine`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await desk.getByTestId('pomodoro-timer').waitFor({ timeout: 90000 });
assert.equal(await desk.getByText('SELECTED TASK', { exact: true }).count(), 0, 'generic internal header removed');
assert.ok((await desk.getByTestId('pomodoro-timer').innerText()).includes('Spent'));
await desk.screenshot({ path: '/tmp/cfsmoke/current-desk.png', fullPage: false });
console.log('desktop timer/header', (await desk.getByTestId('pomodoro-timer').innerText()).replaceAll('\n', ' '));
await desk.goto(`${BASE}/reports?tab=activity&date=${date}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await desk.getByRole('region', { name: 'Task time and activity' }).waitFor({ timeout: 90000 });
await desk.getByText(/Staff #1/).first().waitFor({ timeout: 90000 });
await desk.locator('summary').filter({ hasText: 'Event details' }).first().click({ timeout: 90000 });
await desk.screenshot({ path: '/tmp/cfsmoke/current-report.png', fullPage: false });
console.log('desktop report visible');

const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await phoneCtx.addCookies([{ name, value, url: BASE }]);
const phone = await phoneCtx.newPage();
phone.on('pageerror', (error) => errors.push(`phone ${error.message}`));
await phone.goto(`${BASE}/m/home?task=14091`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await phone.getByTestId('pomodoro-timer').waitFor({ timeout: 90000 });
await phone.screenshot({ path: '/tmp/cfsmoke/current-phone-task.png', fullPage: false });
console.log('phone task timer', (await phone.getByTestId('pomodoro-timer').innerText()).replaceAll('\n', ' '));
await phone.goto(`${BASE}/m/reports`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await phone.getByText('Task time', { exact: true }).click();
await phone.getByRole('region', { name: 'Task time and activity' }).waitFor({ timeout: 90000 });
await phone.getByText(/Staff #1/).first().waitFor({ timeout: 90000 });
await phone.locator('summary').filter({ hasText: 'Details' }).first().click({ timeout: 90000 });
await phone.screenshot({ path: '/tmp/cfsmoke/current-phone-report.png', fullPage: false });
console.log('phone report visible', (await phone.getByRole('region', { name: 'Task time and activity' }).innerText()).includes('Staff #1'));
assert.deepEqual(errors, []);
await ctx.close();
await phoneCtx.close();
await browser.close();
