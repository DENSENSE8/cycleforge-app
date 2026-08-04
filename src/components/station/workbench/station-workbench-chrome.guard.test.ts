import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { test } from 'node:test';
import {
  AMBIENT_WASH_BASELINE,
  AMBIENT_WASH_FINGERPRINT,
  MAX_W_3XL_BASELINE,
  IDENTITY_FORK_ALLOWLIST,
  MAX_W_3XL_ESCAPE,
  NON_STATION_COLUMN_SURFACES,
  PANEL_ROOT_BASELINE,
  PANEL_ROOT_FINGERPRINT,
  STATION_FAMILY_ROOTS,
  STATION_WORKBENCH_ADOPTION_EXEMPT,
  STATION_WORKBENCH_REQUIRED,
  TERMINAL_HAND_VM_ALLOWLIST,
} from './station-workbench-chrome-config';

/**
 * Station Workbench chrome ratchet guards. See station-workbench-chrome-config.ts
 * and `.claude/rules/display/station-workbench.md`. Baselines shrink only.
 */

const SRC_ROOT = join(process.cwd(), 'src');
const CONFIG_BASENAME = 'station-workbench-chrome-config.ts';

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (['.ts', '.tsx'].includes(extname(entry))) out.push(full);
  }
  return out;
}

const ALL_SRC = walk(SRC_ROOT);
const rel = (file: string) => relative(SRC_ROOT, file).split('\\').join('/');

const FAMILY_FILES = STATION_FAMILY_ROOTS.flatMap((root) => walk(join(SRC_ROOT, root)));

/** Lines that are comment continuation / whole-line comments — never real code. */
function isCommentLine(line: string): boolean {
  const t = line.trimStart();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('{/*');
}

/** Escape marker present on this line or up to 2 lines above. */
function hasEscape(lines: string[], i: number, marker: string): boolean {
  for (let j = Math.max(0, i - 2); j <= i; j += 1) {
    if (lines[j].includes(marker)) return true;
  }
  return false;
}

// ── Guard A — column width ratchet ────────────────────────────────────────────
test('Guard A: max-w-3xl does not grow in station-family panels (ratchet)', () => {
  let count = 0;
  const offenders: string[] = [];
  for (const file of FAMILY_FILES) {
    if (file.endsWith('.guard.test.ts')) continue;
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (!line.includes('max-w-3xl')) return;
      if (isCommentLine(line)) return;
      if (hasEscape(lines, i, MAX_W_3XL_ESCAPE)) return;
      count += 1;
      offenders.push(`${rel(file)}:${i + 1}`);
    });
  }
  assert.ok(
    count <= MAX_W_3XL_BASELINE,
    `Station-family max-w-3xl grew to ${count} (baseline ${MAX_W_3XL_BASELINE}). Unbox-family ` +
      `right panes align on STATION_WORKBENCH_* (720px) from workbench-layout.ts — never max-w-3xl ` +
      `(768px). Migrate, or mark a genuine non-column use \`${MAX_W_3XL_ESCAPE}\`. Do not raise the ` +
      `baseline.\n  - ${offenders.join('\n  - ')}`,
  );
});

// ── Guard B — ambient wash single home ────────────────────────────────────────
test('Guard B: the ambient wash fingerprint lives in exactly one SoT module', () => {
  let count = 0;
  const offenders: string[] = [];
  for (const file of ALL_SRC) {
    if (file.endsWith('.guard.test.ts') || file.endsWith(CONFIG_BASENAME)) continue;
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (!line.includes(AMBIENT_WASH_FINGERPRINT)) return;
      if (isCommentLine(line)) return;
      count += 1;
      offenders.push(`${rel(file)}:${i + 1}`);
    });
  }
  assert.ok(
    count <= AMBIENT_WASH_BASELINE,
    `Ambient-wash copies grew to ${count} (baseline ${AMBIENT_WASH_BASELINE}). Compose ` +
      `<StationAmbientWash /> (or <StationPanelRoot>) — never re-type the 3-blob wash.\n  - ` +
      offenders.join('\n  - '),
  );
  assert.ok(
    offenders.every((o) => o.startsWith('components/station/workbench/StationAmbientWash.tsx')),
    `The one ambient-wash home must be StationAmbientWash.tsx. Found: ${offenders.join(', ')}`,
  );
});

