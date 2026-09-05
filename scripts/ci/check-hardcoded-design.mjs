#!/usr/bin/env node
/**
 * Deterministic scan for the hard-coded design values that caused real defects
 * in this repo. Blocking gate — see .github/workflows/design-gates.yml.
 *
 * ## Why this exists rather than "review it carefully"
 *
 * Every rule below is a bug that actually shipped here, not a style preference:
 *
 *  - **Palette ink** — the mobile station's outcome tone was `emerald-700` /
 *    `amber-700` / `rose-700`, picked by measuring against a WHITE card. On the
 *    dark palette they measured 3.26 / 3.56 / 2.84:1, under the 4.5:1 floor.
 *    Since the outcome verb had been removed from the row, that ink was the
 *    entire pass/warn/fail signal — so the dark theme silently deleted the
 *    signal. `text-text-success|warning|danger` flip per theme; fixed steps
 *    cannot.
 *
 *  - **Prose labels in data** — tape entries carried
 *    `meta: [{ label: 'Order', value }]`, which hard-codes an English word into
 *    the model and then prints it next to a number that already announces
 *    itself (`OrderIdChip` has a `#` glyph and a channel tint). Data carries
 *    values; components carry vocabulary.
 *
 *  - **Hand-written radii and sizes** — corners are a named token family
 *    (`cornerClass`, `MOBILE_SCAN_*`); a literal `rounded-2xl` is a corner that
 *    no longer moves when the family does.
 *
 *  - **Hex** — colour comes from semantic tokens only. A hex in a component is
 *    a colour that cannot answer to a theme.
 *
 * ## Scope
 *
 * The WRAPPER layer, deliberately. These are the components every other mobile
 * station clones, so a literal here propagates by design. Widen `SCANNED` as
 * more surfaces are ported; do not widen it to all of `src` in one step — a
 * gate that fails on day one gets switched off on day two.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();

/**
 * Files this gate owns — named individually, not by directory.
 *
 * A directory glob swept in two unrelated components that merely live nearby
 * (`MobilePackerSpamCamera`, `MobileSwipePhotoViewer`) and predate the rules.
 * Failing a PR on code it did not touch is how a gate gets switched off, so the
 * list is explicit and grows as surfaces are actually ported.
 */
const SCANNED = [
  'src/components/mobile/station/MobileStationShell.tsx',
  'src/components/mobile/station/MobileStationSheet.tsx',
  'src/components/mobile/station/MobileStationTapeItem.tsx',
  'src/components/mobile/station/MobileCaptureWindow.tsx',
  'src/components/mobile/station/station-chrome.ts',
  'src/components/mobile/station/station-tape.ts',
  'src/components/mobile/station/station-metrics.ts',
  'src/components/mobile/redesign/MobileScanOut.tsx',
  'src/components/mobile/redesign/mobile-scan-out-tape.ts',
  'src/components/mobile/redesign/useScanOutHistory.ts',
];

/**
 * Tailwind palette families that are raw steps rather than semantic tokens.
 * `text-text-*`, `text-white`, `bg-surface-*` etc. are tokens and pass.
 */
const PALETTE =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';

const RULES = [
  {
    id: 'palette-ink',
    /**
     * A DARK palette step used as text colour.
     *
     * 500–950 are steps chosen to sit on a light ground; on a dark theme they
     * fall under contrast. Light steps (50–400) are allowed because in this
     * codebase they appear only on a scrim or a photo overlay, where the ground
     * is dark by construction and a token would be wrong.
     */
    re: new RegExp(`\\btext-(?:${PALETTE})-(?:500|600|700|800|900|950)\\b`),
    say: 'raw palette ink — use text-text-success | -warning | -danger | -muted (they flip per theme; a fixed step does not)',
  },
  {
    id: 'hex-color',
    re: /#[0-9a-fA-F]{6}\b(?![^\n]*(?:\*|\/\/))/,
    say: 'hex colour — colour comes from semantic tokens only',
  },
  {
    id: 'prose-label-in-data',
    /**
     * A `{ label, value }` display pair — the shape that hard-codes a WORD next
     * to a value the component should already know how to name.
     *
     * Scoped to that pairing on purpose. A control's own `label` ("Undo
     * scan-out") is vocabulary a component legitimately owns; it is the
     * label-beside-a-value pattern that is the defect.
     */
    re: /\blabel:\s*['"][A-Z][a-z][^'"]*['"]\s*,\s*value\s*:/,
    say: "label/value display pair — pass a typed field and let a house chip carry the word",
  },
  {
    id: 'hand-written-radius',
    // `rounded-full` is the pill role and has no token indirection; corner
    // ROLES (rounded-md/lg/xl/2xl/3xl) must come from cornerClass or a named
    // constant. A per-corner arc (rounded-tl-2xl) is a drawing, not a role.
    re: /\brounded-(?:sm|md|lg|xl|2xl|3xl)\b/,
    say: "hand-written radius — use cornerClass('…') or a named corner constant from tokens/radius.ts",
  },
  {
    id: 'arbitrary-font-size',
    re: /\btext-\[[0-9]/,
    say: 'arbitrary font size — use a text-role-* utility',
  },
];

/** Lines carrying this marker are exempt, and must say why. */
const ALLOW = /ds-allow-literal:\s*\S/;

function walk(path) {
  const abs = join(ROOT, path);
  let st;
  try {
    st = statSync(abs);
  } catch {
    return [];
  }
  if (st.isFile()) return /\.(tsx?|jsx?)$/.test(abs) ? [abs] : [];
  return readdirSync(abs).flatMap((entry) => walk(join(path, entry)));
}

const files = SCANNED.flatMap(walk);
const findings = [];

for (const file of files) {
  // The gate does not police its own evidence.
  if (file.endsWith('check-hardcoded-design.mjs')) continue;
  const lines = readFileSync(file, 'utf8').split('\n');
  let inBlockComment = false;
  lines.forEach((line, i) => {
    // Rules describe RENDERED values, so prose about them in a docblock is not
    // a violation — this whole codebase explains its tokens in comments.
    const trimmedLine = line.trim();
    if (inBlockComment) {
      if (trimmedLine.includes('*/')) inBlockComment = false;
      return;
    }
    if (trimmedLine.startsWith('/*')) {
      if (!trimmedLine.includes('*/')) inBlockComment = true;
      return;
    }
    if (trimmedLine.startsWith('*') || trimmedLine.startsWith('//')) return;
    if (ALLOW.test(line)) return;

    for (const rule of RULES) {
      if (rule.re.test(line)) {
        findings.push({
          file: relative(ROOT, file),
          line: i + 1,
          id: rule.id,
          say: rule.say,
          text: trimmedLine.slice(0, 120),
        });
      }
    }
  });
}

if (findings.length === 0) {
  console.log(`✓ no hard-coded design values in ${files.length} wrapper files`);
  process.exit(0);
}

console.error(`\n✖ ${findings.length} hard-coded design value(s)\n`);
for (const f of findings) {
  console.error(`  ${f.file}:${f.line}  [${f.id}]`);
  console.error(`    ${f.text}`);
  console.error(`    → ${f.say}\n`);
}
console.error(
  'If one of these is genuinely correct, append `ds-allow-literal: <reason>` to the line.\n',
);
process.exit(1);
