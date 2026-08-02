import { test, expect, type Page } from '@playwright/test';

/**
 * "Where is my work" — the per-staff queue doors in the GlobalHeader Inbox.
 *
 * These counts used to sit in Today's workbench chrome band. The 2026-08-01
 * chrome-altitude pass removed them (a door that leaves the surface is
 * navigation, not a control over the rows below it), and the 2026-08-02 ruling
 * put them here rather than on the MasterNav spine — see `InboxQueueLinks`'s
 * docblock for why the spine is the wrong host.
 *
 * Assertions are driven by the LIVE feed rather than hardcoded labels: the QA
 * org's queue mix depends on its fixtures, and a spec that hardcoded "Orders"
 * would fail for someone else's seed while proving nothing about the wiring.
 * Reading `/api/my-day` and asserting the UI reproduces it is what makes this
 * non-vacuous in both directions — including the honest-absence case.
 */

interface QueueCard {
  key: string;
  label: string;
  count: number;
  href: string;
}

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Recent activity inbox' });

async function openInbox(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Notifications' }).first().click();
  await expect(dialog(page)).toBeVisible();
}

async function queueCards(page: Page): Promise<QueueCard[]> {
  const res = await page.request.get('/api/my-day');
  expect(res.ok(), `GET /api/my-day → ${res.status()}`).toBe(true);
  return ((await res.json()) as { queueCards: QueueCard[] }).queueCards ?? [];
}

test.describe('Inbox queue links', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'desktop header chrome');

  test('the popover lists exactly the queues the feed reports', async ({ page }) => {
    const cards = await queueCards(page);
    await openInbox(page);

    if (cards.length === 0) {
      // Honest absence is the contract when nothing wants the operator — an
      // empty "Your queues" heading would be worse than no strip.
      await expect(dialog(page).getByText('Your queues')).toHaveCount(0);
      return;
    }

    await expect(dialog(page).getByText('Your queues')).toBeVisible();

    for (const card of cards) {
      // The count is the information, so it must be in the ACCESSIBLE NAME —
      // unlike the MasterNav spine's structural count, which is aria-hidden.
      const door = dialog(page).getByRole('link', {
        name: `${card.label} — ${card.count} waiting`,
      });
      await expect(door).toHaveCount(1);
      await expect(door).toHaveAttribute('href', card.href);
    }
  });

  test('a door leaves for its queue’s page', async ({ page }) => {
    const cards = await queueCards(page);
    test.skip(cards.length === 0, 'no queue has work on this org right now');
    await openInbox(page);

    const first = cards[0];
    await dialog(page)
      .getByRole('link', { name: `${first.label} — ${first.count} waiting` })
      .click();

    await expect(page).toHaveURL(new RegExp(first.href.split('?')[0].replace(/\//g, '\\/')));
  });

  test('queue depths are NOT activity items — they do not feed the badge', async ({ page }) => {
    const cards = await queueCards(page);
    test.skip(cards.length === 0, 'no queue has work on this org right now');
    await openInbox(page);

    // The badge counts dismissible `ActivityInboxItem`s. A queue depth is not a
    // thing you dismiss, so it must not appear in the feed list — folding it in
    // would inflate a number the operator clears by reading.
    const feedList = dialog(page).locator('ul.divide-y');
    for (const card of cards) {
      await expect(
        feedList.getByRole('link', { name: `${card.label} — ${card.count} waiting` }),
      ).toHaveCount(0);
    }
  });
});