// ── Guard C — panel-root hand-roll ────────────────────────────────────────────
test('Guard C: hand-rolled station panel roots do not grow (ratchet)', () => {
  let count = 0;
  const offenders: string[] = [];
  for (const file of FAMILY_FILES) {
    if (file.endsWith('.guard.test.ts')) continue;
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (!line.includes(PANEL_ROOT_FINGERPRINT)) return;
      if (isCommentLine(line)) return;
      count += 1;
      offenders.push(`${rel(file)}:${i + 1}`);
    });
  }
  assert.ok(
    count <= PANEL_ROOT_BASELINE,
    `Hand-rolled station panel roots grew to ${count} (baseline ${PANEL_ROOT_BASELINE}). Compose ` +
      `<StationPanelRoot> from @/components/station/workbench.\n  - ${offenders.join('\n  - ')}`,
  );
});

// ── Guard D — StationWorkbench adoption ───────────────────────────────────────
test('Guard D: Tier A/B right panes compose StationWorkbench or StationPanelRoot', () => {
  const exempt = new Set<string>(STATION_WORKBENCH_ADOPTION_EXEMPT);
  for (const relPath of STATION_WORKBENCH_REQUIRED) {
    assert.equal(exempt.has(relPath), false, `${relPath}: cannot be both required and adoption-exempt`);
    const full = join(SRC_ROOT, relPath);
    assert.ok(existsSync(full), `${relPath}: listed adopter no longer exists — update the config`);
    const src = readFileSync(full, 'utf8');
    assert.ok(
      src.includes('StationWorkbench') || src.includes('StationPanelRoot'),
      `${relPath}: must compose StationWorkbench (or StationPanelRoot) from ` +
        `@/components/station/workbench — do not hand-roll the station shell.`,
    );
  }
  // Documented adoption gaps must still be real files (kept honest as ports land).
  for (const relPath of STATION_WORKBENCH_ADOPTION_EXEMPT) {
    assert.ok(existsSync(join(SRC_ROOT, relPath)), `${relPath}: adoption-exempt file no longer exists — prune it`);
  }
});

// ── Guard F — non-carton identity forks (ratchet: only ever shrinks) ──────────
test('Guard F: no station surface forks condensed identity away from CartonContextCard', () => {
  // Emptied 2026-08-01 when Support left the Station family for Workbench branch
  // `service-workspace`. A new entry means someone needs non-carton identity on a
  // station — check whether that surface is a Station at all before adding one.
  assert.equal(
    IDENTITY_FORK_ALLOWLIST.length,
    0,
    'IDENTITY_FORK_ALLOWLIST is a shrink-only ratchet — compose the entity-context adapters instead of forking identity.',
  );
});

// ── Guard F2 — Support Ticket tab uses the Unbox composer compound ────────────
test('Guard F2: SupportTicketFocus Ticket dock uses SupportTicketComposerDock', () => {
  const focus = readFileSync(join(SRC_ROOT, 'components/support/service-workspace/SupportTicketFocus.tsx'), 'utf8');
  assert.ok(
    focus.includes('SupportTicketComposerDock'),
    'SupportTicketFocus must mount SupportTicketComposerDock (OmnichannelComposerDock + embedded Reply) on the Ticket tab — not a sticky composer stacked above a bare FAB',
  );
  assert.ok(
    focus.includes('TicketComposerStagingProvider'),
    'SupportTicketFocus must provide host-owned photo staging for the floating ticket composer',
  );
});

