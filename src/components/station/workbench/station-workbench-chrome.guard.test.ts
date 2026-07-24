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

// ── Guard F — the single sanctioned identity fork ─────────────────────────────
test('Guard F: SupportTicketIdentity is the only sanctioned non-carton identity fork', () => {
  // The one fork that does NOT compose CartonContextCard (ticket ≠ carton) must
  // stay pinned to its home; new station identity composes the entity-context adapters.
  for (const name of IDENTITY_FORK_ALLOWLIST) {
    const focus = readFileSync(join(SRC_ROOT, 'components/support/station/SupportTicketFocus.tsx'), 'utf8');
    assert.ok(focus.includes(name), `${name}: sanctioned identity fork must be mounted in SupportTicketFocus.tsx`);
  }
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
