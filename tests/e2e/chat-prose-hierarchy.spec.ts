import { test, expect, type Page } from '@playwright/test';

/**
 * /session chat prose hierarchy — the display-language contract in the REAL
 * operator bubble (renderer vocabulary + bubble face).
 *
 * What this pins:
 *
 *  1. **The operator's markdown formats, never shows raw.** A pasted
 *     display-language message (`**bold**`, `` `code` ``) must come back as
 *     <strong>/<code> — literal `**` or backticks in the bubble mean the
 *     renderer was bypassed.
 *  2. **The two-tier list hierarchy paints in the DOM.** Parent items carry
 *     the caption tier classes; nested items carry the micro/muted tier —
 *     the exact vocabulary the unit gate (`markdown-renderer.test.ts`)
 *     asserts statically.
 *  3. **The bubble face has no heading tags.** The same message renders H2/H3
 *     as semibold <p> — an <h2> inside an operator bubble means a call site
 *     lost its `variant="bubble"`.
 *
 * The assistant endpoint is STUBBED (same rationale as
 * ai-chat-thread-display.spec.ts: display is asserted, not the model loop —
 * the stub speaks the exact SSE grammar useAssistantChat parses). The user
 * bubble is appended optimistically before the fetch, so the assertions do
 * not depend on the stub's timing.
 *
 * Auth: default desktop storageState (tests/.auth/admin.json), as
 * admin-inventory-datatable-smoke.spec.ts.
 *
 * Gotcha baked in: the session composer SENDS on bare Enter — newlines must
 * be typed as Shift+Enter, then one bare Enter commits.
 */

const SESSION = '[aria-label="Agent session"]';
const USER_BUBBLE = `${SESSION} .ml-8`;
const COMPOSER = 'Ask the agent…';

/** The canonical display-language fixture (task ground truth). */
const FIXTURE_LINES = [
  '## Packing exceptions — Tuesday',
  '### Received never listed',
  '- **12 units · 9 days** — lane 3',
  '  - `SKU-4821` ×4, carton C-112',
  '  - `SKU-9903` ×8, no carton',
  '### Dead stock',
  '- **91 SKUs** — oldest 141 days',
];

async function stubAssistantStream(page: Page): Promise<void> {
  await page.route('**/api/assistant/chat', async (route) => {
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
      body: [
        'event: meta\ndata: {"mode":"assistant"}\n\n',
        'event: delta\ndata: {"text":"Done."}\n\n',
        'event: done\ndata: {}\n\n',
      ].join(''),
    });
  });
}

/** Type the fixture with Shift+Enter newlines, then bare Enter to send. */
async function typeAndSendFixture(page: Page): Promise<void> {
  await page.getByPlaceholder(COMPOSER).click();
  for (const [i, line] of FIXTURE_LINES.entries()) {
    await page.keyboard.insertText(line);
    if (i < FIXTURE_LINES.length - 1) {
      await page.keyboard.down('Shift');
      await page.keyboard.press('Enter');
      await page.keyboard.up('Shift');
    }
  }
  await page.keyboard.press('Enter');
}

test.describe('/session chat prose hierarchy', () => {
  test('the operator bubble renders the display-language hierarchy, never raw markdown', async ({ page }) => {
    test.skip(test.info().project.name !== 'desktop', 'Desktop admin surface (default storageState)');

    await stubAssistantStream(page);
    await page.goto('/session');
    // Fail loudly if the surface is permission-gated away from this session.
    await expect(page.getByPlaceholder(COMPOSER)).toBeVisible();

    await typeAndSendFixture(page);

    const bubble = page.locator(USER_BUBBLE).first();
    await expect(bubble).toBeVisible();
    await expect(bubble).toContainText('Packing exceptions — Tuesday');

    // (1) Formatted, never raw: bold entity + identifier code chips.
    await expect(bubble.locator('strong').first()).toBeVisible();
    await expect(bubble.locator('code').first()).toBeVisible();
    const text = (await bubble.textContent()) ?? '';
    expect(text, 'no raw bold markers may survive rendering').not.toContain('**');
    expect(text, 'no raw code backticks may survive rendering').not.toContain('`');

    // (2) Two-tier hierarchy: 2 parent-tier items (one per H3 section, each
    // section is its own list), one nested child list with 2 child-tier items.
    await expect(bubble.locator('ul ul')).toHaveCount(1);
    await expect(bubble.locator('li.text-role-caption')).toHaveCount(2);
    await expect(bubble.locator('li.text-role-micro')).toHaveCount(2);
    await expect(bubble.locator('li.text-role-caption > ul > li')).toHaveCount(2);
    await expect(bubble.locator('li.text-role-caption').first()).toHaveClass(/text-role-caption/);
    await expect(bubble.locator('li.text-role-micro').first()).toHaveClass(/text-role-micro text-text-muted/);

    // (3) Bubble face: headings are semibold paragraphs, never h1/h2/h3.
    await expect(bubble.locator('h1, h2, h3')).toHaveCount(0);
    await expect(bubble.locator('p strong', { hasText: 'Packing exceptions — Tuesday' })).toHaveCount(1);
  });
});
