import { test, expect, type Page } from '@playwright/test';

/**
 * /ai-chat thread display — the reading-column behaviour the Odysseus pass
 * added (`docs/todo/ai-chat-odysseus-display-HANDOFF.md`, phase 1).
 *
 * What this pins, and why each one is the thing that would actually break:
 *
 *  1. **The jump-to-latest pill is absent until you leave the bottom.** It is a
 *     recovery affordance, not chrome — a regression that renders it always-on
 *     puts a floating control over the last answer on every single reply.
 *  2. **Scrolling up during a long thread surfaces it.** Before the lane,
 *     `AiChatConversation` tracked "pinned to bottom" in a ref that nothing
 *     read, so a user who scrolled up mid-answer had no way back but manual
 *     scrolling. That ref-only state is exactly what silently rots.
 *  3. **Clicking it returns to the bottom and dismisses it.** The pill must
 *     re-pin, not just scroll once — otherwise the next streamed token leaves
 *     the operator stranded again.
 *  4. **A settled answer auto-scrolls when pinned.** The other half of the
 *     contract: staying at the bottom must keep following new content.
 *  5. **The pill never flashes during its own scroll animation.** A smooth
 *     `scrollIntoView` emits `scroll` every frame, each still far from the
 *     bottom; reading those as a user scroll un-pins mid-flight, kills
 *     auto-follow, and strobes the pill. Caught by this spec on first run —
 *     `onScroll` now ignores frames of a scroll it started.
 *
 * The SSE endpoint is STUBBED. This asserts display, and the real
 * `/api/ai/chat/stream` needs a live Hermes backend — binding a layout test to
 * a model backend makes it fail for reasons that have nothing to do with the
 * change under review (`.claude/rules/verify.md` → assert the invariant). The
 * stub speaks the exact frame grammar `useAiChat` parses, so a drift in that
 * contract still breaks this spec.
 *
 * Runs on the QA org (`qa-desktop`), never the dogfood tenant — though the
 * surface is tenant-agnostic here, since the thread content is stubbed.
 */

const COMPOSER = 'Ask about orders, staff, FBA, repairs, Bose manuals…';
const THREAD = '[role="log"][aria-label="Conversation"]';
const PILL = 'Jump to latest message';

/** One SSE frame in the grammar `useAiChat.handleEvent` parses. */
function frame(event: string, payload: Record<string, unknown>): string {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

/**
 * Stub the stream with an answer long enough to overflow the reading column —
 * the pill only has meaning on a thread you can actually scroll.
 */
async function stubStream(page: Page, paragraphs = 40): Promise<void> {
  const body = [
    frame('meta', { mode: 'assistant' }),
    frame('step', { label: 'Querying live data' }),
    ...Array.from({ length: paragraphs }, (_, i) =>
      frame('delta', { text: `Line ${i + 1} of the stubbed answer — enough prose to make the thread scroll.\n\n` }),
    ),
    frame('done', {}),
  ].join('');

  await page.route('**/api/ai/chat/stream', async (route) => {
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
      body,
    });
  });
}

async function openChat(page: Page): Promise<void> {
  await page.goto('/ai-chat');
  // Fails loudly (rather than silently passing on an empty page) if the
  // surface is permission-gated away from this session.
  await expect(page.getByPlaceholder(COMPOSER)).toBeVisible();
}

async function sendAndSettle(page: Page, text: string): Promise<void> {
  await page.getByPlaceholder(COMPOSER).fill(text);
  await page.getByPlaceholder(COMPOSER).press('Enter');
  // The composer's live status row clears when the run leaves 'streaming'.
  await expect(page.locator(`${THREAD}[aria-busy="false"]`)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Line 40 of the stubbed answer', { exact: false }).last()).toBeVisible();
}

/** Distance from the bottom of the thread's scroll port, in px. */
function distanceFromBottom(page: Page): Promise<number> {
  return page.locator(THREAD).evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight);
}

test.describe('/ai-chat thread display', () => {
  test('the jump-to-latest pill is absent on an empty thread', async ({ page }) => {
    await openChat(page);
    await expect(page.getByRole('button', { name: PILL })).toHaveCount(0);
  });

  test('scrolling up surfaces the pill; clicking it re-pins to the bottom', async ({ page }) => {
    await stubStream(page);
    await openChat(page);
    await sendAndSettle(page, 'Give me a long answer');

    // (4) Pinned at the bottom after a settled answer — auto-scroll followed it.
    expect(await distanceFromBottom(page)).toBeLessThan(80);
    // (1) …and the pill stays out of the way while pinned.
    await expect(page.getByRole('button', { name: PILL })).toHaveCount(0);

    // (2) Leave the bottom — the affordance appears.
    await page.locator(THREAD).evaluate((el) => { el.scrollTop = 0; });
    await expect(page.getByRole('button', { name: PILL })).toBeVisible();
    expect(await distanceFromBottom(page)).toBeGreaterThan(80);

    // (3) Clicking returns to the bottom AND dismisses the pill.
    await page.getByRole('button', { name: PILL }).click();
    await expect(page.getByRole('button', { name: PILL })).toHaveCount(0);
    await expect.poll(() => distanceFromBottom(page)).toBeLessThan(80);
  });

  test('the pill does not strobe back during its own scroll animation', async ({ page }) => {
    await stubStream(page);
    await openChat(page);
    await sendAndSettle(page, 'Give me a long answer');

    await page.locator(THREAD).evaluate((el) => { el.scrollTop = 0; });
    await expect(page.getByRole('button', { name: PILL })).toBeVisible();

    // Measured on this surface: the pill's own smooth scroll emits ~49 scroll
    // events, the first at distance 658px — every one of them far past the 80px
    // pin threshold. Un-pinned by its own animation, the pill re-shows, which
    // makes AnimatePresence REVERSE its exit, so the node simply never leaves
    // until the scroll lands ~800ms later.
    //
    // That is why "does it ever disappear" cannot tell the two apart — both end
    // with the node gone. The separating signal is HOW LONG it lingers, measured
    // on this runner by reverting the guard: 142ms with it (just its 160ms
    // exit) vs 407ms without (exit reversed, then replayed once the scroll
    // lands). 250ms sits in that gap with headroom on both sides.
    await page.getByRole('button', { name: PILL }).click();
    const msUntilGone = await page.evaluate(async () => {
      const t0 = performance.now();
      for (let i = 0; i < 90; i++) {
        if (!document.querySelector('button[aria-label="Jump to latest message"]')) return performance.now() - t0;
        await new Promise((r) => requestAnimationFrame(r));
      }
      return Number.POSITIVE_INFINITY;
    });
    expect(msUntilGone, 'jump pill clung on through its own scroll animation (strobe)').toBeLessThan(250);

    // …and auto-follow survived the trip: a further answer still lands pinned.
    await sendAndSettle(page, 'And another');
    expect(await distanceFromBottom(page)).toBeLessThan(80);
  });
});
