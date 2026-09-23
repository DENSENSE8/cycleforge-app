#!/usr/bin/env tsx
import { evaluateIndustrialTranslationMatrix } from '../src/lib/design-system/industrial-translation-law';

const verdict = evaluateIndustrialTranslationMatrix();
const json = process.argv.includes('--json');

if (json) {
  process.stdout.write(`${JSON.stringify(verdict, null, 2)}\n`);
} else if (verdict.ok) {
  console.log(
    `industrial-translation-guard: pass — ${verdict.mappedConceptCount}/${verdict.sourceConceptCount} pasted concepts mapped across ${verdict.rows} governed rows.`,
  );
  console.log(verdict.law);
} else {
  console.error('industrial-translation-guard: FAIL');
  for (const violation of verdict.violations) console.error(`  ${violation.id}: ${violation.why}`);
}

process.exit(verdict.ok ? 0 : 1);
