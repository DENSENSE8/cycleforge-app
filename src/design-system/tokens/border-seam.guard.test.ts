import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname, relative } from 'node:path';
import { test } from 'node:test';

/**
 * Guards the hairline-border axis: **which token** a seam uses, and **how many
 * 1px lines land on it**.
 *
 * SCOPE: this first pass is **Unbox only** (deliberate — 2026-08-10). Colour was
 * already solved: `border-hairline / soft / default / emphasis / strong /
 * inverse` (+ functional) map to `--ds-color-border-*` in tailwind.config.ts,
 * and `color-neutrals.guard.test.ts` holds raw palette borders at a shrink-only
 * baseline. What nothing enforced was:
 *
 *   1. that a `border-border-*` class NAMES A REAL KEY. `border-border-faint`
 *      and `border-border-subtle` shipped to 4 call sites; neither is a
 *      Tailwind key, so the utility was never generated and the element fell
 *      through to the `@layer base { * { @apply border-gray-200 } }` default in
 *      src/app/globals.css. That is a RAW, un-themed gray — and the dark remap
 *      in src/styles/globals.css targets the `.border-gray-200` CLASS, which
 *      these elements never carry, so they painted light gray on dark chrome.
 *      This half is repo-wide because it is a correctness bug, not styling.
 *
 *   2. that a FLUSH group collapses its internal seams. A `gap-0` strip whose
 *      children each draw `ring-1 ring-inset` puts two 1px columns side by side
 *      — the seam renders 2px. Overlapping every child after the first by
 *      exactly the ring width (`[&>*+*]:-ml-px`) makes those columns COINCIDE.
 *      A parent `divide-x` cannot be substituted: each condition face carries
 *      its own grade hue, and one parent-owned divider colour would flatten it.
 *
 * KNOWN, OUT OF SCOPE (do not "fix" without widening the scope decision):
 *   - The desk↔inspector vertical seam is 2px on ~34 desks — the centre draws
 *     `border-r` in four layers (WorkbenchChromeHeader band, WorkbenchTriageBand,
 *     the KPI band, TABLE_SURFACE_SHEET_CLASS) against the rail's `border-l`.
 *     Both directions are rulings, not cleanups — see the KNOWN DOUBLE note in
 *     `detail-stack/layout.ts`.
 *   - The condition `scroll` density (Testing / Units / shipped), the Testing
 *     verdict strip, the station identity row and the ticket presets bar all
 *     have the same 2px pill seam. Counted by the ratchet below, not fixed.
 *
 * Set BORDER_SEAM_LIST=1 to print offenders.
 */

const SRC_ROOT = join(process.cwd(), 'src');
const LIST = process.env.BORDER_SEAM_LIST === '1';

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (['.ts', '.tsx'].includes(extname(entry))) out.push(full);
  }
  return out;
}

function isCommentLine(line: string): boolean {
  const t = line.trimStart();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
}

const ALL_FILES = walk(SRC_ROOT).filter((f) => !f.endsWith('.guard.test.ts'));
const rel = (f: string) => relative(process.cwd(), f);
const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf8');

/* ------------------------------------------------------------------ *
 * 1. Every `border-border-*` / `divide-border-*` names a real key.
 *    HARD ZERO — a class that generates no utility is never intentional,
 *    so there is no escape marker.
 * ------------------------------------------------------------------ */

test('every border-border-* class resolves to a defined Tailwind key', () => {
  const config = read('tailwind.config.ts');
  const defined = new Set<string>();
  for (const m of config.matchAll(/'border-([a-z][a-z0-9-]*)':/g)) defined.add(m[1]);

  // Sanity: the parse found the ramp. If this trips, the config shape moved
  // and the scan below would pass vacuously.
  for (const key of ['hairline', 'soft', 'default', 'emphasis', 'strong']) {
    assert.ok(defined.has(key), `tailwind.config.ts should define border-${key}`);
  }

  const offenders: string[] = [];
  for (const file of ALL_FILES) {
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (isCommentLine(line)) return;
        for (const m of line.matchAll(/\b(?:border|divide)-border-([a-z][a-z0-9-]*)/g)) {
          if (!defined.has(m[1])) offenders.push(`${rel(file)}:${i + 1} → border-${m[1]}`);
        }
      });
  }

  if (LIST) offenders.forEach((o) => console.log(o));
  assert.equal(
    offenders.length,
    0,
    `Undefined border token(s) — these generate NO css and fall through to the ` +
      `global border-gray-200 default (un-themed in dark):\n  ${offenders.join('\n  ')}`,
  );
});

