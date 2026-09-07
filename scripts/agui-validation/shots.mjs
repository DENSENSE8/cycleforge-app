/**
 * AG-UI validation rig — replay the 20 adversarial cases through the REAL
 * session surface and screenshot each one: chat transcript on the left, the
 * AG-UI artifact plane on the right.
 *
 * The only thing faked is the model. `/api/assistant/chat` is intercepted and
 * answered with the scripted SSE frames from `.tmp/agui-validation/cases.json`,
 * because the local gateway on :8081 accepts a completion request and never
 * returns (documented as a CANNOT-REACH in the report). Everything downstream of
 * the wire is the shipping code path: `useAssistantChat`'s SSE parser →
 * `SESSION_ARTIFACT_EVENT` → `sessionArtifactSchema.safeParse` →
 * `ArtifactViewPanel` → `ReportArtifact`.
 *
 * Console errors and page exceptions are captured per case — that is how a
 * renderer crash on a payload that passed zod becomes evidence instead of a
 * blank rectangle.
 *
 * Run: node scripts/agui-validation/shots.mjs ["/out/dir"]
 */

import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const BASE_URL = process.env.PW_BASE_URL || 'http://localhost:3050';
const ONLY = process.env.AGUI_ANGLES
  ? new Set(process.env.AGUI_ANGLES.split(',').map((n) => Number(n.trim())))
  : null;
const CASES = JSON.parse(readFileSync('.tmp/agui-validation/cases.json', 'utf8')).filter(
  (c) => !ONLY || ONLY.has(c.angle),
);
const OUT_DIR = process.argv[2] || path.join(homedir(), 'Desktop', 'AG UI validation');
const STORAGE = 'tests/.auth/admin.json';
const DEFAULT_VIEWPORT = { width: 1680, height: 1000 };

const sseBody = (frames) =>
  frames
    .map((f) => `event: ${f.event}\ndata: ${f.raw ?? JSON.stringify(f.data ?? {})}\n\n`)
    .join('');

const REPORT = '[data-artifact-report]';

/**
 * The readable-by-a-human measurements: does each verdict carry a WORD and a
 * GLYPH (so greyscale and colour-blindness survive), is every definition in the
 * DOM rather than behind a hover, and is the table semantic (thead/tbody/tfoot
 * with scope on the headers)?
 */
async function a11yState(page) {
  return page.evaluate(() => {
    const report = document.querySelector('[data-artifact-report]');
    if (!report) return null;
    const kpis = Array.from(report.querySelectorAll('ul > li'));
    const verdicts = kpis.map((li) => {
      const word = ['on target', 'watch', 'off target'].find((w) => (li.textContent ?? '').includes(w)) ?? null;
      return { word, glyphs: li.querySelectorAll('svg').length, definition: li.querySelectorAll('p').length >= 4 };
    });
    const tables = Array.from(report.querySelectorAll('table'));
    return {
      kpiCount: kpis.length,
      withWord: verdicts.filter((v) => v.word).length,
      wordWithGlyph: verdicts.filter((v) => v.word && v.glyphs > 0).length,
      wordWithoutGlyph: verdicts.filter((v) => v.word && v.glyphs === 0).length,
      neutralWithAccent: verdicts.filter((v) => !v.word && v.glyphs > 0).length,
      definitionsInDom: verdicts.filter((v) => v.definition).length,
      tables: tables.map((t) => ({
        thead: !!t.querySelector('thead'),
        tbody: !!t.querySelector('tbody'),
        tfoot: !!t.querySelector('tfoot'),
        headersWithScope: t.querySelectorAll('th[scope]').length,
        headers: t.querySelectorAll('th').length,
      })),
      scrollportFocusable: report.getAttribute('tabindex'),
      panelLabel: report.getAttribute('aria-label') ?? document.querySelector('[aria-label="Data view"]') ? 'present' : null,
    };
  });
}

