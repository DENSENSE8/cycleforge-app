import { test, expect, type Page, type Route } from '@playwright/test';
import { QA_FIXTURE_SUPPORT } from '@/lib/tenancy/qa-org';

/**
 * Support · Assist — the vision-loop **request contract**.
 *
 * Pins the one assertion Phase 4's DONE handoff called load-bearing
 * (`docs/todo/support-ticket-premium-upgrade-PHASE-4-DONE-HANDOFF.md` item B):
 * when Assist drafts from a staged photo, `POST /api/support/suggest` carries
 * `stagedPhotoIds` and **never a URL**. A cloud model cannot follow the app's
 * `/api/photos/[id]/content` 302; the route resolves a signed storage URL
 * server-side. If the client ever starts shipping image URLs, this spec fails
 * before a customer photo leaves through the wrong door.
 *
 * The ticket bundle + photo upload are STUBBED. The helpdesk vault is seeded
 * by `pnpm provision:qa-org` (when ZENDESK_* are set) so the suggest gate is
 * not a permanent 503 — but this test fulfills suggest itself so a missing
 * Hermes box cannot turn a contract assertion into an infra flake.
 *
 * Staging uses the composer file input (same `useTicketPhotoStaging` bag the
 * paste path writes) rather than a synthetic ClipboardEvent — Chromium ignores
 * `clipboardData` on constructed paste events, which would make the contract
 * assertion vacuously fail for the wrong reason.
 *
 * Run:
 *   pnpm provision:qa-org
 *   npx playwright test tests/e2e/support-assist-staged-photo-contract.spec.ts --project=qa-desktop
 */

const TICKET_ID = QA_FIXTURE_SUPPORT.ticketId;
const STAGED_PHOTO_ID = 424242;

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const FAKE_BUNDLE = {
  success: true,
  ticket: {
    id: TICKET_ID,
    subject: QA_FIXTURE_SUPPORT.subject,
    status: 'open',
    priority: 'normal',
    requester_id: 9001,
    assignee_id: null,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    tags: [],
  },
  comments: [
    {
      id: 1,
      author_id: 9001,
      body: 'My carton arrived damaged — see the label photo.',
      html_body: '<p>My carton arrived damaged — see the label photo.</p>',
      public: true,
      created_at: '2026-08-01T00:00:00Z',
      attachments: [],
    },
  ],
  commentsCount: 1,
  commentsNextPage: null,
  agents: [],
  assignment: null,
  entity: null,
  photos: [],
  users: [{ id: 9001, name: 'QA Requester', email: 'qa-requester@cycleforge.test' }],
};

const FAKE_CONTEXT = {
  success: true,
  anchor: { type: 'ticket', id: TICKET_ID, label: `#${TICKET_ID}` },
  linkage: {
    matchedBy: null,
    order: null,
    trackings: [],
    serials: [],
    tickets: [],
  },
  ticket: {
    id: TICKET_ID,
    label: `#${TICKET_ID}`,
    provider: 'zendesk',
    externalTicketId: String(TICKET_ID),
    providerTicketId: TICKET_ID,
    providerLabel: 'Helpdesk',
    openUrl: `https://example.zendesk.com/agent/tickets/${TICKET_ID}`,
    subject: QA_FIXTURE_SUPPORT.subject,
    status: 'open',
  },
  thread: null,
  connections: [],
  timeline: [],
  linkable: null,
};

async function stubSupportSurface(page: Page): Promise<void> {
  await page.route(`**/api/zendesk/tickets/${TICKET_ID}/bundle**`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(FAKE_BUNDLE),
    });
  });
  await page.route(`**/api/zendesk/tickets/${TICKET_ID}`, async (route: Route) => {
    if (route.request().method() === 'GET' && !route.request().url().includes('/bundle')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, ticket: FAKE_BUNDLE.ticket }),
      });
      return;
    }
    await route.continue();
  });
  await page.route(`**/api/zendesk/tickets/${TICKET_ID}/comments**`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        comments: FAKE_BUNDLE.comments,
        count: FAKE_BUNDLE.commentsCount,
        next_page: null,
        users: FAKE_BUNDLE.users,
      }),
    });
  });
  await page.route(`**/api/zendesk/tickets/${TICKET_ID}/photos**`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, entity: null, photos: [] }),
    });
  });
  await page.route('**/api/support/context**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(FAKE_CONTEXT),
    });
  });
  await page.route('**/api/support/requester**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        name: 'QA Requester',
        email: 'qa-requester@cycleforge.test',
        orderCount: 0,
        priorTicketCount: 0,
      }),
    });
  });
  await page.route('**/api/photos/upload**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: STAGED_PHOTO_ID,
        url: `https://storage.example/qa/${STAGED_PHOTO_ID}.jpg`,
        thumbUrl: `https://storage.example/qa/${STAGED_PHOTO_ID}-thumb.jpg`,
      }),
    });
  });
}

test.describe('Support Assist staged-photo contract', () => {
  test('POST /api/support/suggest sends stagedPhotoIds and never a URL', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'qa-desktop', 'QA org fixtures — qa-desktop project');

    await stubSupportSurface(page);

    const suggestBodies: unknown[] = [];
    await page.route('**/api/support/suggest', async (route: Route) => {
      const raw = route.request().postData();
      suggestBodies.push(raw ? JSON.parse(raw) : null);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          suggestion: 'Stubbed draft — contract only.',
          sources: [{ type: 'ocr', label: 'stub' }],
          confidence: 'low',
          mode: 'local-only',
          model: 'stub',
          grounded: false,
          searchHits: [],
          evidence: [],
        }),
      });
    });

    await page.goto(`/support?ticket=${TICKET_ID}`);
    await expect(page.getByTestId('support-merged-stream')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('region', { name: /support context/i })).toBeVisible();

    // Same staging bag the paste path writes — composer file input.
    const fileInput = page.locator('input[type="file"][accept="image/*"]').first();
    await fileInput.setInputFiles({
      name: 'qa-label.png',
      mimeType: 'image/png',
      buffer: TINY_PNG,
    });

    // Rail display strip → Assist → draft from the staged photo.
    await page.getByRole('button', { name: /^Assist$/i }).click();
    await expect(page.getByRole('button', { name: /Draft a reply/i })).toBeEnabled({
      timeout: 10_000,
    });

    await page.getByRole('button', { name: /Draft a reply/i }).click();
    await expect.poll(() => suggestBodies.length, { timeout: 15_000 }).toBeGreaterThan(0);

    const body = suggestBodies[0] as Record<string, unknown>;
    expect(body.ticketId).toBe(TICKET_ID);
    expect(body.stagedPhotoIds).toEqual([STAGED_PHOTO_ID]);

    // The whole point of the contract: no model-readable URL on the wire.
    const serialized = JSON.stringify(body);
    expect(serialized).not.toMatch(/https?:\/\//i);
    expect(body).not.toHaveProperty('imageUrls');
    expect(body).not.toHaveProperty('imageUrl');
    expect(body).not.toHaveProperty('photoUrl');
    expect(body).not.toHaveProperty('photoUrls');
  });
});
