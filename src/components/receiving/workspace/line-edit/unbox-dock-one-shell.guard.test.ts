/**
 * Hard law (main Unbox): bottom dock is UnboxDockHost — flush floor instrument.
 * Active Step Studio XOR Resolution Terminal (Print·Receive only when settled).
 * Under-dock: step pager (left) · live progress ring (right). Never a page hop.
 * Centre stays PO-line ledger + label.
 *
 * Run: `node --require ./scripts/register-server-only-shim.cjs --import tsx \
 *        --test src/components/receiving/workspace/line-edit/unbox-dock-one-shell.guard.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(process.cwd(), 'src/components/receiving/workspace');
const LINE_EDIT = join(ROOT, 'LineEditPanel.tsx');
const HOST = join(ROOT, 'line-edit/UnboxDockHost.tsx');

function src(path: string): string {
  return readFileSync(path, 'utf8');
}

/** Code-only — docblocks mention banned names as negatives. */
function codeOnly(path: string): string {
  return src(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

test('LineEditPanel mounts UnboxDockHost — not bare WorkspaceNotesCard float', () => {
  const panel = src(LINE_EDIT);
  assert.match(panel, /UnboxDockHost/, 'dock uses UnboxDockHost');
  assert.match(panel, /UnboxStepDock|buildUnboxStepDock/, 'procedure step dock is wired');
  assert.match(
    panel,
    /UnboxProcedurePager/,
    'active step context sits under the floor (pager)',
  );
  assert.match(panel, /StationTerminalDock/, 'Print · Receive still composed for settle');
  assert.doesNotMatch(
    panel,
    /dock=\{[\s\S]*?<WorkspaceNotesCard/,
    'WorkspaceNotesCard must not be the float root (notes live inside UnboxDockHost)',
  );
  assert.match(
    panel,
    /data-unbox-dock-float/,
    'float band is Unbox-owned (safe-area only — no decorative bottom pad)',
  );
  assert.match(
    panel,
    /pb-\[env\(safe-area-inset-bottom/,
    'floor pad is safe-area only so the step row sits on the edge',
  );
  assert.doesNotMatch(
    panel,
    /data-unbox-dock-float[\s\S]{0,200}px-4|data-unbox-dock-float[\s\S]{0,200}sm:px-6/,
    'float must not use horizontal island gutters',
  );
});

test('StationTerminalDock mounts only on settle (!activeKey) — stays in-station', () => {
  const panel = src(LINE_EDIT);
  assert.match(
    panel,
    /trailing=\{!activeKey \? embeddedTerminal : null\}/,
    'Print · Receive unmounts during active capture; remounts on settle (incl. Print label)',
  );
  assert.doesNotMatch(
    panel,
    /UnboxProcedureCompleteStudio|Move to Labels|router\.push\(['"]\/shipping\/labels/,
    'dock must never route the operator to another page',
  );
});

test('UnboxDockHost is a full-width two-band flush floor — no raised Panel', () => {
  const host = src(HOST);
  const code = codeOnly(HOST);
  assert.match(host, /w-full/, 'full-width plane (inset-x-0 alone is not enough in-flow)');
  assert.match(host, /STATION_COLUMN_FOOTER_SEAM_CLASS/, 'floor top seam = column footer SoT');
  assert.match(host, /bg-surface-card/, 'flush card plane');
  assert.doesNotMatch(code, /\bPanel\b/, 'no Panel identifier in code (import or JSX)');
  assert.doesNotMatch(code, /<Panel[\s>]/, 'no outer Panel wrapper');
  assert.doesNotMatch(host, /radius=["']2xl["']/, 'no chat-island radius');
  assert.doesNotMatch(host, /elevation=["']raised["']/, 'no raised elevation');
  assert.match(host, /data-unbox-dock-progress/, 'under-dock row marker');
  assert.match(
    host,
    /STATION_COLUMN_FOOTER_BAND_FACE[\s\S]*data-unbox-dock-progress/,
    'Band 2 uses shared h-8 footer band SoT (aligned with Displays →| / rail filter)',
  );
  assert.match(host, /stepContext:/, 'step context prop required (bottom-left)');
  assert.match(host, /progress:/, 'progress ring prop required (bottom-right)');
});

test('LineEditPanel mounts under-dock step pager left + progress ring right', () => {
  const panel = src(LINE_EDIT);
  assert.match(
    panel,
    /stepContext=\{<UnboxProcedurePager/,
    'bottom-left step face + prev/next for exact step change',
  );
  assert.match(
    panel,
    /progress=\{scanProgressControl\}/,
    'bottom-right live procedure % ring',
  );
  assert.match(panel, /UnboxScanProgressControl/, 'Unbox adapter derives live done/total');
  assert.doesNotMatch(
    panel,
    /rightSlot=\{scanProgressControl\}/,
    'ring must not mount on Displays rightSlot',
  );
});

test('LineEditPanel does not pin UnboxItemsPanel or ProcedureDeck in the centre', () => {
  const panel = src(LINE_EDIT);
  assert.doesNotMatch(panel, /UnboxItemsPanel/, 'items pin stays parked with the deck');
  assert.doesNotMatch(panel, /UnboxProcedureDeck/, 'centre ProcedureDeck stays parked');
  assert.match(panel, /buildUnboxOverview/, 'centre comes from buildUnboxOverview');
});

test('ReceiveFeedbackRegion rides in the dock float stack above UnboxDockHost', () => {
  const panel = src(LINE_EDIT);
  assert.match(
    panel,
    /data-unbox-dock-float[\s\S]*ReceiveFeedbackRegion[\s\S]*UnboxDockHost/,
    'confirmation must paint above the UnboxDockHost shell in the absolute float',
  );
  assert.doesNotMatch(
    panel,
    /footer=\{[\s\S]*ReceiveFeedbackRegion/,
    'in-flow footer would sit under the absolute z-fab dock',
  );
});

test('Host+under-dock reserves pager clearance so the floor clears the float', () => {
  const panel = src(LINE_EDIT);
  assert.match(
    panel,
    /reserveScrollClearance=["']pager["']/,
    'pb-48 pager token — Host + under-row is taller than notes-only',
  );
});

test('Dock condition pills stamp via /condition SoT — not generic grade PATCH', () => {
  const tabs = src(join(ROOT, 'line-edit/terminal/unbox-tabs.tsx'));
  assert.match(
    tabs,
    /patchReceivingLineCondition/,
    'buildUnboxStepDock must share the /condition writer with the ledger',
  );
  const setCond = tabs.indexOf('const setCondition = ');
  assert.ok(setCond >= 0, 'setCondition helper composed in buildUnboxStepDock');
  const helperChunk = tabs.slice(setCond, setCond + 350);
  assert.match(
    helperChunk,
    /patchReceivingLineCondition\(row\.id/,
    'setCondition stamps condition_graded_at via /condition',
  );
  assert.match(
    tabs,
    /onChange=\{setCondition\}/,
    'ConditionPills onChange uses the shared stamp helper',
  );
  assert.match(
    tabs,
    /onSetCondition=\{setCondition\}/,
    'dock keyboard entry shares the same grade writer',
  );
  assert.doesNotMatch(
    helperChunk,
    /void\s+c\.patch\(/,
    'generic controller patch must not write the Condition gate from the dock',
  );
});

test('Under-dock pager surfaces qualitative step summary — not N of M counts', () => {
  const pager = src(join(ROOT, 'line-edit/UnboxProcedurePager.tsx'));
  assert.match(
    pager,
    /data-procedure-pager-summary/,
    'summary rides beside the active step label',
  );
  const steps = src(join(ROOT, 'line-edit/useUnboxProcedureSteps.ts'));
  assert.doesNotMatch(
    steps,
    /\$\{filled\} of \$\{/,
    'serial summary must not paint N of M vanity counts on the action floor',
  );
});

test('Under-dock pager paints selection pulse + armed track on activeKey', () => {
  const pager = src(join(ROOT, 'line-edit/UnboxProcedurePager.tsx'));
  assert.match(
    pager,
    /data-procedure-pager-selection-pulse/,
    'boxed selection pulse on step change',
  );
  assert.match(
    pager,
    /data-procedure-pager-armed-track/,
    'amber bottom track on the active step face',
  );
  assert.match(
    pager,
    /framerTransition\.selectionPulse/,
    'pulse uses Displays selectionPulse SoT — not a page-local twin',
  );
});

test('Dock always mounts keyboard entry (except serial / classify own the band)', () => {
  const stepDock = src(join(ROOT, 'line-edit/UnboxStepDock.tsx'));
  assert.match(stepDock, /UnboxDockScanEntry/, 'shared dock scan entry composed');
  assert.match(
    stepDock,
    /fillsBand|activeKey === 'serial' \|\| activeKey === 'classify'/,
    'serial and classify do not dual-mount the shared wedge',
  );
  const entry = src(join(ROOT, 'line-edit/UnboxDockScanEntry.tsx'));
  assert.match(entry, /data-unbox-dock-scan/, 'wedge owner marker');
  assert.match(
    entry,
    /w-full min-w-0 flex-1/,
    'wedge fills the flush step row — never a content-sized chip',
  );
  assert.doesNotMatch(
    entry,
    /max-w-44|w-30/,
    'chip width caps are banned on the floor wedge',
  );
  const serial = src(join(ROOT, 'line-edit/steps/dock/SlotDockControls.tsx'));
  assert.match(
    serial,
    /data-unbox-dock-scan/,
    'serial dock also claims the generalized wedge owner',
  );
  assert.match(
    serial,
    /min-w-\[80%\]/,
    'serial wedge consumes ≥80% of the floor band',
  );
});

test('Under-dock pager always paints a face — never returns null and collapses the floor', () => {
  const pager = src(join(ROOT, 'line-edit/UnboxProcedurePager.tsx'));
  assert.doesNotMatch(
    pager,
    /if \(!active\) return null/,
    'settled/loading must keep the left step face mounted',
  );
  assert.match(pager, /Complete/, 'settled face names Complete');
});

test('Notes escalate via DenseComposeFields — not a raised chat card', () => {
  const notesPath = join(ROOT, 'line-edit/UnboxDockNotesEntry.tsx');
  const notes = src(notesPath);
  const code = codeOnly(notesPath);
  assert.match(notes, /DenseComposeBodyBand/, 'sunken DenseCompose body');
  assert.match(notes, /DenseComposeBodyTextarea/, 'edge-to-edge textarea');
  assert.doesNotMatch(code, /OmnichannelComposerDock/, 'no raised composer shell');
  assert.doesNotMatch(code, /rounded-lg border/, 'no nested raised card face');
});

test('Checklist highlight follows activeKey (focus override), not derived state alone', () => {
  const checklist = src(join(ROOT, 'line-edit/UnboxProcedureChecklist.tsx'));
  assert.match(
    checklist,
    /activeKey=\{activeKey\}/,
    'Unbox checklist passes shared pointer into ProcedureChecklist',
  );
  const ds = readFileSync(
    join(process.cwd(), 'src/design-system/components/procedure/ProcedureChecklist.tsx'),
    'utf8',
  );
  assert.match(ds, /activeKey\?:/, 'DS checklist accepts activeKey');
  assert.match(
    ds,
    /data-procedure-selected/,
    'selected face is marked for probes',
  );
});

test('Under-dock progress control is the honest procedure metric — derived + opens the Checklist leaf, no route hop', () => {
  const ring = src(join(ROOT, 'UnboxScanProgressControl.tsx'));
  // The floor's ONE metric is the LIVE procedure %, derived from the shared step
  // hook — never a hardcoded / vanity number (source-of-truth.md → Unbox centre).
  assert.match(
    ring,
    /useUnboxProcedureSteps/,
    'procedure % derives from the shared step hook (live, honest)',
  );
  assert.match(
    ring,
    /onOpenChecklist/,
    'the ring opens the Checklist Displays leaf (in-station)',
  );
  // In-station only — a metric that navigates off /unbox is a route hop.
  assert.doesNotMatch(
    ring,
    /router\.push|useRouter|\/shipping\/labels|href=/,
    'the ring never routes off /unbox — it opens the checklist in place',
  );
});

test('Band 1 is the full-width per-step control — no notes toggle, no empty flex-1 sibling', () => {
  const panel = src(LINE_EDIT);
  // Notes are OFF the Unbox floor — the dock surfaces no notes toggle. (`itemNote`
  // still live-drives the carton label center; that coupling is pinned by
  // label-note-grain / unbox-label-collapse. This only asserts the dock UI.)
  assert.match(
    panel,
    /showNotesToggle=\{false\}/,
    'the Unbox dock surfaces no notes toggle (notes off the floor)',
  );
  const stepDock = src(join(ROOT, 'line-edit/UnboxStepDock.tsx'));
  // An actionless step (arrival_check) must not render an empty flex-1
  // sibling beside the wedge — two flex-1 children split Band 1 in half.
  assert.doesNotMatch(
    stepDock,
    /empty-\$\{activeKey\}/,
    'no empty flex-1 placeholder — the wedge fills Band 1 for actionless steps',
  );
  // When a step control coexists with the wedge it TRAILS content-sized; the
  // wedge fills Band 1 (full-width top). Serial / classify hide the wedge, so they fill.
  assert.match(
    stepDock,
    /showScanEntry \? 'shrink-0' : 'flex-1'/,
    'step control trails the wedge (shrink-0) — never a 50/50 split of Band 1',
  );
  assert.match(
    stepDock,
    /activeKey === 'serial' \|\| activeKey === 'classify'/,
    'serial and classify fill Band 1 (wedge hidden)',
  );
});
