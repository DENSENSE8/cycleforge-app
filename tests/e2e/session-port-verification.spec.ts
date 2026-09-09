import { expect, test } from '@playwright/test';

/**
 * Session-port verification (2026-09-09, prod lane) — main's signin UX,
 * surgically ported: QR sign-in as the RIGHT card column, Apple provider,
 * recent-icon last-used marker, "Sign in with email" chooser with BOTH fields
 * on the credential face (no motion expand, no All-options control),
 * always-persistent sessions, rounded Button corners, unified staff row
 * surface, and the headerless phone workstation auth page.
 *
 *   PW_BASE_URL=http://localhost:3077 npx playwright test \
 *     tests/e2e/session-port-verification.spec.ts --project=qa-desktop
 */

test.describe('session port — signin card', () => {
  test('QR panel is the right column of the two-column card', async ({ page }) => {
    await page.goto('/signin');
    await expect(page.getByRole('heading', { name: /log in with qr code/i })).toBeVisible();
    const card = page.locator('.cf-auth-card');
    await expect(card).toBeVisible();
    const box = await card.boundingBox();
    // Single-column fallback caps at 384px; the two-column card is ~660px.
    expect(box?.width ?? 0).toBeGreaterThan(500);
    const qrX = (await page.getByRole('heading', { name: /log in with qr code/i }).boundingBox())?.x ?? 0;
    const emailFaceX = (await page.getByRole('button', { name: /sign in with email/i }).boundingBox())?.x ?? 1e9;
    expect(qrX).toBeGreaterThan(emailFaceX);
  });

  test('Google and Apple providers both display', async ({ page }) => {
    await page.goto('/signin');
    await expect(page.getByRole('button', { name: /continue with google/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /continue with apple/i })).toBeVisible();
  });

  test('last-used provider carries the recent icon', async ({ page }) => {
    await page.goto('/signin');
    await page.evaluate(() => window.localStorage.setItem('cf.lastSigninMethod', 'google'));
    await page.reload();
    const google = page.getByRole('button', { name: /continue with google/i });
    await expect(google).toBeVisible();
    await expect(google.getByText('Last used', { exact: true })).toBeAttached();
  });

  test('no keep-me-signed-in control — sessions are always persistent', async ({ page }) => {
    await page.goto('/signin');
    await expect(page.getByText(/keep me signed in/i)).toHaveCount(0);
    await expect(page.getByRole('checkbox')).toHaveCount(0);
  });

  test('primary buttons carry the rounded corner (Button radius port)', async ({ page }) => {
    await page.goto('/signin');
    const radius = await page
      .getByRole('button', { name: /sign in with email/i })
      .evaluate((el) => parseFloat(getComputedStyle(el).borderRadius));
    expect(radius).toBeGreaterThan(8);
  });

  test('credential face: both fields at once, back control returns to the method list', async ({ page }) => {
    await page.goto('/signin');
    await page.getByRole('button', { name: /sign in with email/i }).click();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    const back = page.getByRole('button', { name: /all sign-in options/i });
    await expect(back).toBeVisible();
    const forgot = page.getByText('Forgot password?');
    await expect(forgot).toBeVisible();
    const backX = (await back.boundingBox())?.x ?? 1e9;
    const forgotX = (await forgot.boundingBox())?.x ?? -1;
    expect(backX).toBeLessThan(forgotX);
    // Going back lands on the full method list again.
    await back.click();
    await expect(page.getByRole('button', { name: /continue with google/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in with email/i })).toBeVisible();
  });
});

test.describe('session port — phone workstation auth', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('anon workstation QR auth redirects to signin with the token in next', async ({ page }) => {
    await page.route('**/api/auth/session', async (route) => {
      await route.fulfill({ json: { user: null } });
    });
    await page.goto('/m/qr-auth?token=e2e-anon');
    await page.waitForURL((url) => url.searchParams.has('next'), { timeout: 10_000 });
    const next = new URL(page.url()).searchParams.get('next') ?? '';
    expect(next).toContain('/m/qr-auth');
    expect(next).toContain('token=e2e-anon');
    await expect(page.getByRole('button', { name: /open menu/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^scan$/i })).toHaveCount(0);
  });

  test('signed-in workstation QR auth is headerless and uses the shared staff row', async ({ page }) => {
    await page.route('**/api/auth/session', async (route) => {
      await route.fulfill({
        json: {
          user: { staffId: 1, name: 'QA Op', role: 'operator', avatarPhotoId: null },
        },
      });
    });
    await page.goto('/m/qr-auth?token=e2e-signed-in');
    await expect(page.getByText(/workstation sign-in/i)).toBeVisible();
    await expect(page.getByText('QA Op')).toBeVisible();
    await expect(page.getByRole('button', { name: /authorize desktop login/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /open menu/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^scan$/i })).toHaveCount(0);
    await expect(page.getByRole('banner')).toHaveCount(0);
  });
});
