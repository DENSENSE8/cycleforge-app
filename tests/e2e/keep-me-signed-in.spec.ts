import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test';

/**
 * "Keep me signed in" must actually keep you signed in.
 *
 * The checkbox used to set `deviceKind` and nothing else, which bought a
 * 12-hour IDLE window — and `loadSession` auto-REVOKES on idle, so going home
 * for the night signed you out while the label promised "30 days". It now sets
 * `staff_sessions.persistent`, which resolves the no-idle / sliding-year window.
 *
 * What a browser test can prove, and what it cannot:
 *
 *  • Copy (#1) and cookie shape (#2, #9) are exactly a browser's business —
 *    a session cookie or a missing Max-Age would sign you out on quit no
 *    matter how right the server row is.
 *  • Idle expiry (#3, #6) is NOT here on purpose. Proving it needs the row
 *    aged past its window, and a Playwright wall-clock wait cannot do that;
 *    it lives in the DB time-travel pass and in
 *    src/lib/auth/session-window.test.ts, which pins the same arithmetic
 *    without a database.
 *
 * The Max-Age assertions below are the browser-visible shadow of the window:
 * checked mints a year, unchecked mints the station day.
 */

const TENANT_HEADER = 'x-tenant-slug';
const TENANT_SLUG = process.env.PW_TENANT_SLUG || 'usav';
const STAFF_NAME = process.env.PW_STAFF_NAME || 'Michael';
const STAFF_PIN = process.env.PW_STAFF_PIN?.trim();

const DAY_SECONDS = 24 * 60 * 60;

async function findStaffId(request: APIRequestContext): Promise<number> {
  const picker = await request.get('/api/auth/staff-picker', {
    headers: { [TENANT_HEADER]: TENANT_SLUG },
  });
  expect(picker.ok(), `staff-picker for "${TENANT_SLUG}"`).toBeTruthy();
  const data = (await picker.json()) as { staff?: { id: number; name: string }[] };
  const rows = data.staff ?? [];
  const row =
    rows.find((s) => s.name.toLowerCase() === STAFF_NAME.toLowerCase()) ??
    rows.find((s) => s.name.toLowerCase().includes(STAFF_NAME.toLowerCase()));
  expect(row, `staff "${STAFF_NAME}" in tenant "${TENANT_SLUG}"`).toBeTruthy();
  return row!.id;
}

/** Sign in exactly as the sign-in page does, with the box checked or not. */
async function signIn(baseURL: string, persistent: boolean): Promise<string> {
  const request = await pwRequest.newContext({ baseURL });
  try {
    const staffId = await findStaffId(request);
    const res = await request.post('/api/auth/signin', {
      headers: { [TENANT_HEADER]: TENANT_SLUG },
      data: {
        staffId,
        deviceKind: persistent ? 'personal' : 'station',
        persistent,
        ...(STAFF_PIN ? { pin: STAFF_PIN } : {}),
      },
    });
    expect(res.status(), `POST /api/auth/signin (persistent=${persistent}): ${await res.text()}`).toBe(200);
    const setCookie = res.headersArray().filter((h) => h.name.toLowerCase() === 'set-cookie');
    const sid = setCookie.find((h) => h.value.startsWith('cf_sid='));
    expect(sid, 'response must set the cf_sid cookie').toBeTruthy();
    return sid!.value;
  } finally {
    await request.dispose();
  }
}

function maxAgeSeconds(cookie: string): number {
  const m = /max-age=(-?\d+)/i.exec(cookie);
  expect(m, `cf_sid must carry a Max-Age (a session cookie dies on quit): ${cookie}`).toBeTruthy();
  return Number(m![1]);
}

test.describe('Keep me signed in', () => {
  // Signed OUT — /signin redirects an authenticated visitor away.
  test.use({ storageState: { cookies: [], origins: [] } });

  test('the label promises no duration, and still warns about shared computers', async ({ page }) => {
    await page.goto('/signin', { waitUntil: 'domcontentloaded' });

    const label = page.getByText('Keep me signed in', { exact: true }).first();
    await expect(label).toBeVisible();

    // The old copy named a ceiling nobody ever reached.
    await expect(page.getByText(/30 days/i)).toHaveCount(0);

    // The warning is the part that actually changes behaviour — it stays.
    await expect(page.getByText(/shared computer/i).first()).toBeVisible();
  });

  /**
   * REGRESSION. `submitAccount` was memoized without `rememberMe` in its
   * dependency array, so it closed over the checkbox's DEFAULT (true) forever:
   * unchecking the box changed the pixels and nothing else, on the PRIMARY
   * sign-in flow. `react-hooks/exhaustive-deps` is `'off'` in this repo, so no
   * lint gate could see it — only sending the form and reading the payload can.
   *
   * The route is intercepted, so no credential ever reaches the server and no
   * `failed_login` row is written.
   */
  test('the checkbox controls what the account form actually sends', async ({ page }) => {
    const sent: { persistent?: boolean }[] = [];
    await page.route('**/api/auth/account/signin', async (route) => {
      sent.push(JSON.parse(route.request().postData() ?? '{}'));
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'INVALID_CREDENTIALS' }),
      });
    });

    await page.goto('/signin', { waitUntil: 'domcontentloaded' });
    const box = page.getByRole('checkbox').first();
    const submit = page.getByRole('button', { name: /^Sign in$/ });

    await page.locator('input[type="email"]').first().fill('probe@example.test');
    await page.getByRole('button', { name: /^Continue$/ }).click();
    await page.locator('input[type="password"]').first().fill('not-a-real-password');

    await expect(box).toBeChecked();
    await submit.click();
    await expect.poll(() => sent.length).toBe(1);
    expect(sent[0]!.persistent, 'checked → persistent: true').toBe(true);

    await box.click();
    await expect(box).not.toBeChecked();
    await submit.click();
    await expect.poll(() => sent.length).toBe(2);
    expect(sent[1]!.persistent, 'UNCHECKED → persistent: false (this is the regression)').toBe(false);
  });

  test('checked: the session cookie survives a browser quit, and is minted for a year', async ({ baseURL }) => {
    const cookie = await signIn(baseURL!, true);

    expect(cookie, 'HttpOnly').toMatch(/httponly/i);
    expect(cookie, 'SameSite=Lax').toMatch(/samesite=lax/i);
    expect(cookie, 'Path=/').toMatch(/path=\/(;|$)/i);

    const maxAge = maxAgeSeconds(cookie);
    // A year, give or take the clock skew between mint and assert.
    expect(maxAge).toBeGreaterThan(360 * DAY_SECONDS);
    // …and emphatically past the old 30-day ceiling.
    expect(maxAge).toBeGreaterThan(30 * DAY_SECONDS);
  });

  test('unchecked: still a short-lived station session — the safety property', async ({ baseURL }) => {
    const cookie = await signIn(baseURL!, false);
    const maxAge = maxAgeSeconds(cookie);

    // station = 24 h absolute. A regression that made *everything* persistent
    // would show up right here.
    //
    // Caveat worth naming before you debug a red run: a staff row carrying
    // `session_policy = 'persistent'` is persistent whether or not the box is
    // checked (that OR is deliberate), so this asserts against PW_STAFF_NAME
    // having the default policy.
    expect(maxAge).toBeGreaterThan(0);
    expect(
      maxAge,
      `unchecked must stay on the station window — check that "${STAFF_NAME}" is not on session_policy='persistent'`,
    ).toBeLessThanOrEqual(DAY_SECONDS);
  });
});