/* ------------------------------------------------------------------ *
 * 2. Positive pins — the UNBOX condition strip collapses its seams.
 * ------------------------------------------------------------------ */

test('the Unbox condition strip overlaps siblings so the internal seam stays 1px', () => {
  // `barDistribute` is the Unbox mode — passed only by PoLineCaptureRow and the
  // Unbox dock tabs. The overlap lives in that branch so the fix cannot leak to
  // the `scroll` density (Testing / Units / shipped), which is out of scope.
  assert.match(
    read('src/components/receiving/workspace/ConditionPills.tsx'),
    /justify-between overflow-hidden \[&>\*\+\*\]:-ml-px/,
    'the barDistribute branch must carry the sibling overlap',
  );
  assert.match(
    read('src/lib/condition-tone.ts'),
    /barDistribute'\)[\s\S]{0,900}?const stack = isActive \? 'relative z-raised' : 'relative z-base hover:z-raised'/,
    'conditionPillClass must raise the active grade above its neighbours, in ' +
      'the barDistribute branch only',
  );
});

test('the PO line capture entry yields its top seam to the capture row', () => {
  assert.match(
    read('src/components/receiving/workspace/PoLineRow.tsx'),
    /\[&:has\(\[data-po-line-unit-capture\]\)\]:border-t-0/,
    'PO_LINE_CAPTURE_ROW_CLASS already draws border-y flush at the top of the ' +
      'entry box; scoped with :has() so the Testing path (ReceivingUnitRows, no ' +
      'top border of its own) keeps this border as its only boundary.',
  );
});

/* ------------------------------------------------------------------ *
 * 3. Shrink-only ratchet: new flush groups must collapse their seams.
 * ------------------------------------------------------------------ */

// Shrink-only. LOWER as flush strips adopt the overlap; NEVER raise to make
// your own change pass.
// 2026-08-10: armed at 3 — the Unbox-only scope leaves three known 2px pill
//   seams standing, all verified as real reads of this rule:
//     • TestingStatusPills expanded strip  (Testing — out of scope)
//     • TestingStatusPills collapsed strip (renders ONE child via a ternary, so
//       `+` never matches: benign, counted rather than special-cased so the
//       detector stays dumb)
//     • TicketReplyPresetsBar              (Support composer — out of scope)
//   Each is a one-line container fix (`[&>*+*]:-ml-px`) when its surface is in
//   scope. DROP THE BASELINE as they land.
const FLUSH_GROUP_NO_OVERLAP_BASELINE = 3;

const ESCAPE_MARKER = 'ds-allow-gap0-seam';

/** Lines of the className expression a match belongs to — the overlap may sit on a later one. */
const BLOCK_LOOKAHEAD = 8;

test('flush gap-0 groups of self-bordering faces collapse their seams', () => {
  const offenders: string[] = [];
  for (const file of ALL_FILES) {
    const src = readFileSync(file, 'utf8');
    // Only files that actually paint a self-bordering face can double a seam.
    if (!src.includes('ring-1 ring-inset')) continue;
    const lines = src.split('\n');
    lines.forEach((line, i) => {
      if (isCommentLine(line) || line.includes(ESCAPE_MARKER)) return;
      // `gap-0` as a whole token — `gap-0.5` is real air, not a flush abut.
      if (!/gap-0(?![.\d])/.test(line)) return;
      if (!line.includes('items-stretch')) return;
      // The overlap can land on a later line of the same cn()/template block
      // (Unbox puts it in the `distribute` branch), so scan the block, not the
      // line — a line-only check reported ConditionPills as broken after it
      // had been fixed.
      const block = lines.slice(i, i + BLOCK_LOOKAHEAD).join('\n');
      if (block.includes('-ml-px') || block.includes(ESCAPE_MARKER)) return;
      offenders.push(`${rel(file)}:${i + 1} → ${line.trim().slice(0, 100)}`);
    });
  }

  if (LIST) offenders.forEach((o) => console.log(o));
  assert.ok(
    offenders.length <= FLUSH_GROUP_NO_OVERLAP_BASELINE,
    `Flush gap-0 groups without sibling overlap grew to ${offenders.length} ` +
      `(baseline ${FLUSH_GROUP_NO_OVERLAP_BASELINE}). Adjacent ring-inset faces ` +
      `render a 2px seam — add \`[&>*+*]:-ml-px\` to the container, or mark a ` +
      `genuine single-child row with \`${ESCAPE_MARKER}\`. LOWER the baseline ` +
      `when you fix one; never raise it.\n  ${offenders.join('\n  ')}`,
  );
});
