/**
 * CLI face of the SCREEN BUDGET law (`src/lib/disclosure/screen-budget.ts`).
 *
 *   tsx scripts/disclosure-audit.ts                       # static: every declared surface (verify:fast `Disclosure`)
 *   tsx scripts/disclosure-audit.ts --surface task-sheet  # live: measure the first screen at :3050 (390×844)
 *        [--param id=16127] [--theme dark] [--json] [--screenshot /tmp/x.png]
 *   tsx scripts/disclosure-audit.ts --json --input '{"surface":"task-sheet","params":{"id":"16127"}}'   # ds_disclosure
 *
 * Output: the DELETE · SIMPLIFY · MOVE · ENLARGE lists, each finding with its recipe.
 * Exit 0 = within budget. Exit 1 = findings. Exit 2 = the audit itself broke (lane down,
 * unknown surface) — never a verdict. The live mode reads the operator's dev origin
 * only (AGENTS.md §1) and signs in with tests/.auth/admin.json; it never writes.
 */

import { chromium } from '@playwright/test';
import {
  checkScreenSnapshot,
  checkSurfaceSpec,
  disclosureLists,
  type DisclosureFinding,
  type ScreenSnapshot,
  type SurfaceDisclosureSpec,
} from '../src/lib/disclosure/screen-budget';
import { DISCLOSURE_SURFACES, disclosureSurface } from '../src/lib/disclosure/surfaces';

const ORIGIN = 'http://localhost:3050';
const VIEWPORT = { width: 390, height: 844 };

interface AuditInput {
  surface?: string;
  params?: Record<string, string>;
  theme?: 'light' | 'dark';
  screenshot?: string;
}

function readInput(argv: readonly string[]): AuditInput {
  const at = argv.indexOf('--input');
  if (at >= 0) return JSON.parse(argv[at + 1] ?? '{}') as AuditInput;
  const flag = (name: string) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const params: Record<string, string> = {};
  argv.forEach((arg, i) => {
    if (arg !== '--param') return;
    const [k, ...v] = (argv[i + 1] ?? '').split('=');
    if (k) params[k] = v.join('=');
  });
  const theme = flag('--theme');
  return {
    surface: flag('--surface'),
    params,
    theme: theme === 'dark' ? 'dark' : theme === 'light' ? 'light' : undefined,
    screenshot: flag('--screenshot'),
  };
}

function probeUrl(spec: SurfaceDisclosureSpec, params: Record<string, string>): string {
  const all = { ...spec.probe.params, ...params };
  return spec.probe.path.replace(/\{(\w+)\}/g, (_, k: string) => encodeURIComponent(all[k] ?? ''));
}

/** Runs IN the page: measure the first screen. Plain DOM, no app imports. */
function snapshotScreen(): ScreenSnapshot {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const root: Element = document.querySelector('[role="dialog"]') ?? document.body;
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || r.bottom <= 0 || r.top >= vh) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && !el.closest('.sr-only, [aria-hidden="true"]');
  };
  const rectOf = (el: Element) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  };
  const nameOf = (el: Element) =>
    (el.getAttribute('aria-label') ?? el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40) || el.tagName.toLowerCase();

  const slots: Record<string, { x: number; y: number; width: number; height: number }> = {};
  for (const el of root.querySelectorAll('[data-disclosure-slot]')) {
    const slot = el.getAttribute('data-disclosure-slot')!;
    if (!slots[slot] && visible(el)) slots[slot] = rectOf(el);
  }
  const l1 = root.querySelector('[data-disclosure-zone="l1"]');

  const CONTROL = 'button, a[href], input:not([type="file"]), textarea, select, [role="button"], [role="combobox"], [role="slider"]';
  const controls = [...root.querySelectorAll(CONTROL)].filter(visible);
  const l1Controls = controls
    .filter((el) => l1?.contains(el))
    .map((el) => ({ name: nameOf(el), slot: el.closest('[data-disclosure-slot]')?.getAttribute('data-disclosure-slot') ?? null }));
  const targets = controls
    // Inline links inside running prose are exempt (WCAG 2.5.8 inline exception).
    .filter((el) => !(el.tagName === 'A' && el.closest('p, li')))
    .map((el) => {
      const r = el.getBoundingClientRect();
      const before = getComputedStyle(el, '::before');
      const grow = before.content !== 'none' && before.position === 'absolute' ? -2 * (parseFloat(before.top) || 0) : 0;
      return { name: nameOf(el), width: r.width + grow, height: r.height + grow };
    });

  const texts: ScreenSnapshot['texts'][number][] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
    const el = node.parentElement;
    if (!text || !el || !visible(el)) continue;
    texts.push({
      text,
      zone: el.closest('[data-disclosure-zone]')?.getAttribute('data-disclosure-zone') ?? null,
      isLabel: Boolean(el.closest('label')),
    });
  }

  return {
    viewport: { width: vw, height: vh },
    slots,
    l1Height: l1 ? l1.getBoundingClientRect().height : 0,
    titleFirstLine: (() => {
      const title = root.querySelector('[data-disclosure-slot="title"]');
      if (!title) return null;
      const range = document.createRange();
      range.selectNodeContents(title);
      const first = [...range.getClientRects()].find((r) => r.width > 0 && r.height > 0);
      return first ? { x: first.x, y: first.y, width: first.width, height: first.height } : null;
    })(),
    l1Controls,
    texts,
    targets,
  };
}

