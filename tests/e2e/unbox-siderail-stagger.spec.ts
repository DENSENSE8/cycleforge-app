import { test, expect } from '@playwright/test';

/**
 * Unbox UNBOXED siderail — first-load stagger reveal.
 *
 * Regression coverage for docs/todo/unbox-siderail-flush-stagger-handoff.md. The
 * snapshot warm-paint rail used to skip the skeleton and mount its list host
 * EMPTY, so the container never orchestrated the cascade and rows sat frozen at
 * the `hidden` variant (dimmed + shifted) until the authoritative fetch snapped
 * them in. The fix mounts the host fresh on first rows, keeps rows on the
 * container's variant timeline (no mid-mount contract swap), and reveals them as
 * a pure left→right x-slide at full opacity (no gray, no completion flicker).
 *
 * Playwright can't watch framer-motion frame-by-frame with `expect`, so this
 * installs a rAF sampler (before any page script, via addInitScript) that records
 * each rail row's opacity + translateX from first paint through settle. The test
 * then asserts on that trace: the slide actually plays, it staggers top→bottom,
 * opacity never dips (no gray / no flicker), it holds after settle, a refetch does
 * NOT restagger, and the row affordance clears the rounded canvas edge (Problem 1).
 */

const RAIL = 'ul[aria-label="Unboxed activity"]';

// Sampler: from first paint of the Unboxed rail, record the first 6 rows'
// computed opacity + translateX every animation frame until ~1.4s after rows
// first appear, then flag done. Installed before page scripts so it never misses
// the initial cascade frames.
const SAMPLER = `
window.__cf_ss = [];
window.__cf_first = null;
window.__cf_done = false;
(function () {
  const t0 = performance.now();
  const px = (tf) => {
    if (!tf || tf === 'none') return 0;
    let m = tf.match(/matrix\\(([^)]+)\\)/);
    if (m) return +m[1].split(',').map(Number)[4].toFixed(2);
    m = tf.match(/matrix3d\\(([^)]+)\\)/);
    if (m) return +m[1].split(',').map(Number)[12].toFixed(2);
    return 0;
  };
  function loop() {
    const ul = document.querySelector('ul[aria-label="Unboxed activity"]');
    const now = performance.now() - t0;
    if (ul) {
      const lis = Array.from(ul.querySelectorAll('li[role="option"]')).slice(0, 6);
      if (lis.length) {
        if (window.__cf_first == null) window.__cf_first = now;
        window.__cf_ss.push({
          t: Math.round(now),
          rows: lis.map((li) => {
            const cs = getComputedStyle(li);
            return { o: +(+cs.opacity).toFixed(3), x: px(cs.transform) };
          }),
        });
      }
    }
    if (window.__cf_first != null && now - window.__cf_first > 1400) { window.__cf_done = true; return; }
    if (now > 30000) { window.__cf_done = true; return; }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
`;

type RowSample = { o: number; x: number };
type Frame = { t: number; rows: RowSample[] };

