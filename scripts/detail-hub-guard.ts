/**
 * CLI face of the mobile exoskeleton law: every scanned entity's phone record
 * is ONE grammar — DetailHubScreen, a DetailSummaryCard mapper, detailDoor
 * doors, a ≤3-verb DetailDock, and /info as the only edit (operator
 * 2026-09-24).
 *
 * The rules live in `src/lib/mobile/detail-hub-law.ts`, the peers and the
 * shrink-only baseline in `src/lib/mobile/detail-hub-cohort.ts` — ONE module,
 * three consumers:
 *
 *   1. `detail-hub-law.test.ts` — pure predicates on planted violations.
 *   2. this script — `node_modules/.bin/tsx scripts/detail-hub-guard.ts [--json] [--file <path>]`,
 *      the `Detail hub` gate in `verify:fast`.
 *   3. `ds_detail_hub` — the design-mcp face, which spawns this script.
 *
 * Full run:
 *   - ported peers: every hub + /info rule, zero violations.
 *   - every `<DetailDock>` in src: ≤3 verbs, one primary.
 *   - any /m page mounting DetailHubScreen must be a listed peer.
 *   - unported peers: counted against DETAIL_HUB_UNPORTED_BASELINE (shrink-only);
 *     one that now passes must be flipped to ported with the baseline dropped.
 *   - every phone file (`src/components/mobile`, `src/app/m`) mounting
 *     `<BottomSheet` has a role in MOBILE_SHEET_ROLES
 *     (`src/lib/mobile/mobile-sheet-roles.ts`); `record` sheets are counted
 *     against MOBILE_RECORD_SHEET_BASELINE (shrink-only).
 *
 * `--file <path>`: the verdict for that one file (hub rules if it is a hub
 * page or mounts DetailHubScreen, /info rules if it is an info page, dock
 * rules always). An unported peer's own hub reports its gaps but exits 0 —
 * the baseline, not a single-file probe, decides whether they are allowed.
 *
 * Exit 0 = the law holds. Exit 1 = violations, listed. Exit 2 = the guard
 * itself broke, which is never a verdict.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import {
  auditDetailDockSource,
  auditDetailHubPage,
  auditDetailInfoPage,
  auditMobileSheets,
  DETAIL_HUB_KIT,
  DETAIL_HUB_REFUSAL,
  formatDetailHubViolation,
  type DetailHubViolation,
  type ModuleReader,
} from '../src/lib/mobile/detail-hub-law';
import { DETAIL_HUB_PEERS, DETAIL_HUB_UNPORTED_BASELINE } from '../src/lib/mobile/detail-hub-cohort';
import { MOBILE_RECORD_SHEET_BASELINE, MOBILE_SHEET_ROLES } from '../src/lib/mobile/mobile-sheet-roles';

const argv = process.argv.slice(2);
const asJson = argv.includes('--json');
const fileIdx = argv.indexOf('--file');
const onlyFile = fileIdx >= 0 ? argv[fileIdx + 1] : null;
const REPO = path.resolve(__dirname, '..');

const posix = (p: string) => p.split(path.sep).join('/');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

function read(rel: string): string | null {
  const abs = path.join(REPO, rel);
  return existsSync(abs) ? readFileSync(abs, 'utf8') : null;
}

/** `@/x/y` and `./y` → the source text of that module, trying .tsx/.ts/index. */
const readModule: ModuleReader = (fromFile, spec) => {
  let base: string;
  if (spec.startsWith('@/')) base = path.join('src', spec.slice(2));
  else if (spec.startsWith('.')) base = path.join(path.dirname(fromFile), spec);
  else return null;
  for (const ext of ['.tsx', '.ts', '/index.tsx', '/index.ts']) {
    const text = read(posix(base + ext));
    if (text != null) return text;
  }
  return null;
};

function isInfoPage(rel: string): boolean {
  return /^src\/app\/m\/.*\/info\/page\.tsx$/.test(rel);
}

interface Report {
  ok: boolean;
  violations: DetailHubViolation[];
  problems: string[];
  unported?: { peers: { route: string; gaps: number }[]; count: number; baseline: number };
  law: string;
  kit: typeof DETAIL_HUB_KIT;
}

