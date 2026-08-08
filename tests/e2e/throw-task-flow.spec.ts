import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import path from 'path';
import {
  QA_FIXTURE_ORDERS,
  QA_FIXTURE_PO_NUMBER,
} from '@/lib/tenancy/qa-org';

/**
 * Throw a task — resolve → pick → throw → 201 on the QA org.
 *
 * Asserts against QA fixtures (`QA_FIXTURE_*`), never against whatever the
 * dogfood tenant happens to hold. A throw needs a second staffer; the QA
 * provision seeds `QA Receiver` et al.
 *
 * Live Ably delivery into *another* signed-in session is a manual check (two
 * browsers). This spec proves the durable half the throw committed: 201 body
 * shape, idempotency, self-throw refusal, and the panel closing on success.
 *
 * Run: `PW_BASE_URL=http://localhost:3160 npx playwright test throw-task-flow
 * --project=qa-desktop`
 */

const QA_STORAGE = path.join(__dirname, '..', '.auth', 'qa-admin.json');
test.use({ storageState: QA_STORAGE });

const panel = (page: Page) => page.getByRole('dialog', { name: 'Throw a task' });

async function openThrowPanel(page: Page) {
  await page.goto('/');
  await page.keyboard.press('ControlOrMeta+Shift+KeyU');
  await expect(panel(page)).toBeVisible();
}

async function pickFirstOtherStaff(page: Page): Promise<string> {
  // StaffRecipientList renders named buttons; self is already filtered out.
  await expect(panel(page).getByText('Throw to…')).toBeVisible({ timeout: 15_000 });
  const first = panel(page).getByRole('button').filter({ hasText: /^QA / }).first();
  await expect(first).toBeVisible();
  const name = ((await first.innerText()).split('\n')[0] ?? '').trim();
  await first.click();
  return name;
}

async function resolveRecord(page: Page, input: string) {
  const field = panel(page).getByLabel('Record to throw');
  await field.fill(input);
  await panel(page).getByRole('button', { name: 'Find' }).click();
}

test.describe('Throw-task flow (QA org)', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'desktop chrome');

  test('resolve → pick → throw closes the panel and returns 201', async ({ page }) => {
    await openThrowPanel(page);

    // Prefer the PO carton (plain-PO arm). Fall back to a pending order id if
    // the carton fixture is missing on this provision.
    await resolveRecord(page, QA_FIXTURE_PO_NUMBER);
    const cartonRow = panel(page).getByRole('button').filter({ hasText: /PO |Carton / }).first();
    const orderFallback = panel(page).getByRole('button').filter({ hasText: /Order |QA-/ }).first();

    const foundCarton = await cartonRow.isVisible().catch(() => false);
    if (!foundCarton) {
      await resolveRecord(page, QA_FIXTURE_ORDERS.pending);
      await expect(orderFallback).toBeVisible({ timeout: 15_000 });
    } else {
      await expect(cartonRow).toBeVisible();
    }

    const assigneeName = await pickFirstOtherStaff(page);

    const [response] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/api/tasks') && r.request().method() === 'POST',
      ),
      panel(page).getByRole('button', { name: /^Throw$/ }).click(),
    ]);

    expect(response.status(), await response.text()).toBe(201);
    const body = await response.json();
    expect(body).toMatchObject({
      notified: expect.stringMatching(/^(sent|skipped_entity|failed)$/),
    });
    expect(body.task?.id ?? body.taskId ?? body.id).toBeTruthy();

    await expect(panel(page)).toHaveCount(0);
    // Toast names the handoff — assignee face is enough to prove honesty.
    await expect(page.getByText(new RegExp(`Thrown · .*→\\s*${escapeRegExp(assigneeName)}`))).toBeVisible({
      timeout: 10_000,
    });
  });

  test('idempotency: replaying the same Idempotency-Key yields one task', async ({
    request,
  }) => {
    const me = await request.get('/api/auth/session');
    expect(me.ok()).toBeTruthy();
    const meBody = await me.json();
    const myId = meBody?.user?.staffId ?? meBody?.staffId;
    const staff = (await staffPicker(request)).filter((s) => s.id !== myId);
    test.skip(staff.length < 1, 'QA org needs a second active staffer (re-run pnpm provision:qa-org)');

    const entity = await resolveThrowable(request);
    test.skip(!entity, 'no throwable QA fixture (PO carton or pending order)');

    const key = `e2e-throw-idem-${Date.now()}`;
    const payload = {
      entityType: entity!.entityType,
      entityId: entity!.entityId,
      assigneeStaffId: staff[0].id,
      note: 'e2e idempotency probe',
    };

    const first = await request.post('/api/tasks', {
      data: payload,
      headers: { 'Idempotency-Key': key },
    });
    expect(first.status(), await first.text()).toBe(201);
    const a = await first.json();

    const second = await request.post('/api/tasks', {
      data: payload,
      headers: { 'Idempotency-Key': key },
    });
    expect(second.status(), await second.text()).toBe(201);
    const b = await second.json();

    const idA = a.task?.id ?? a.taskId ?? a.id;
    const idB = b.task?.id ?? b.taskId ?? b.id;
    expect(idB).toBe(idA);
  });

  test('self-throw returns 409 in words', async ({ request }) => {
    const me = await request.get('/api/auth/session');
    expect(me.ok()).toBeTruthy();
    const meBody = await me.json();
    const staffId = meBody?.user?.staffId ?? meBody?.staffId;
    test.skip(!staffId, 'auth/session did not return a staff id');

    const entity = await resolveThrowable(request);
    test.skip(!entity, 'no throwable QA fixture');

    const res = await request.post('/api/tasks', {
      data: {
        entityType: entity!.entityType,
        entityId: entity!.entityId,
        assigneeStaffId: staffId,
      },
      headers: { 'Idempotency-Key': `e2e-self-throw-${Date.now()}` },
    });
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('self_throw');
  });
});

interface StaffPick {
  id: number;
  name: string;
}

async function staffPicker(request: APIRequestContext): Promise<StaffPick[]> {
  const res = await request.get('/api/auth/staff-picker');
  if (!res.ok()) return [];
  const data = (await res.json()) as { staff?: StaffPick[] };
  return data.staff ?? [];
}

async function resolveThrowable(
  request: APIRequestContext,
): Promise<{ entityType: string; entityId: number } | null> {
  for (const input of [QA_FIXTURE_PO_NUMBER, QA_FIXTURE_ORDERS.pending]) {
    const res = await request.post('/api/scan/resolve', {
      data: { input },
    });
    if (!res.ok()) continue;
    const data = await res.json();
    const receivingId = data?.entity?.receivingId;
    if (typeof receivingId === 'number' && receivingId > 0) {
      return { entityType: 'receiving', entityId: receivingId };
    }
    const matchId = data?.matches?.[0]?.id;
    const n = typeof matchId === 'string' ? Number(matchId) : matchId;
    if (typeof n === 'number' && Number.isInteger(n) && n > 0) {
      return { entityType: 'order', entityId: n };
    }
  }
  return null;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