async function paneState(page) {
  return page.evaluate(() => {
    const surface = document.querySelector('[data-session-surface]');
    const report = document.querySelector('[data-artifact-report]');
    const cols = surface ? Array.from(surface.children) : [];
    const box = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), w: Math.round(r.width) };
    };
    return {
      reportPresent: !!report,
      reportBox: box(report),
      chatBox: box(document.querySelector('[aria-label="Agent session"]')),
      columns: cols.length,
      reportTitle: report?.querySelector('h2')?.textContent?.slice(0, 80) ?? null,
      rejected: !!document.body.textContent?.match(/could not be rendered|invalid artifact/i),
      cellSample: Array.from(document.querySelectorAll(`${'[data-artifact-report]'} tbody tr`))
        .slice(0, 6)
        .map((tr) => Array.from(tr.children).map((td) => td.textContent)),
      headerSample: Array.from(document.querySelectorAll('[data-artifact-report] thead tr')).map((tr) =>
        Array.from(tr.children).map((th) => th.textContent?.slice(0, 24)),
      ),
      cellsPerRow: Array.from(document.querySelectorAll('[data-artifact-report] tbody tr'))
        .slice(0, 4)
        .map((tr) => tr.children.length),
      totalsSample: Array.from(document.querySelectorAll('[data-artifact-report] tfoot td')).map(
        (td) => td.textContent,
      ),
      headline: document.querySelector('[data-artifact-report] .text-role-display')?.textContent ?? null,
      hScroll: (() => {
        const el = document.querySelector('[data-artifact-report]');
        if (!el) return null;
        const tables = Array.from(el.querySelectorAll('table'));
        return {
          panelOverflow: el.scrollWidth - el.clientWidth,
          tableOverflow: tables.map((t) => t.parentElement.scrollWidth - t.parentElement.clientWidth),
        };
      })(),
      verdictWords: Array.from(document.querySelectorAll('[data-artifact-report] li'))
        .map((li) => li.textContent?.trim().slice(0, 60))
        .filter((t) => t && /good|watch|bad|on target/i.test(t))
        .slice(0, 6),
      // ── the security observations ────────────────────────────────────────
      // Anything the panel EXECUTED rather than printed, and anything it made
      // clickable that is not https.
      injectedScripts: report ? report.querySelectorAll('script,iframe,object,embed').length : null,
      injectedHandlers: report
        ? Array.from(report.querySelectorAll('*')).filter((el) =>
            Array.from(el.attributes).some((a) => a.name.startsWith('on')),
          ).length
        : null,
      links: report
        ? Array.from(report.querySelectorAll('a')).map((a) => a.getAttribute('href')).slice(0, 8)
        : null,
      rtlOverrideCells: report
        ? Array.from(report.querySelectorAll('td,th,p,span'))
            .filter((el) => (el.textContent ?? '').includes('\u202E'))
            .map((el) => (el.textContent ?? '').slice(0, 40))
            .slice(0, 6)
        : null,
      escapedHtmlAsText: report
        ? Array.from(report.querySelectorAll('td'))
            .filter((td) => (td.textContent ?? '').includes('<script>') || (td.textContent ?? '').includes('onerror'))
            .map((td) => (td.textContent ?? '').slice(0, 60))
            .slice(0, 4)
        : null,
      // ── the panel's own stack: one current, capped history ───────────────
      stackCount: document.querySelectorAll('[aria-label="Data view"] ul li button[aria-label^="Dismiss"]').length,
      reportsMounted: document.querySelectorAll('[data-artifact-report]').length,
      // ── what the chat says while the panel says something else ──────────
      chatTail: Array.from(document.querySelectorAll('[aria-label="Agent session"] p, [aria-label="Agent session"] div'))
        .map((el) => el.textContent?.trim() ?? '')
        .filter((t) => t.length > 12 && t.length < 220)
        .slice(-4),
      composerValue: document.querySelector('textarea')?.value?.slice(0, 120) ?? null,
    };
  });
}

async function sendTurn(page, question) {
  const composer = page.getByPlaceholder('Ask the agent…').first();
  await composer.waitFor({ state: 'visible', timeout: 20_000 });
  await composer.click();
  await composer.fill(question);
  await composer.press('Enter');
}

/**
 * Since the arrival fix, an artifact (or a refused payload) promotes the pane
 * itself. This stays as a witness: it presses the routed ⌘B toggle only when
 * the artifact plane is genuinely absent, and reports which door opened it, so
 * a regression back to "the report paints into a pane nobody is looking at"
 * shows up in every row of the run.
 */
const PLANE = '[aria-label="Data view"]';

