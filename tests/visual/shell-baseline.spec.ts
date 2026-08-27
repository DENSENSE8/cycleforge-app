/**
 * Visual baseline for the shell chrome — the safety net the CSS → Tailwind
 * migration needs before it starts.
 *
 * ## Why this exists
 *
 * `src/shell/shell.css` is 1,077 lines and holds laws that are currently only
 * comments. The ONE ROW law on `.occ-root` is the clearest example: it records
 * exact measurements (20.3px line + 4px + 4px = 28.3px, matching the buttons'
 * 28px height) and nothing enforces any of it. Move that into Tailwind and a
 * regression is a silent pixel change on the default screen of a warehouse
 * floor app.
 *
 * The repo has `playwright.config.ts` and eight `test:e2e:*` specs, but **zero
 * screenshot assertions** — every existing test asserts behaviour, none asserts
 * appearance. So a chrome migration currently has no net at all.
 *
 * ## Auth
 *
 * Every route redirects to `/signin`, so this needs a signed-in storage state.
 * Create it once:
 *
 *   npx playwright open --save-storage=tests/visual/.auth.json http://localhost:3050
 *   # sign in in the window that opens, then close it
 *
 * `.auth.json` holds a real session — it is gitignored and must stay that way.
 *
 * ## Using it
 *
 *   npx playwright test tests/visual/shell-baseline.spec.ts --update-snapshots  # BEFORE the migration
 *   # …migrate CSS → Tailwind…
 *   npx playwright test tests/visual/shell-baseline.spec.ts                     # AFTER — must be identical
 *
 * The geometry assertions matter more than the screenshots. A screenshot tells
 * you *something* changed; `expect(height).toBeLessThan(34)` tells you the ONE
 * ROW law broke, which is the thing you actually care about and the thing a
 * human reviewer will not notice until a scanner operator complains.
 */
import { expect, test } from '@playwright/test'

const BASE = process.env.CYCLEFORGE_BASE_URL ?? 'http://localhost:3050'

test.use({ storageState: 'tests/visual/.auth.json' })

test.describe('shell chrome — CSS → Tailwind migration net', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'networkidle' })
    // The composer mounts a Lexical editor; without this the first shot can
    // catch the textarea fallback, which has deliberately different geometry.
    await page.waitForSelector('.occ-root', { timeout: 15_000 })
  })

  /**
   * THE LAW: the composer is one row.
   *
   * shell.css puts the box at 28.3px (20.3px of text + 4px + 4px) to match the
   * buttons' 28px. The bound is 34px rather than 29px so a font-metric or
   * zoom difference between machines does not fail the build — two rows would
   * be ~56px, so the gap between "correct" and "broken" is wide enough that a
   * loose bound still catches the regression that matters.
   */
  test('the composer renders as ONE row', async ({ page }) => {
    const box = await page.locator('.occ-root').first().boundingBox()
    expect(box, 'composer .occ-root must be present').not.toBeNull()
    expect(
      box!.height,
      `composer is ${box!.height}px tall — the ONE ROW law in shell.css puts it at ~28px. Two rows is ~56px.`,
    ).toBeLessThan(34)
  })

  /**
   * THE LAW: the context ring sits BELOW the composer, bottom-right, outside
   * its outline.
   *
   * Selector is `.context-ring` (AssistantFeed.tsx:161), verified against the
   * shipped markup rather than guessed — an earlier draft of this file invented
   * `[data-context-ring]`, which matches nothing and would have made this test
   * SKIP silently while reading as coverage.
   *
   * The bottom-LEFT half of the law is deliberately NOT asserted here. The
   * mode control in the operator's current UI ("Preview tray", paperclip
   * leading glyph) does not exist anywhere in this repo — `main` still renders
   * a `+` that opens the files tool, and the source even carries the comment
   * "Worth a distinct glyph (paperclip) if you disagree". Asserting against
   * markup that is not committed would fail for the wrong reason. Add that
   * assertion in the same change that lands the new composer chrome.
   */
  test('the context ring sits below the composer, to its right', async ({ page }) => {
    const composer = await page.locator('.occ-root').first().boundingBox()
    const ring = await page.locator('.context-ring').first().boundingBox()
    test.skip(!ring, '.context-ring not rendered in this session state')

    expect(
      ring!.y,
      'the context ring must sit BELOW the composer, not inside its outline',
    ).toBeGreaterThanOrEqual(composer!.y + composer!.height - 1)
    expect(
      ring!.x + ring!.width / 2,
      'the context ring is bottom-RIGHT — its centre must be right of the composer centre',
    ).toBeGreaterThan(composer!.x + composer!.width / 2)
  })

  /** Pixel baseline. Catches what the geometry assertions do not think to check. */
  test('shell chrome looks unchanged', async ({ page }) => {
    await expect(page.locator('.feed-entry').first()).toHaveScreenshot('composer-row.png', {
      // Caret blink and any live counter would otherwise flake this every run.
      animations: 'disabled',
      maxDiffPixelRatio: 0.01,
    })
  })
})