// ── Guard E — terminal path ───────────────────────────────────────────────────
test('Guard E: <StationTerminalDock> mounts go through the terminal registry', () => {
  const allowlist = new Set<string>(TERMINAL_HAND_VM_ALLOWLIST);
  const offenders: string[] = [];
  for (const file of FAMILY_FILES) {
    if (file.endsWith('.guard.test.ts')) continue;
    const src = readFileSync(file, 'utf8');
    if (!src.includes('<StationTerminalDock')) continue;
    const relPath = rel(file);
    if (allowlist.has(relPath)) continue;
    if (src.includes('useStationTerminalAction')) continue;
    offenders.push(relPath);
  }
  assert.deepEqual(
    offenders,
    [],
    `These files mount <StationTerminalDock> with a hand-built VM instead of ` +
      `useStationTerminalAction + STATION_TERMINAL_REGISTRY. Move onto the registry, or add a ` +
      `documented entry to TERMINAL_HAND_VM_ALLOWLIST with a port follow-up:\n  - ` +
      offenders.join('\n  - '),
  );
});

// ── Guard H — declared NON-Station surfaces ───────────────────────────────────
/**
 * Pickup and Repair intake sat in the Scan Stations spine section and compose
 * no station chrome. That is a DECISION (see NON_STATION_COLUMN_SURFACES), and
 * a decision nothing checks is indistinguishable from an unfinished port — the
 * silence the handoff asked to break.
 *
 * Asserted in both directions: the file still exists (a moved surface must
 * re-declare, not silently drop off), and it composes no station column shell.
 * Adding a bookmark to a listed surface fails here until the entry is deleted,
 * and deleting the entry IS the act of joining the family.
 */
test('Guard H: declared non-Station surfaces compose no station column shell', () => {
  const STATION_CHROME = [
    '<StationWorkbench',
    '<StationContextBar',
    '<StationPanelRoot',
    '<CartonContextCard',
  ] as const;

  const missing: string[] = [];
  const offenders: string[] = [];

  for (const relPath of NON_STATION_COLUMN_SURFACES) {
    const full = join(SRC_ROOT, relPath);
    if (!existsSync(full)) {
      missing.push(relPath);
      continue;
    }
    const src = readFileSync(full, 'utf8');
    const hits = STATION_CHROME.filter((needle) => src.includes(needle));
    if (hits.length > 0) offenders.push(`${relPath} → ${hits.join(', ')}`);
  }

  assert.deepEqual(
    missing,
    [],
    'NON_STATION_COLUMN_SURFACES names a file that no longer exists. A surface that ' +
      'moved must re-declare where it landed — dropping the entry silently is how the ' +
      'decision goes missing again:\n  - ' + missing.join('\n  - '),
  );
  assert.deepEqual(
    offenders,
    [],
    'These surfaces are DECLARED non-Station but now compose station column chrome. ' +
      'If they genuinely grew a scan loop, finish the port (StationWorkbench + a ' +
      'CartonContextCard adapter) and DELETE the NON_STATION_COLUMN_SURFACES entry — ' +
      'half-ported station chrome on a form is the lobotomized-work-chrome ' +
      'anti-pattern:\n  - ' + offenders.join('\n  - '),
  );
});

test('bodyAlign=end uses flex gap — space-y dies under Items mb-auto', () => {
  // Unbox pins Items with `mb-auto` on the justify-end column. `space-y-*`
  // puts margin-bottom on that child; mb-auto overrides it and the
  // Items↔procedure cards go flush whenever free space runs out. Flex `gap`
  // survives auto margins.
  const src = readFileSync(
    join(SRC_ROOT, 'components/station/workbench/StationWorkbench.tsx'),
    'utf8',
  ).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, ' ');

  assert.match(
    src,
    /bodyAlign\s*===\s*['"]end['"]\s*\?[\s\S]*?gap-4/,
    'bodyAlign=end must space siblings with flex gap-4',
  );
  assert.equal(
    /bodyAlign\s*===\s*['"]end['"]\s*&&\s*['"][^'"]*space-y-/.test(src),
    false,
    'do not pair bodyAlign=end with space-y — mb-auto on Items collapses it',
  );
});
