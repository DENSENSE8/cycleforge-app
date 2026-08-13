/**
 * New feature components must declare `@domain-job` plus hardware justification.
 *
 * Existing files are parked in `domain-job-baseline.json`. A newly added
 * `.tsx` under `src/components` or `src/features` (excluding tests, cell
 * registries, and `*-grid/`) that lacks the tags fails — the author must
 * either compose the named SoT or write why the interaction contract forbids it.
 *
 * Template:
 *
 *   /**
 *    * @domain-job Handles inbound RMA triage at the scan bench.
 *    * @hardware-target Station (Scanner / Keyboard Wedge)
 *    * @density floor (Flush-square, high-density)
 *    * @justification Cannot reuse WorkbenchSheetView — focus cannot be lost
 *    *   to pointer clicks during the act-and-clear loop.
 *    * /
 *
 * Write: DOMAIN_JOB_WRITE=1 node --import tsx --test this-file
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = process.cwd();
const BASELINE = join(ROOT, 'src/lib/governance/domain-job-baseline.json');
const ROOTS = ['src/components', 'src/features'];

const SKIP =
  /\.(test|spec)\.(ts|tsx)$|\/(cells|__tests__|fixtures|stories)\/|\/[^/]*-grid\//;

const TAG = /@domain-job\s+\S/;
const TAG_SUBSTANCE = /@domain-job\s+\S[\s\S]{29,}/;
const HARDWARE_TAG = /@hardware-target\s+(Station|Workbench|Monitor|Canvas)\b/;
const DENSITY_TAG = /@density\s+(floor|ops|monitor|studio)\b/;
const JUSTIFICATION_TAG = /@justification\s+\S[\s\S]{19,}/;

const TEMPLATE =
  `  /**\n` +
  `   * @domain-job <what this assembly does>.\n` +
  `   * @hardware-target Station | Workbench | Monitor | Canvas\n` +
  `   * @density floor | ops | monitor | studio\n` +
  `   * @justification Cannot reuse <SoT> because <interaction-contract reason>.\n` +
  `   */`;

function walkTsx(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkTsx(p, out);
    else if (name.endsWith('.tsx')) out.push(p);
  }
  return out;
}

function featureTsx(): string[] {
  const files: string[] = [];
  for (const root of ROOTS) walkTsx(join(ROOT, root), files);
  return files
    .map((p) => relative(ROOT, p).replaceAll('\\', '/'))
    .filter((rel) => !SKIP.test(rel))
    .sort();
}

describe('@domain-job on new feature components', () => {
  const files = featureTsx();
  const baseline = JSON.parse(readFileSync(BASELINE, 'utf8')) as {
    files: string[];
  };
  const parked = new Set(baseline.files);

  function liveNew(): string[] {
    return files.filter((rel) => !parked.has(rel));
  }

  const missing = liveNew().filter((rel) => {
    const src = readFileSync(join(ROOT, rel), 'utf8');
    return !TAG.test(src);
  });

  const weak = liveNew().filter((rel) => {
    const src = readFileSync(join(ROOT, rel), 'utf8');
    return TAG.test(src) && !TAG_SUBSTANCE.test(src);
  });

  const missingHardware = liveNew().filter((rel) => {
    const src = readFileSync(join(ROOT, rel), 'utf8');
    return TAG.test(src) && !HARDWARE_TAG.test(src);
  });

  const missingDensity = liveNew().filter((rel) => {
    const src = readFileSync(join(ROOT, rel), 'utf8');
    return TAG.test(src) && !DENSITY_TAG.test(src);
  });

  const missingJustification = liveNew().filter((rel) => {
    const src = readFileSync(join(ROOT, rel), 'utf8');
    return TAG.test(src) && !JUSTIFICATION_TAG.test(src);
  });

  it('new files declare @domain-job', () => {
    assert.deepEqual(
      missing,
      [],
      `New feature component(s) missing @domain-job — compose the named SoT, or justify the different task:\n` +
        `${TEMPLATE}\n` +
        missing.map((f) => `  ${f}`).join('\n'),
    );
  });

  it('new @domain-job tags state a real job (≥30 chars)', () => {
    assert.deepEqual(
      weak,
      [],
      `Weak @domain-job — write the job and why an existing SoT cannot do it:\n  ${weak.join('\n  ')}`,
    );
  });

  it('new files declare @hardware-target (Station | Workbench | Monitor | Canvas)', () => {
    assert.deepEqual(
      missingHardware,
      [],
      `New assembly missing @hardware-target — name the interaction contract:\n${TEMPLATE}\n` +
        missingHardware.map((f) => `  ${f}`).join('\n'),
    );
  });

  it('new files declare @density (floor | ops | monitor | studio)', () => {
    assert.deepEqual(
      missingDensity,
      [],
      `New assembly missing @density — floor (scan bench) vs ops (desk) vs monitor vs studio:\n${TEMPLATE}\n` +
        missingDensity.map((f) => `  ${f}`).join('\n'),
    );
  });

  it('new files declare @justification (≥20 chars, why the named host cannot be reused)', () => {
    assert.deepEqual(
      missingJustification,
      [],
      `New assembly missing @justification — why StationScanPaneHost / WorkbenchSheetView / MonitorPageShell cannot do this job:\n${TEMPLATE}\n` +
        missingJustification.map((f) => `  ${f}`).join('\n'),
    );
  });

  it('baseline only shrinks (files that gained the tag, or were deleted)', () => {
    const liveParked = baseline.files.filter((rel) => {
      try {
        const src = readFileSync(join(ROOT, rel), 'utf8');
        return !TAG.test(src);
      } catch {
        return false;
      }
    });
    if (process.env.DOMAIN_JOB_WRITE === '1') {
      writeFileSync(
        BASELINE,
        `${JSON.stringify({ files: files.filter((rel) => !TAG.test(readFileSync(join(ROOT, rel), 'utf8'))) }, null, 2)}\n`,
      );
      return;
    }
    const extra = baseline.files.filter((f) => !liveParked.includes(f));
    assert.deepEqual(
      extra,
      [],
      `domain-job baseline can shrink — drop files that now have the tag (or were deleted):\n  ${extra.join('\n  ')}\n` +
        'Or re-run with DOMAIN_JOB_WRITE=1.',
    );
  });
});
