/**
 * One-off BROWSER verification harness for the prose display language.
 * Not a test file — deleted after the run. Drives real Chromium (repo
 * playwright) against the live dev server on :3050 with the e2e admin
 * storage state, same as the Playwright specs.
 *
 * Verifies, with COMPUTED styles (proof the Tailwind utilities compiled,
 * not just that class strings exist):
 *   1. /session operator bubble (bubble face)  — headings as <p><strong>,
 *      two-tier list hierarchy (disc vs '–' markers, caption vs micro sizes,
 *      default vs muted colors), code chips, no raw ** or backticks.
 *   2. /settings/legal (prose face) — real h2/h3 scale + same hierarchy.
 *   3. SPEED — exact threshold: Enter keypress → bubble satisfying the full
 *      hierarchy predicate in < 500ms (measured page-side), plus long-task
 *      census during the send.
 */
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:3050';
const SPEED_THRESHOLD_MS = 500;

const FIXTURE_LINES = [
  '## Packing exceptions — Tuesday',
  '### Received never listed',
  '- **12 units · 9 days** — lane 3',
  '  - `SKU-4821` ×4, carton C-112',
  '  - `SKU-9903` ×8, no carton',
  '### Dead stock',
  '- **91 SKUs** — oldest 141 days',
];

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  —  ' + detail : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({
  storageState: 'tests/.auth/admin.json',
  viewport: { width: 1440, height: 900 },
});

await page.goto(`${BASE}/session`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
await page.getByPlaceholder('Ask the agent…').waitFor({ timeout: 30_000 });

// Stub the assistant stream so the send settles deterministically.
await page.route('**/api/assistant/chat', (route) =>
  route.fulfill({
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
    body: 'event: meta\ndata: {"mode":"assistant"}\n\nevent: delta\ndata: {"text":"Done."}\n\nevent: done\ndata: {}\n\n',
  }),
);

// Long-task census while the message is composed and sent.
await page.evaluate(() => {
  window.__longTasks = [];
  const po = new PerformanceObserver((l) => {
    for (const e of l.getEntries()) window.__longTasks.push(Math.round(e.duration));
  });
  po.observe({ entryTypes: ['longtask'] });
});

const composer = page.getByPlaceholder('Ask the agent…');
// Dev-server hygiene: a fresh load may 404 one stale chunk and heal via a
// Fast Refresh pass that resets client state mid-type. Settle first, and
// verify the draft actually landed before committing.
await page.waitForTimeout(2500);
for (let attempt = 0; attempt < 2; attempt++) {
  await composer.click();
  for (const [i, line] of FIXTURE_LINES.entries()) {
    await page.keyboard.insertText(line);
    if (i < FIXTURE_LINES.length - 1) {
      await page.keyboard.down('Shift');
      await page.keyboard.press('Enter');
      await page.keyboard.up('Shift');
    }
  }
  await page.waitForTimeout(400);
  if ((await composer.evaluate((el) => el.value)).includes('Packing exceptions')) break;
  await composer.fill('');
  await page.waitForTimeout(1500);
}

// SPEED: exact threshold — trusted Enter keydown → full-hierarchy bubble.
// A capture-phase listener stamps t0 on the real keypress; a rAF poll stamps
// t1 the first frame the predicate holds. Both page-side, no transport skew.
const bubbleSel = '[aria-label="Agent session"] .ml-8';
await page.evaluate((sel) => {
  window.__t0 = null;
  window.__t1 = null;
  const pred = () => {
    const b = document.querySelector(sel);
    return (
      b &&
      b.querySelector('strong') &&
      b.querySelector('code') &&
      b.querySelectorAll('li.text-role-caption').length === 2 &&
      b.querySelectorAll('li.text-role-micro').length === 2 &&
      b.querySelector('ul ul')
    );
  };
  const textarea = document.querySelector('textarea');
  textarea.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Enter' && !e.shiftKey && window.__t0 === null) {
        window.__t0 = performance.now();
      }
    },
    { capture: true },
  );
  const poll = () => {
    if (window.__t0 !== null && pred() && window.__t1 === null) {
      window.__t1 = performance.now();
      return;
    }
    requestAnimationFrame(poll);
  };
  requestAnimationFrame(poll);
}, bubbleSel);

const bubble = page.locator(bubbleSel).first();
await page.keyboard.press('Enter');
await bubble.waitFor({ timeout: 10_000 });
await page.waitForTimeout(300); // let the send settle + paint fully

const elapsedMs = await page.evaluate(
  () =>
    window.__t0 !== null && window.__t1 !== null
      ? Math.round((window.__t1 - window.__t0) * 10) / 10
      : null,
);
check('speed: Enter → full-hierarchy bubble rendered', elapsedMs !== null && elapsedMs < SPEED_THRESHOLD_MS,
  `${elapsedMs}ms (threshold ${SPEED_THRESHOLD_MS}ms)`);