async function ensureArtifactPane(page) {
  if ((await page.locator(PLANE).count()) > 0) return { opened: 'auto' };
  await page.keyboard.press('ControlOrMeta+b');
  try {
    await page.locator(PLANE).first().waitFor({ state: 'visible', timeout: 6000 });
    return { opened: 'manual-cmd-b' };
  } catch {
    return { opened: 'never' };
  }
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const results = [];

  for (const c of CASES) {
    const context = await browser.newContext({
      storageState: STORAGE,
      viewport: c.viewport ?? DEFAULT_VIEWPORT,
      deviceScaleFactor: 2,
      reducedMotion: 'reduce',
      colorScheme: 'light',
    });
    const page = await context.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 400));
    });
    page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 400)));

    // One queue per case: the probe turn (if any), then the numbered turn, then
    // the follow-up. A turn beyond the queue replays the last entry, so a
    // stray re-send can never answer with another case's frames.
    const queue = [
      ...(c.probe ? [c.probe.frames] : []),
      c.frames,
      ...(c.followUpTurn ? [c.followUpTurn.frames] : []),
    ];
    let turn = 0;
    await context.route('**/api/assistant/chat', async (route) => {
      const frames = queue[Math.min(turn, queue.length - 1)];
      turn += 1;
      await route.fulfill({
        status: 200,
        headers: {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-cache, no-transform',
        },
        body: sseBody(frames),
      });
    });
    // Keep the shot deterministic: the mission pane's polling reads are not
    // under test here and their timing moves pixels between runs.
    await context.route('**/api/floor-feed**', (r) => r.fulfill({ status: 200, body: '{"events":[]}' }));

    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => {});

    // ── probe: the attack that is expected to take the route down ───────────
    let probeShot = null;
    let probeErrors = [];
    if (c.probe) {
      await sendTurn(page, c.probe.question);
      await page.waitForTimeout(1500);
      await ensureArtifactPane(page);
      await page.waitForTimeout(400);
      mkdirSync(path.join(OUT_DIR, 'evidence'), { recursive: true });
      probeShot = path.join(OUT_DIR, 'evidence', `${c.probe.evidenceName}.png`);
      await page.screenshot({ path: probeShot, fullPage: false });
      probeErrors = [...consoleErrors, ...pageErrors].slice(0, 8);
      consoleErrors.length = 0;
      pageErrors.length = 0;
      // The crash unmounts the route; a reload is the operator's only recourse,
      // which is itself part of the finding.
      await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle').catch(() => {});
    }

    await sendTurn(page, c.question);
    await page.waitForTimeout(1200);
    const opened = await ensureArtifactPane(page);

    if (c.followUpTurn) {
      await page.waitForTimeout(600);
      await sendTurn(page, c.followUpTurn.question);
      await page.waitForTimeout(1500);
    }

    // The Next dev-tools portal floats over the panel header and would hide the
    // very thing each shot is evidence of. Its issue count is captured in
    // `consoleErrors` instead, which is the durable record anyway.
    await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });

    if (c.post === 'greyscale' || c.post === 'greyscale-keyboard') {
      await page.addStyleTag({ content: 'html{filter:grayscale(1)!important}' });
    }
    if (c.post === 'keyboard' || c.post === 'greyscale-keyboard') {
      // Walk in from the panel, not from the page: click the report's own
      // scrollport first so Tab lands on the follow-up chips an owner would
      // reach for, and the focus ring is visible in the shot.
      await page.locator(REPORT).first().focus().catch(() => {});
      for (let i = 0; i < 3; i += 1) await page.keyboard.press('Tab');
    }
    if (c.post === 'click-followup') {
      // The one sanctioned interaction on a report: seeding the composer with
      // the sentence the report carries. The turn counter proves whether the
      // click stayed data (fills the field) or became behavior (sends a turn).
      const chip = page.locator('[data-artifact-report] ~ div button, [aria-label^="Ask: "]').first();
      await chip.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(800);
    }
    if (c.post === 'zoom200') {
      await page.evaluate(() => {
        document.documentElement.style.zoom = '2';
      });
    }
    await page.waitForTimeout(700);

    const state = await paneState(page);
    const a11y = c.axe || c.post === 'greyscale-keyboard' ? await a11yState(page) : null;
    let axeViolations = null;
    if (c.axe || c.post === 'greyscale-keyboard') {
      try {
        const scan = await new AxeBuilder({ page }).include('[aria-label="Data view"]').analyze();
        axeViolations = scan.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          nodes: v.nodes.length,
          help: v.help,
          target: v.nodes[0]?.target?.join(' ') ?? null,
        }));
      } catch (err) {
        axeViolations = [{ id: 'axe-failed', help: String(err.message).slice(0, 200) }];
      }
    }
    const focused = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return null;
      const label = el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 40);
      return `${el.tagName.toLowerCase()}${label ? `[${label}]` : ''}`;
    });

    const file = path.join(OUT_DIR, `${String(c.angle).padStart(2, '0')}-${c.slug.replace(/^\d+-/, '')}.png`);
    await page.screenshot({ path: file, fullPage: false });

    // A width probe AFTER the numbered shot: the same painted report squeezed
    // to a phone width, so the blow-out is measured on the same DOM.
    let narrow = null;
    if (c.narrowProbe) {
      await page.setViewportSize({ width: c.narrowProbe, height: c.viewport?.height ?? 900 });
      await page.waitForTimeout(600);
      const narrowState = await paneState(page);
      mkdirSync(path.join(OUT_DIR, 'evidence'), { recursive: true });
      const narrowFile = path.join(OUT_DIR, 'evidence', `${String(c.angle).padStart(2, '0')}-at-${c.narrowProbe}px.png`);
      await page.screenshot({ path: narrowFile, fullPage: false });
      narrow = { width: c.narrowProbe, file: narrowFile, state: narrowState };
    }

    results.push({
      angle: c.angle,
      slug: c.slug,
      title: c.title,
      provenance: c.provenance,
      caption: c.caption,
      file,
      paneOpened: opened.opened,
      state,
      focused,
      consoleErrors: consoleErrors.slice(0, 8),
      pageErrors: pageErrors.slice(0, 8),
      probeShot,
      probeErrors,
      narrow,
      turnsRequested: turn,
      a11y,
      axeViolations,
    });
    console.log(
      `${String(c.angle).padStart(2)} ${c.slug.padEnd(26)} pane=${opened.opened.padEnd(12)} report=${state.reportPresent} ` +
        `errs=${consoleErrors.length}/${pageErrors.length} → ${path.basename(file)}`,
    );

    await context.close();
  }

  await browser.close();
  writeFileSync('.tmp/agui-validation/shots-report.json', `${JSON.stringify(results, null, 2)}\n`);
  console.log(`\n${results.length} shots → ${OUT_DIR}`);
  console.log('observations → .tmp/agui-validation/shots-report.json');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
