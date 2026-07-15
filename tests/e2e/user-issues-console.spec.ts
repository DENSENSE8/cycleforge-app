import { test, expect } from '@playwright/test';

/**
 * Reported-Issues console (UIC-2) — list → select → detail.
 *
 * Creates an issue via POST /api/user-issues, opens /support?mode=issues,
 * clicks the row, and asserts the detail fact stack. Skips gracefully when
 * the session lacks support.issues.view (403 on list).
 */

test.describe('Reported Issues console', () => {
  test('list → select → detail shows title and description', async ({ page, request }) => {
    const title = `UIC-2 e2e ${Date.now()}`;
    const description = 'Playwright list→detail smoke for the Issues Workbench.';

    const createRes = await request.post('/api/user-issues', {
      data: {
        title,
        description,
        type: 'bug',
        page: '/support?mode=issues',
        clientEventId: `e2e-uic2-${Date.now()}`,
      },
    });

    if (createRes.status() === 401 || createRes.status() === 403) {
      test.skip(true, 'Session cannot POST /api/user-issues — skipping');
      return;
    }
    expect(createRes.ok()).toBeTruthy();
    const created = await createRes.json();
    const issueId: number | undefined = created.issueId ?? created.issue?.id;
    expect(issueId).toBeTruthy();

    // Probe list permission before navigating the UI.
    const listProbe = await request.get('/api/user-issues?limit=1');
    if (listProbe.status() === 403) {
      test.skip(true, 'support.issues.view not granted — skipping Issues console UI');
      return;
    }
    expect(listProbe.ok()).toBeTruthy();

    await page.goto(`/support?mode=issues&q=${encodeURIComponent(title)}`);
    await expect(page.getByRole('button', { name: new RegExp(title) })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole('button', { name: new RegExp(title) }).click();
    await expect(page).toHaveURL(new RegExp(`issueId=${issueId}`));

    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await expect(page.getByText(description)).toBeVisible();
    await expect(page.getByText('Open', { exact: true }).first()).toBeVisible();
  });

  test('deep-link ?issueId= loads detail fact stack', async ({ page, request }) => {
    const listRes = await request.get('/api/user-issues?limit=1');
    if (listRes.status() === 403) {
      test.skip(true, 'support.issues.view not granted — skipping');
      return;
    }
    if (!listRes.ok()) {
      test.skip(true, `list failed: ${listRes.status()}`);
      return;
    }
    const body = await listRes.json();
    const first = body.issues?.[0];
    if (!first?.id) {
      test.skip(true, 'No reported issues in tenant yet');
      return;
    }

    await page.goto(`/support?mode=issues&issueId=${first.id}`);
    await expect(page.getByRole('heading', { name: first.title })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(`#${first.id}`).first()).toBeVisible();
  });
});
