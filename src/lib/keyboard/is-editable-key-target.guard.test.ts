/**
 * Editable-key SoT — one helper; no local twins on Displays / desk Esc paths.
 *
 *   node --import tsx --test src/lib/keyboard/is-editable-key-target.guard.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

const read = (rel: string) =>
  stripComments(readFileSync(join(process.cwd(), rel), 'utf8'));

/** Call sites that must import the shared predicate (not redefine it). */
const MUST_IMPORT = [
  'src/components/station/displays/StationDisplaysPushStack.tsx',
  'src/components/station/displays/StationDisplaysCommandFooter.tsx',
  'src/components/station/displays/useArmedCursorList.ts',
  'src/components/station/displays/StationActionKeyLegend.tsx',
  'src/components/station/displays/StationActionDossierShell.tsx',
  'src/components/receiving/workspace/line-edit/useUnboxProcedureArrowKeys.ts',
  'src/hooks/useWedgeScanner.ts',
  'src/components/right-rail/DeskInspectorIndexShell.tsx',
  'src/components/dashboard/workbench-inspector-toggle.tsx',
  'src/components/receiving/history/HistoryCartonTriagePanel.tsx',
] as const;

describe('isEditableKeyTarget SoT', () => {
  it('exports the shared helper', () => {
    const src = read('src/lib/keyboard/is-editable-key-target.ts');
    assert.match(src, /export function isEditableKeyTarget/);
    assert.match(src, /export function isEditableActiveElement/);
  });

  for (const file of MUST_IMPORT) {
    it(`${file} imports isEditableKeyTarget — no local twin`, () => {
      const src = read(file);
      assert.match(
        src,
        /from ['"]@\/lib\/keyboard\/is-editable-key-target['"]/,
        `${file} must import the keyboard SoT`,
      );
      assert.doesNotMatch(
        src,
        /function isEditable(?:Key)?Target\s*\(/,
        `${file} must not redefine isEditableKeyTarget`,
      );
    });
  }
});