test.describe('unbox siderail first-load stagger', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(SAMPLER);
  });

  test('reveals rows fading in from nothing on a left→right slide — no post-settle flicker, holds after settle', async ({ page }) => {
    await page.goto('/unbox');

    // The rail must have real rows to reveal (USAV dogfood has an Unboxed queue).
    await page.locator(`${RAIL} li[role="option"]`).first().waitFor({ state: 'visible', timeout: 30_000 });

    // Wait for the sampler to finish (≈1.4s after first rows painted).
    await page.waitForFunction(() => (window as unknown as { __cf_done?: boolean }).__cf_done === true, null, {
      timeout: 30_000,
    });

    const { frames, firstRowsAt } = await page.evaluate(() => ({
      frames: (window as unknown as { __cf_ss: Frame[] }).__cf_ss,
      firstRowsAt: (window as unknown as { __cf_first: number }).__cf_first,
    }));

    expect(firstRowsAt, 'rail rows painted').toBeGreaterThan(0);
    expect(frames.length, 'sampler captured frames').toBeGreaterThan(10);

    const rel = (f: Frame) => f.t - firstRowsAt;
    const rowCount = Math.min(...frames.map((f) => f.rows.length));
    expect(rowCount, 'sampled at least 3 rows').toBeGreaterThanOrEqual(3);

    // (1) The slide actually PLAYS — rows begin meaningfully offset to the left
    // (x ≈ -12) and are not frozen. If the container never orchestrated, every
    // sample would already sit at x = 0.
    const maxOffset = Math.max(...frames.flatMap((f) => f.rows.map((r) => Math.abs(r.x))));
    expect(maxOffset, 'rows started offset left (slide ran, not frozen)').toBeGreaterThan(6);

    // (2) Every row settles to x ≈ 0 by the end.
    const last = frames[frames.length - 1];
    for (let r = 0; r < rowCount; r++) {
      expect(Math.abs(last.rows[r].x), `row ${r} settled to x≈0`).toBeLessThan(1.5);
    }

    // (3) Stagger direction: the top row settles BEFORE the bottom row. Settle
    // time = last frame where |x| ≥ 1 for that row.
    const settleRel = (r: number) => {
      let t = 0;
      for (const f of frames) if (Math.abs(f.rows[r]?.x ?? 0) >= 1) t = rel(f);
      return t;
    };
    const topSettle = settleRel(0);
    const bottomSettle = settleRel(rowCount - 1);
    expect(bottomSettle, 'bottom row settles after the top row (top→bottom cascade)').toBeGreaterThan(topSettle);

    // (4a) Rows APPEAR FROM NOTHING: at least one row is still near-transparent
    // early in the reveal (a pure slide at full opacity would never be < 0.5).
    const earlyMinOpacity = Math.min(
      ...frames.filter((f) => rel(f) <= 120).flatMap((f) => f.rows.map((r) => r.o)),
    );
    expect(earlyMinOpacity, 'rows fade in from ~0 (appear from nothing)').toBeLessThan(0.5);

    // (4b) No POST-SETTLE flicker: once a row reaches full opacity it never dips
    // again. The framer WAAPI commit gap used to blink each row back to opacity 0
    // for a frame right as its fade finished; the main-thread animator rules it
    // out. (A row still mid-fade-in reading < 1 is legitimate staggered entrance,
    // so we only guard AFTER each row first settles.)
    for (let r = 0; r < rowCount; r++) {
      const settledIdx = frames.findIndex((f) => (f.rows[r]?.o ?? 0) >= 0.99);
      if (settledIdx < 0) continue;
      const postSettleMin = Math.min(...frames.slice(settledIdx).map((f) => f.rows[r].o));
      expect(postSettleMin, `row ${r} never flickers after settling`).toBeGreaterThanOrEqual(0.9);
    }

    // (5) Holds after settle — no jump-back. Over the final ~300ms window every
    // row stays at x ≈ 0 and full opacity.
    const tail = frames.filter((f) => rel(f) >= (rel(last) - 300));
    expect(tail.length, 'captured a settled tail window').toBeGreaterThan(2);
    const tailMaxX = Math.max(...tail.flatMap((f) => f.rows.map((r) => Math.abs(r.x))));
    const tailMinO = Math.min(...tail.flatMap((f) => f.rows.map((r) => r.o)));
    expect(tailMaxX, 'rows hold at x≈0 after settle (no jump-back)').toBeLessThan(1.5);
    expect(tailMinO, 'rows hold full opacity after settle').toBeGreaterThanOrEqual(0.95);
  });

  test('a reconciling refetch does NOT restagger the settled rail', async ({ page }) => {
    await page.goto('/unbox');
    await page.locator(`${RAIL} li[role="option"]`).first().waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForFunction(() => (window as unknown as { __cf_done?: boolean }).__cf_done === true, null, {
      timeout: 30_000,
    });

    // Fire the refresh events the rail listens for, then watch for ~1.5s. A
    // restagger would move rows off x=0 or dip opacity; neither may happen.
    const result = await page.evaluate(
      () =>
        new Promise<{ maxAbsX: number; minOpacity: number }>((resolve) => {
          const ul = document.querySelector('ul[aria-label="Unboxed activity"]')!;
          const px = (tf: string) => {
            if (!tf || tf === 'none') return 0;
            const m = tf.match(/matrix\(([^)]+)\)/);
            return m ? +m[1].split(',').map(Number)[4] : 0;
          };
          const sample = () =>
            Array.from(ul.querySelectorAll('li[role="option"]'))
              .slice(0, 6)
              .map((li) => {
                const cs = getComputedStyle(li);
                return { o: +cs.opacity, x: px(cs.transform) };
              });
          let maxAbsX = 0;
          let minOpacity = 1;
          ['app-refresh-data', 'receiving-unbox-refresh'].forEach((ev) =>
            window.dispatchEvent(new CustomEvent(ev)),
          );
          const t0 = performance.now();
          const loop = () => {
            for (const r of sample()) {
              maxAbsX = Math.max(maxAbsX, Math.abs(r.x));
              minOpacity = Math.min(minOpacity, r.o);
            }
            if (performance.now() - t0 > 1500) return resolve({ maxAbsX, minOpacity });
            requestAnimationFrame(loop);
          };
          loop();
        }),
    );

    expect(result.maxAbsX, 'no row moved on refetch (no restagger)').toBeLessThan(1);
    expect(result.minOpacity, 'opacity stayed at 1 on refetch').toBeGreaterThanOrEqual(0.95);
  });

  test('row affordance (selection ring + age) clears the rounded canvas edge — Problem 1', async ({ page }) => {
    await page.goto('/unbox');
    const firstRow = page.locator(`${RAIL} li[role="option"]`).first();
    await firstRow.waitFor({ state: 'visible', timeout: 30_000 });
    // Measure at REST: the row slides in from x:-12, so measuring mid-cascade
    // inflates the gap. Wait for the reveal to settle (sampler flag), then also
    // assert the row's own transform is ~0 before reading geometry.
    await page.waitForFunction(() => (window as unknown as { __cf_done?: boolean }).__cf_done === true, null, {
      timeout: 30_000,
    });

    const geom = await page.evaluate(() => {
      const ul = document.querySelector('ul[aria-label="Unboxed activity"]')!;
      const section = ul.closest('section')!;
      const btn = ul.querySelector('li[role="option"] button[data-rail-row]')!;
      const li = btn.closest('li')!;
      const age = btn.querySelector('span.tabular-nums');
      const sr = section.getBoundingClientRect().right;
      const tf = getComputedStyle(li).transform;
      const m = tf && tf !== 'none' ? tf.match(/matrix\(([^)]+)\)/) : null;
      const settledX = m ? Math.abs(+m[1].split(',').map(Number)[4]) : 0;
      return {
        settledX,
        ringGap: Math.round(sr - btn.getBoundingClientRect().right), // ring is ring-inset on the button box
        ageGap: age ? Math.round(sr - age.getBoundingClientRect().right) : null,
      };
    });

    expect(geom.settledX, 'row is at rest before measuring geometry').toBeLessThan(1);

    // The button box (which carries the ring-inset selection ring + hover fill)
    // must sit ~6px inside the sidebar edge so it clears the work-canvas
    // rounded-tl-2xl cutout instead of tucking under it.
    expect(geom.ringGap, 'selection ring clears the rounded canvas edge (~6px)').toBeGreaterThanOrEqual(4);
    expect(geom.ringGap, 'ring inset is not excessive').toBeLessThanOrEqual(9);
    if (geom.ageGap != null) {
      expect(geom.ageGap, 'age sits inside the ring with breathing room').toBeGreaterThanOrEqual(7);
    }
  });
});