function printLists(title: string, findings: readonly DisclosureFinding[]): void {
  const lists = disclosureLists(findings);
  process.stdout.write(`${title}: ${findings.length === 0 ? 'within budget' : `${findings.length} finding(s)`}\n`);
  for (const remedy of ['delete', 'simplify', 'move', 'enlarge'] as const) {
    if (lists[remedy].length === 0) continue;
    process.stdout.write(`  ${remedy.toUpperCase()}\n`);
    for (const f of lists[remedy]) process.stdout.write(`    [${f.rule}] ${f.detail}\n      → ${f.fix}\n`);
  }
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const asJson = argv.includes('--json');
  const input = readInput(argv);
  const staticFindings = DISCLOSURE_SURFACES.flatMap(checkSurfaceSpec);

  if (!input.surface) {
    if (asJson) {
      process.stdout.write(`${JSON.stringify({ ok: staticFindings.length === 0, surfaces: DISCLOSURE_SURFACES.map((s) => s.id), findings: staticFindings, lists: disclosureLists(staticFindings) }, null, 2)}\n`);
    } else {
      printLists(`disclosure: ${DISCLOSURE_SURFACES.length} declared surface(s)`, staticFindings);
    }
    return staticFindings.length === 0 ? 0 : 1;
  }

  const spec = disclosureSurface(input.surface);
  if (!spec) throw new Error(`unknown surface "${input.surface}" — declared: ${DISCLOSURE_SURFACES.map((s) => s.id).join(', ')}`);
  const url = probeUrl(spec, input.params ?? {});

  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({
      storageState: 'tests/.auth/admin.json',
      baseURL: ORIGIN,
      viewport: VIEWPORT,
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 2,
    });
    const page = await ctx.newPage();
    // tsx (esbuild keepNames) wraps named functions in `__name(...)`; `snapshotScreen` runs in the
    // page, which has no such helper — give it the identity one.
    await page.addInitScript('globalThis.__name = (fn) => fn;');
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector(spec.probe.ready, { timeout: 90_000 });
    if (input.theme === 'dark') {
      await page.evaluate(() => {
        document.documentElement.dataset.theme = 'dark';
        document.documentElement.dataset.colorScheme = 'dark';
      });
    }
    // Let the record's queries land (docs, media, timeline) before measuring.
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
    const snap = await page.evaluate(snapshotScreen);
    if (input.screenshot) await page.screenshot({ path: input.screenshot });
    const findings = [...checkSurfaceSpec(spec), ...checkScreenSnapshot(spec, snap)];
    if (asJson) {
      process.stdout.write(
        `${JSON.stringify({ ok: findings.length === 0, surface: spec.id, url: `${ORIGIN}${url}`, theme: input.theme ?? 'light', owner: spec.owner, findings, lists: disclosureLists(findings), l1Height: Math.round(snap.l1Height), slots: Object.keys(snap.slots) }, null, 2)}\n`,
      );
    } else {
      printLists(`disclosure ${spec.id} @ ${ORIGIN}${url}`, findings);
    }
    return findings.length === 0 ? 0 : 1;
  } finally {
    await browser.close();
  }
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    process.stderr.write(`disclosure-audit failed: ${String(error)}\n`);
    process.exit(2);
  },
);