function checkOne(rel: string): Report {
  const text = read(rel);
  if (text == null) throw new Error(`no such file: ${rel}`);
  const peer = DETAIL_HUB_PEERS.find((p) => p.hub === rel);
  const violations: DetailHubViolation[] = [...auditDetailDockSource(rel, text)];
  let advisory = false;
  if (peer || /<DetailHubScreen\b/.test(text)) {
    violations.push(...auditDetailHubPage(rel, text, readModule));
    advisory = peer?.status === 'unported';
  }
  if (isInfoPage(rel)) violations.push(...auditDetailInfoPage(rel, text));
  // One file: only its own classification — stale entries and the baseline are full-run verdicts.
  violations.push(...auditMobileSheets([{ file: rel, source: text }], MOBILE_SHEET_ROLES, MOBILE_RECORD_SHEET_BASELINE).violations);
  const problems = advisory && violations.length > 0
    ? [`${rel} is an unported peer — these are its porting gaps (counted by the baseline, not failed here)`]
    : [];
  return {
    ok: advisory || violations.length === 0,
    violations,
    problems,
    law: DETAIL_HUB_REFUSAL,
    kit: DETAIL_HUB_KIT,
  };
}

function checkAll(): Report {
  const violations: DetailHubViolation[] = [];
  const problems: string[] = [];
  const files = walk(path.join(REPO, 'src')).map((abs) => posix(path.relative(REPO, abs)));
  const sheetFiles: { file: string; source: string }[] = [];

  for (const rel of files) {
    const text = readFileSync(path.join(REPO, rel), 'utf8');
    if (text.includes('<DetailDock')) violations.push(...auditDetailDockSource(rel, text));
    if (text.includes('<BottomSheet')) sheetFiles.push({ file: rel, source: text });
    if (rel.startsWith('src/app/m/') && /<DetailHubScreen\b/.test(text) && !DETAIL_HUB_PEERS.some((p) => p.hub === rel)) {
      problems.push(`${rel} mounts DetailHubScreen but is not in DETAIL_HUB_PEERS (src/lib/mobile/detail-hub-cohort.ts)`);
    }
  }

  const sheets = auditMobileSheets(sheetFiles, MOBILE_SHEET_ROLES, MOBILE_RECORD_SHEET_BASELINE);
  violations.push(...sheets.violations);
  problems.push(...sheets.problems);

  const unported: { route: string; gaps: number }[] = [];
  for (const peer of DETAIL_HUB_PEERS) {
    const hub = read(peer.hub);
    if (hub == null) {
      problems.push(`${peer.route}: hub file ${peer.hub} is missing — fix the cohort entry`);
      continue;
    }
    const hubViolations = auditDetailHubPage(peer.hub, hub, readModule);
    if (peer.status === 'ported') {
      violations.push(...hubViolations);
      const info = peer.info ? read(peer.info) : null;
      if (!peer.info || info == null) {
        problems.push(`${peer.route}: a ported hub needs its /info screen (${peer.info ?? 'none listed'})`);
      } else {
        violations.push(...auditDetailInfoPage(peer.info, info));
      }
    } else if (hubViolations.length === 0) {
      problems.push(
        `${peer.route} now passes the law — flip it to status 'ported' and drop DETAIL_HUB_UNPORTED_BASELINE ` +
          `in the same commit`,
      );
    } else {
      unported.push({ route: peer.route, gaps: hubViolations.length });
    }
  }

  const count = DETAIL_HUB_PEERS.filter((p) => p.status === 'unported').length;
  if (count > DETAIL_HUB_UNPORTED_BASELINE) {
    problems.push(`unported entity hubs rose to ${count} (baseline ${DETAIL_HUB_UNPORTED_BASELINE}) — the baseline only shrinks`);
  } else if (count < DETAIL_HUB_UNPORTED_BASELINE) {
    problems.push(`port complete — drop DETAIL_HUB_UNPORTED_BASELINE to ${count} in the same commit`);
  }

  return {
    ok: violations.length === 0 && problems.length === 0,
    violations,
    problems,
    unported: { peers: unported, count, baseline: DETAIL_HUB_UNPORTED_BASELINE },
    law: DETAIL_HUB_REFUSAL,
    kit: DETAIL_HUB_KIT,
  };
}

try {
  const report = onlyFile ? checkOne(posix(path.relative(REPO, path.resolve(REPO, onlyFile)))) : checkAll();

  if (asJson) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else if (report.ok && report.violations.length === 0) {
    const tail = report.unported
      ? ` ${DETAIL_HUB_PEERS.length - report.unported.count} ported, ${report.unported.count} unported ` +
        `(baseline ${report.unported.baseline}).`
      : '';
    process.stdout.write(`detail-hub-guard: the exoskeleton law holds.${tail}\n`);
  } else {
    const lines = [
      ...report.violations.map((v) => `  ${formatDetailHubViolation(v)}`),
      ...report.problems.map((p) => `  ${p}`),
    ];
    process.stdout.write(`detail-hub-guard:\n${lines.join('\n')}\n\n${DETAIL_HUB_REFUSAL}\n`);
  }
  process.exit(report.ok ? 0 : 1);
} catch (error) {
  process.stderr.write(`detail-hub-guard failed: ${String(error)}\n`);
  process.exit(2);
}