// — Structural state: bubble face —
check('bubble: no heading tags', await bubble.locator('h1, h2, h3').count() === 0);
check('bubble: heading renders as <p> with <strong>',
  await bubble.locator('p strong', { hasText: 'Packing exceptions — Tuesday' }).count() === 1);
check('bubble: 2 parent-tier li + 2 child-tier li',
  (await bubble.locator('li.text-role-caption').count()) === 2 &&
  (await bubble.locator('li.text-role-micro').count()) === 2);
check('bubble: nested ul > li > ul present', await bubble.locator('ul ul').count() === 1);
check('bubble: inline code chip present', await bubble.locator('code').count() >= 2);

// — Computed-style state: markers, sizes, colors actually paint —
const computed = await page.evaluate((sel) => {
  const b = document.querySelector(sel);
  const parentUl = b.querySelector('ul');
  const childUl = b.querySelector('ul ul');
  const parentLi = b.querySelector('li.text-role-caption');
  const childLi = b.querySelector('li.text-role-micro');
  const chip = b.querySelector('code');
  return {
    parentMarker: parentUl ? getComputedStyle(parentUl).listStyleType : null,
    childMarker: childUl ? getComputedStyle(childUl).listStyleType : null,
    childMarkerColor: childUl ? getComputedStyle(childUl, '::marker').color : null,
    parentIndent: parentUl ? getComputedStyle(parentUl).marginLeft : null,
    childIndent: childUl ? getComputedStyle(childUl).marginLeft : null,
    parentFont: parentLi ? getComputedStyle(parentLi).fontSize : null,
    childFont: childLi ? getComputedStyle(childLi).fontSize : null,
    childColor: childLi ? getComputedStyle(childLi).color : null,
    parentColor: parentLi ? getComputedStyle(parentLi).color : null,
    codeChipBg: chip ? getComputedStyle(chip).backgroundColor : null,
    codeChipFont: chip ? getComputedStyle(chip).fontFamily : null,
  };
}, bubbleSel);
check('computed: parent marker is disc', computed.parentMarker === 'disc', JSON.stringify(computed.parentMarker));
check('computed: child marker is the – dash', computed.childMarker === '"–"' || computed.childMarker === '–',
  JSON.stringify(computed.childMarker));
check('computed: child tier is smaller (micro < caption)', parseFloat(computed.childFont) < parseFloat(computed.parentFont),
  `child ${computed.childFont} < parent ${computed.parentFont}`);
check('computed: child body muted vs parent default', computed.childColor !== computed.parentColor,
  `child ${computed.childColor} / parent ${computed.parentColor}`);
check('computed: nested indent stacks (child ul also indented)', parseFloat(computed.childIndent) > 0,
  `parent ${computed.parentIndent}, child ${computed.childIndent}`);
check('computed: code chip has sunken surface + mono', computed.codeChipBg !== 'rgba(0, 0, 0, 0)' && /mono/i.test(computed.codeChipFont),
  `${computed.codeChipBg} / ${computed.codeChipFont}`);

const text = (await bubble.textContent()) ?? '';
check('bubble: no literal ** survives', !text.includes('**'));
check('bubble: no literal backticks survive', !text.includes('`'));

const longTasks = await page.evaluate(() => window.__longTasks ?? []);
console.log(`INFO  long tasks (>50ms) during compose+send: ${JSON.stringify(longTasks)}`);

await page.screenshot({ path: '/tmp/prose-bubble.png', clip: await bubble.boundingBox() ?? undefined });

// — Prose face: /settings/legal static markdown —
await page.goto(`${BASE}/settings/legal`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
await page.locator('[aria-label="Agent session"]').waitFor({ timeout: 0 }).catch(() => {});
const legalMain = page.locator('main').first();
await legalMain.waitFor({ timeout: 30_000 });
const prose = await page.evaluate(() => {
  const main = document.querySelector('main');
  if (!main) return null;
  const headings = [...main.querySelectorAll('h2, h3')].map((h) => h.tagName);
  const parentUl = main.querySelector('ul');
  const childUl = main.querySelector('ul ul');
  return {
    headings: headings.slice(0, 6),
    parentMarker: parentUl ? getComputedStyle(parentUl).listStyleType : null,
    childMarker: childUl ? getComputedStyle(childUl).listStyleType : null,
    hasStrong: main.querySelector('strong') !== null,
    hasCode: main.querySelector('code') !== null,
  };
});
check('prose: real h2/h3 heading scale renders (no bubble flattening)',
  !!prose && prose.headings.some((h) => h === 'H2' || h === 'H3'), JSON.stringify(prose?.headings));
check('prose: parent disc marker', prose?.parentMarker === 'disc', JSON.stringify(prose?.parentMarker));
check('prose: child dash marker where lists nest',
  prose?.childMarker == null || prose.childMarker === '"–"' || prose.childMarker === '–',
  JSON.stringify(prose?.childMarker));
await page.screenshot({ path: '/tmp/prose-legal.png', fullPage: false });

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) { process.exit(1); }
