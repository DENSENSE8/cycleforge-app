#!/usr/bin/env node
/**
 * Blocking CI gate for the mobile display law.
 *
 * The law itself is `src/lib/mobile/mobile-display-cohort.ts` — this script only
 * enforces it, and reads the cohort so the two cannot disagree. The rules come
 * from Apple's Human Interface Guidelines and WCAG 2.2, not from taste:
 *
 *   - Apple, "UI Design Dos and Don'ts": controls measure at least 44x44 pt.
 *     The HIG is explicit that this is the HIT REGION — the visible control may
 *     be smaller. Paint small, hit big.
 *   - Apple, same page: "Text should be at least 11 points so it's legible at a
 *     typical viewing distance without zooming."
 *   - WCAG 2.2 SC 2.5.8 (AA): 24x24 CSS px minimum target, with a spacing
 *     exception for undersized targets.
 *
 * Why a gate and not a review note: the bloat this prevents was produced BY a
 * rule — a 44px floor applied to the painted box because nothing in the repo
 * distinguished paint from hit area. A convention that lives only in prose gets
 * re-derived wrong by the next person in a hurry, including me.
 *
 * Run: node scripts/ci/check-mobile-display-law.mjs
 */

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

/** Read the law through tsx so the cohort module is the single source. */
function loadLaw() {
  const json = execFileSync(
    'node',
    [
      '--import',
      'tsx',
      '-e',
      `import { mobileDisplayEvalManifest, MOBILE_BANNED_TEXT_ROLES, MOBILE_BANNED_CONTROL_CLASSES, MOBILE_MAX_TYPE_ROLES_PER_FILE, MOBILE_DISPLAY_COHORT } from './src/lib/mobile/mobile-display-cohort.ts';
       process.stdout.write(JSON.stringify({
         manifest: mobileDisplayEvalManifest(),
         bannedText: MOBILE_BANNED_TEXT_ROLES,
         bannedControls: MOBILE_BANNED_CONTROL_CLASSES,
         maxRoles: MOBILE_MAX_TYPE_ROLES_PER_FILE,
         members: MOBILE_DISPLAY_COHORT,
       }));`,
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
  );
  return JSON.parse(json);
}

/** Comments describe the law; only rendered code violates it. */
function code(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line, i) => ({ line, n: i + 1 }))
    .filter(({ line }) => !line.trim().startsWith('//'));
}

const ALLOW = /ds-allow-literal:\s*\S/;

const law = loadLaw();
const findings = [];

for (const member of law.members) {
  for (const file of member.files) {
    const lines = code(readFileSync(file, 'utf8'));
    const roles = new Set();

    for (const { line, n } of lines) {
      if (ALLOW.test(line)) continue;

      for (const banned of law.bannedText) {
        if (line.includes(banned)) {
          findings.push({
            file,
            n,
            id: 'text-below-floor',
            say: `${banned} is 10px — under Apple's 11pt legibility floor. Use text-role-eyebrow.`,
          });
        }
      }
      for (const banned of law.bannedControls) {
        if (new RegExp(`["'\\s]${banned}[\\s"']`).test(line)) {
          findings.push({
            file,
            n,
            id: 'control-too-large',
            say: `${banned} paints 56px. The phone ladder is 28 / 36 / 44 — expand the HIT area with padding, not the paint.`,
          });
        }
      }
      if (/size=["']lg["']/.test(line)) {
        findings.push({
          file,
          n,
          id: 'control-too-large',
          say: 'size="lg" resolves to h-14 (56px) in mobile mode. Use size="sm" + an explicit min-h-11 hit area.',
        });
      }
      for (const role of line.match(/text-role-[a-z]+/g) ?? []) roles.add(role);
    }

    if (roles.size > law.maxRoles) {
      findings.push({
        file,
        n: 1,
        id: 'too-many-type-roles',
        say: `${roles.size} type roles (${[...roles].join(', ')}); the cap is ${law.maxRoles}. Hierarchy on a phone is weight and ground, not a third size.`,
      });
    }
  }
}

if (findings.length === 0) {
  console.log(
    `✓ mobile display law: ${law.manifest.files.length} files across ${law.members.length} surface(s) — ladder ${law.manifest.ladder.inline.paint}/${law.manifest.ladder.row.paint}/${law.manifest.ladder.cta.paint}, text floor ${law.manifest.minTextPx}px`,
  );
  process.exit(0);
}

console.error(`\n✖ ${findings.length} mobile display law violation(s)\n`);
for (const f of findings) {
  console.error(`  ${f.file}:${f.n}  [${f.id}]`);
  console.error(`    → ${f.say}\n`);
}
console.error('Law: src/lib/mobile/mobile-display-cohort.ts (Apple HIG + WCAG 2.2 SC 2.5.8)');
console.error('If an instance is genuinely correct, append `ds-allow-literal: <reason>` to the line.\n');
process.exit(1);
