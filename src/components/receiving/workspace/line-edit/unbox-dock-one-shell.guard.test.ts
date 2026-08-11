/**
 * Hard law (main Unbox): bottom dock is UnboxDockHost — flush floor instrument.
 * Band 1 = Active Step Studio only (trailing null). Dogfood Print·Receive lives
 * on `data-unbox-dogfood-print` above the host (Displays-independent).
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
  assert.match(panel, /StationTerminalDock/, 'Print · Receive still composed (dogfood strip)');
  assert.match(
    panel,
    /data-unbox-dogfood-print/,
    'dogfood Print · Receive strip mounts above UnboxDockHost',
  );
  assert.match(
    panel,
    /omitTopSeam=\{Boolean\(terminalVm\)\}/,
    'dogfood strip suppresses UnboxDockHost top hairline',
  );
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

test('Dogfood Print · Receive is above-dock; Band 1 trailing stays null', () => {
  const panel = src(LINE_EDIT);
  const code = codeOnly(LINE_EDIT);
  assert.match(
    panel,
    /trailing=\{null\}/,
    'Band 1 trailing suppressed — Print · Receive is not co-mounted with step studio',
  );
  assert.match(
    code,
    /data-unbox-dogfood-print[\s\S]{0,4000}embeddedTerminal/,
    'embedded terminal mounts inside the dogfood strip above UnboxDockHost',
  );
  assert.match(
    code,
    /data-unbox-dogfood-print[\s\S]{0,4000}UnboxDockNotesEntry/,
    'dogfood strip always hosts the label-note entry',
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
  assert.match(host, /omitTopSeam/, 'dogfood strip may suppress host top hairline');
  assert.match(
    host,
    /!omitTopSeam && STATION_COLUMN_FOOTER_SEAM_CLASS/,
    'top seam applies unless omitTopSeam (dogfood strip above)',
  );
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
  // Edge-to-edge: host bands must not invent horizontal gutters. Content pad
  // lives on SerialCard / wedge / pager controls (Host vs content pad).
  assert.doesNotMatch(
    code,
    /\bpx-\d+(?:\.\d+)?\b/,
    'UnboxDockHost bands stay edge-to-edge — no host px-* gutters',
  );
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
    'pb-56 pager token — dogfood strip + Host + under-row is taller than notes-only',
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

test('Under-dock pager is a quiet status-bar face — no amber armed track / pulse', () => {
  const pager = codeOnly(join(ROOT, 'line-edit/UnboxProcedurePager.tsx'));
  assert.doesNotMatch(
    pager,
    /data-procedure-pager-armed-track|data-procedure-pager-selection-pulse/,
    'Band 2 must not paint amber armed track or selection pulse under the step label',
  );
  assert.doesNotMatch(
    pager,
    /bg-amber-400|border-amber-400|selectionPulse/,
    'banned: orange/amber chrome on the current-step Band 2 face (noise, not needed)',
  );
  assert.doesNotMatch(
    pager,
    /AnimatePresence|useMotionTransition|framerTransition/,
    'pager is static status-bar chrome — no motion pulse on step change',
  );
});

test('Classify dock stays h-11 — never expandBand / never remount TriageClassifySection', () => {
  const stepDock = codeOnly(join(ROOT, 'line-edit/UnboxStepDock.tsx'));
  const classifyDock = codeOnly(
    join(ROOT, 'line-edit/steps/dock/ClassifyDockControl.tsx'),
  );
  const panel = codeOnly(LINE_EDIT);
  assert.doesNotMatch(
    stepDock,
    /\bgrowBand\b/,
    'UnboxStepDock must not grow Band 1 for classify',
  );
  assert.match(
    panel,
    /expandBand=\{false\}/,
    'LineEditPanel keeps UnboxDockHost expandBand off (classify is h-11)',
  );
  assert.doesNotMatch(
    classifyDock,
    /import[\s\S]*TriageClassifySection|<TriageClassifySection/,
  );
  assert.match(classifyDock, /h-11/, 'ClassifyDockControl is one fixed row');
  assert.match(classifyDock, /Continue|Classify in Displays/);
});

test('Dock always mounts left procedure waist (except serial / classify own the band)', () => {
  const stepDock = src(join(ROOT, 'line-edit/UnboxStepDock.tsx'));
  assert.match(stepDock, /UnboxDockScanEntry/, 'shared dock scan entry composed');
  assert.match(
    stepDock,
    /ownsBandAlone/,
    'serial · classify own Band 1 alone — photo keeps the left waist',
  );
  assert.doesNotMatch(
    stepDock,
    /UNBOX_PHOTO_FILL_KEYS/,
    'banned: photo fill keys that hid the waist',
  );
  const entry = src(join(ROOT, 'line-edit/UnboxDockScanEntry.tsx'));
  assert.match(entry, /data-unbox-dock-scan/, 'wedge owner marker');
  assert.match(
    entry,
    /UNBOX_PHOTO_STRIP_KEYS/,
    'photo Enter advances on the left waist',
  );
  assert.match(
    entry,
    /data-unbox-dock-scan-compact/,
    'compact collapse-strip twin marker',
  );
  assert.match(entry, /w-8/, 'compact waist matches parked-rail strip width');
  assert.match(entry, /ScanBandGlowHost/, 'focused glow matches collapse strip');
  assert.match(
    entry,
    /placeholder=""/,
    'no placeholder — glow + caret only',
  );
  assert.doesNotMatch(
    entry,
    /Enter to continue|Enter when ready/,
    'banned: wide Enter-cue placeholder on the compact waist',
  );
  assert.doesNotMatch(
    entry,
    /h-11 w-full min-w-0 flex-1/,
    'banned: flex-1 sunken field that steals Band 1 from step ACTION',
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

test('Under-dock pager: both chevrons always mount; label pad + leading do not clip', () => {
  const pager = codeOnly(join(ROOT, 'line-edit/UnboxProcedurePager.tsx'));
  assert.match(
    pager,
    /data-procedure-pager-prev/,
    'back chevron always present (disabled on first step)',
  );
  assert.match(
    pager,
    /data-procedure-pager-next/,
    'next chevron always present (disabled on last / settled)',
  );
  assert.doesNotMatch(
    pager,
    /if \(!prevStep\) return null/,
    'banned: hide back chevron on the first step',
  );
  assert.match(
    pager,
    /LABEL_FACE =[\s\S]*?\bpx-2\b/,
    'label left/right pad match (px-2 — not pl-only)',
  );
  assert.doesNotMatch(
    pager,
    /LABEL_FACE =[\s\S]*?\bpl-2\b/,
    'banned: pl-2 without matching right pad',
  );
  assert.match(
    pager,
    /LABEL_FACE =[\s\S]*?leading-tight/,
    'caption uses leading-tight — leading-none clips g/p/y in Shipping label',
  );
  assert.doesNotMatch(
    pager,
    /LABEL_FACE =[\s\S]*?leading-none/,
    'banned: leading-none on Band 2 step label',
  );
  const host = codeOnly(HOST);
  assert.doesNotMatch(
    host,
    /data-unbox-dock-progress[\s\S]{0,200}leading-none/,
    'Band 2 host must not force leading-none (clips pager descenders)',
  );
});

test('Notes always-on as a single h-11 top-row entry — flush Plus insert, not FileText toggle', () => {
  const notesPath = join(ROOT, 'line-edit/UnboxDockNotesEntry.tsx');
  const notes = src(notesPath);
  const code = codeOnly(notesPath);
  assert.match(notes, /h-11/, 'single top-row height');
  assert.match(notes, /NoteComposerInsertRail/, 'Plus insert rail');
  assert.match(notes, /trigger=["']dock["']/, 'flush dock Plus (quiet at rest · white on open)');
  assert.match(
    notes,
    /data-unbox-dock-notes-stamp[\s\S]{0,800}data-unbox-dock-notes-history/,
    'History (repeat previous notes) mounts immediately right of dock Plus',
  );
  assert.match(notes, /Repeat the previous line's notes/, 'History control mirrors LineNotesCard');
  assert.match(notes, /staff-stamp/, 'staff stamp insert action');
  assert.match(notes, /last-notes|Add last notes/, 'last-notes → label insert action');
  assert.match(notes, /ticket-subject|unit-price|product-title|sync-notes|serial/, 'full LineNotesCard insert set');
  assert.match(
    notes,
    /onPrimaryAction/,
    'Enter fires Print · Receive primary (chat Send) — blur still saves only',
  );
  assert.match(
    notes,
    /e\.key === ['"]Enter['"][\s\S]{0,500}onPrimaryAction/,
    'Enter key path calls onPrimaryAction after persist',
  );
  assert.doesNotMatch(code, /DenseComposeBodyBand|DenseComposeBodyTextarea/, 'no tall DenseCompose escalate');
  assert.doesNotMatch(code, /OmnichannelComposerDock/, 'no raised composer shell');
  assert.doesNotMatch(code, /FileText/, 'no FileText notes toggle in the entry');
  const panelCode = codeOnly(LINE_EDIT);
  assert.match(
    panelCode,
    /data-unbox-dogfood-print[\s\S]{0,2500}UnboxDockNotesEntry/,
    'notes entry always mounts on the dogfood top row',
  );
  assert.match(
    panelCode,
    /UnboxDockNotesEntry[\s\S]{0,2500}onPrimaryAction=\{[\s\S]{0,400}handlePrintAndReceive/,
    'dogfood notes Enter wires the Print · Receive primary',
  );
  assert.match(
    panelCode,
    /primaryActionDisabled=\{Boolean\(terminalVm\?\.disabled\)\}/,
    'Enter respects the same disabled gate as the Print · Receive CTA',
  );
  assert.doesNotMatch(
    panelCode,
    /data-unbox-notes-toggle/,
    'FileText notes toggle removed — entry is always open',
  );
  assert.match(
    panelCode,
    /mode=["']entry["']/,
    'UnboxDockHost stays entry — notes never grow Band 1 / hide Band 2',
  );
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

test('Band 1 is the full-width per-step control — always-on notes on dogfood strip, no empty flex-1 sibling', () => {
  const panel = src(LINE_EDIT);
  const panelCode = codeOnly(LINE_EDIT);
  // Band 1 host keeps showNotesToggle off — always-on UnboxDockNotesEntry
  // sits left of compact Print · Receive on the dogfood top row.
  assert.match(
    panel,
    /showNotesToggle=\{false\}/,
    'Band 1 host has no notes toggle (always-on entry is on data-unbox-dogfood-print)',
  );
  assert.match(
    panelCode,
    /UnboxDockNotesEntry[\s\S]{0,2500}data-unbox-dock-terminal/,
    'dogfood strip = always-on notes entry immediately left of Print · Receive',
  );
  const stepDock = src(join(ROOT, 'line-edit/UnboxStepDock.tsx'));
  // An actionless step must not render an empty flex-1 sibling beside the wedge.
  assert.doesNotMatch(
    stepDock,
    /empty-\$\{activeKey\}/,
    'no empty flex-1 placeholder — the wedge fills Band 1 for actionless steps',
  );
  // Step CTA is a full-height flex-1 flush segment. Photo steps keep the
  // left waist; strip is the right flex-1 sibling.
  assert.match(
    stepDock,
    /flex-1/,
    'step control fills remaining Band 1 width as a flush segment',
  );
  assert.doesNotMatch(
    stepDock,
    /showScanEntry \? 'shrink-0'/,
    'banned: content-sized shrink-0 step CTA (dead air next to the wedge)',
  );
  assert.match(
    stepDock,
    /gap-0/,
    'Band 1 host gap-0 — siblings abut, never gap air between wedge and CTA',
  );
  assert.match(
    stepDock,
    /ownsBandAlone/,
    'photo steps keep left waist — only serial/classify own the band alone',
  );
  assert.match(
    stepDock,
    /activeKey === 'serial' \|\|[\s\S]*activeKey === 'classify'/,
    'serial and classify fill Band 1 (wedge hidden)',
  );
});

/**
 * COUNTER-EXAMPLE (2026-08-09 operator screenshot) — NEVER regress.
 *
 * Bad UX: Band 2 painted a content-sized "SHIPPING LABEL" chip with chevron
 * padding + a floating progress spinner in dead white; Band 1 CTAs were soft
 * ghost chips with `gap-*` air. SoT = full-width flush segments, host gap-0 /
 * p-0, every button fills band height and abuts siblings.
 */
test('COUNTER-EXAMPLE ratchet: Unbox dock stays full-width flush — no chip / gap / soft pill debt', () => {
  const host = codeOnly(HOST);
  assert.doesNotMatch(
    host,
    /\bgap-[12](?:\.5)?\b/,
    'UnboxDockHost must not put gap-1/gap-2 air between Band segments',
  );
  assert.match(
    host,
    /data-unbox-dock-progress-cell/,
    'Band 2 progress is a named flush cell — not a floating IconButton in air',
  );
  assert.match(host, /gap-0/, 'host bands use gap-0');
  assert.match(
    host,
    /data-unbox-dock-progress[\s\S]*bg-surface-card/,
    'Band 2 paints white card floor (every step / phase)',
  );

  const pager = codeOnly(join(ROOT, 'line-edit/UnboxProcedurePager.tsx'));
  assert.doesNotMatch(
    pager,
    /max-w-\[14rem\]|max-w-\[12rem\]|max-w-56|max-w-48/,
    'pager must not cap as a content chip (dead Band 2 white)',
  );
  assert.match(
    pager,
    /w-full/,
    'pager fills the Band 2 left zone edge-to-edge',
  );
  assert.match(
    pager,
    /data-procedure-pager-cluster/,
    'label + chevrons are a left cluster — › sits just after the text',
  );
  assert.match(
    pager,
    /flex-1/,
    'remaining Band 2 width is an empty flex-1 spacer (progress owns the far right)',
  );
  assert.doesNotMatch(
    pager,
    /LABEL_FACE =\s*['"`][^'"`]*flex-1/,
    'banned: label flex-1 that pushes › to the far right of Band 2',
  );
  assert.match(
    pager,
    /justify-start/,
    'Band 2 step text is LEFT-aligned on every step — never justify-center',
  );
  assert.match(
    pager,
    /LABEL_FACE =[\s\S]*?justify-start/,
    'LABEL_FACE pins left alignment for every procedure step',
  );
  assert.doesNotMatch(
    pager,
    /LABEL_FACE =[\s\S]*?justify-center/,
    'banned: centered Band 2 step label (dead white left of Label photo)',
  );
  assert.doesNotMatch(
    pager,
    /LABEL_FACE =\s*['"`][^'"`]*\buppercase\b/,
    'Band 2 step labels are sentence case — never CSS uppercase',
  );
  assert.doesNotMatch(
    pager,
    /w-8 shrink-0["'`]\s*aria-hidden|aria-hidden[\s\S]{0,40}w-8 shrink-0/,
    'banned: empty chevron spacer that pushes the step label off the left edge',
  );
  assert.match(
    pager,
    /bg-surface-card/,
    'pager paints white card floor on every step / phase',
  );

  const strip = codeOnly(
    join(ROOT, 'line-edit/steps/dock/PhotoStepDockStrip.tsx'),
  );
  assert.match(
    strip,
    /data-unbox-photo-step-dock/,
    'shared photo Band 1 strip marker',
  );
  assert.match(
    strip,
    /data-unbox-photo-thirds/,
    'strip paints three equal thirds marker (never a 2-button twin)',
  );
  assert.match(
    strip,
    /hostMarker/,
    'arrival · carton · item pass a hostMarker (not a silent 2-button fork)',
  );
  assert.match(
    strip,
    /STATION_CONTEXT_PHOTO_TONE/,
    'Send to phone composes Photos chrome tone SoT — never a forked blue twin',
  );
  assert.match(
    strip,
    /PHOTO_STEP_PHONE_FACE = `border /,
    'phone third includes border — tone color alone does not paint (washed card)',
  );
  assert.match(
    strip,
    /icon=\{<Camera /,
    'Send to phone uses SoT Camera — same glyph as ReceivingPhotoButton / chrome Photos',
  );
  assert.doesNotMatch(
    strip,
    /Smartphone/,
    'banned: phone glyph on Send to phone — chrome Photos is Camera',
  );
  assert.doesNotMatch(
    strip,
    /tone=["']sunken["']/,
    'banned: sunken gray Send to phone — must match Photos blue',
  );
  assert.match(
    strip,
    /UNBOX_PHOTO_STRIP_KEYS/,
    'photo strip keys mount the right Band 1 segment beside the waist',
  );
  assert.doesNotMatch(
    strip,
    /UNBOX_PHOTO_FILL_KEYS/,
    'banned: fill-keys rename — strip is not a full-band exclusive',
  );
  assert.match(
    strip,
    /flex h-11 min-w-0 flex-1/,
    'photo strip host is flex-1 right segment — not w-full alone',
  );
  assert.doesNotMatch(
    strip,
    /flex h-11 w-full min-w-0 items-stretch/,
    'banned: photo strip as full-band w-full (hides left waist)',
  );
  assert.match(strip, /Images/, 'strip has Link icon');
  assert.match(strip, /Upload/, 'strip has Upload icon');
  assert.match(strip, /Camera/, 'strip has Send to phone Camera icon (Photos SoT)');
  assert.match(
    strip,
    /flex-1/,
    'each photo third is flex-1 (equal width, justify-between floor)',
  );
  assert.doesNotMatch(
    strip,
    /\bgap-[12](?:\.5)?\b/,
    'photo strip host: no gap air between the three thirds',
  );

  const photo = codeOnly(
    join(ROOT, 'line-edit/steps/dock/CartonPhotoDockControl.tsx'),
  );
  assert.match(
    photo,
    /PhotoStepDockStrip/,
    'carton photo steps use the shared three-button strip',
  );
  assert.doesNotMatch(
    photo,
    /ReceivingPhotoButton/,
    'banned: icon-only camera cell — phone is a labeled third',
  );
  assert.doesNotMatch(
    photo,
    /\bgap-[12](?:\.5)?\b/,
    'carton dock: no gap air between Link / Upload / Send to phone',
  );

  const arrival = codeOnly(
    join(ROOT, 'line-edit/steps/dock/ArrivalPhotosDockControl.tsx'),
  );
  assert.match(
    arrival,
    /PhotoStepDockStrip/,
    'arrival_label_photo Band 1 uses Link | Upload | Send to phone',
  );
  assert.match(
    arrival,
    /stage: 'arrival_package'/,
    'arrival dock stamps door stage — never unbox_carton',
  );
  assert.match(
    arrival,
    /emitReceiving\('receiving-open-photo-link'/,
    'arrival Link opens the Photos → Link Displays leaf via event — never a popover',
  );
  assert.match(
    arrival,
    /cartonAspect:\s*aspect/,
    'arrival Link / upload are aspect-scoped to the active door step',
  );
  assert.doesNotMatch(
    arrival,
    /CartonPhotoPairPanel|<Popover\b/,
    'arrival Link is a rail drill, not a dock popover',
  );
  assert.doesNotMatch(
    arrival,
    /\bgap-[12](?:\.5)?\b/,
    'arrival dock: no gap air between the three thirds',
  );

  const item = codeOnly(
    join(ROOT, 'line-edit/steps/dock/ItemPhotoDockControl.tsx'),
  );
  assert.match(
    item,
    /ItemPhotoCaptureStrip/,
    'item_photos Band 1 uses shared ItemPhotoCaptureStrip (Link | Upload | Send)',
  );
  const itemStrip = codeOnly(
    join(ROOT, 'line-edit/ItemPhotoCaptureStrip.tsx'),
  );
  assert.match(
    itemStrip,
    /PhotoStepDockStrip/,
    'item strip paints Link | Upload | Send to phone',
  );
  assert.match(
    itemStrip,
    /stage: 'unbox_item'/,
    'item strip stamps unbox_item + line id',
  );
  assert.match(
    itemStrip,
    /emitReceiving\('receiving-open-photo-link'/,
    'item Link opens the Photos → Link Displays leaf via event — never a popover',
  );
  assert.doesNotMatch(
    itemStrip,
    /CartonPhotoPairPanel|<Popover\b/,
    'item Link is a rail drill, not an off-screen popover',
  );
  assert.doesNotMatch(
    itemStrip,
    /buildUnboxingCartonLibraryHref|router\.push/,
    'item Link must not navigate to media library',
  );

  const ack = codeOnly(
    join(ROOT, 'line-edit/steps/dock/AcknowledgeDockControl.tsx'),
  );
  assert.doesNotMatch(
    ack,
    /\bgap-[12](?:\.5)?\b/,
    'ack dock: no gap air around Contents match / Face is right',
  );
  assert.match(
    ack,
    /h-full w-full/,
    'ack CTA fills the Band 1 segment',
  );

  const slots = codeOnly(join(ROOT, 'line-edit/steps/dock/SlotDockControls.tsx'));
  assert.doesNotMatch(
    slots,
    /\bgap-[12](?:\.5)?\b/,
    'slot docks: no gap air (condition / item / serial)',
  );

  const notes = codeOnly(join(ROOT, 'line-edit/UnboxDockNotesEntry.tsx'));
  assert.doesNotMatch(
    notes,
    /justify-between gap-2 px-2/,
    'notes header must not wrap with host px-2 gap-2 (content pad on label only)',
  );

  const progress = src(join(ROOT, 'UnboxScanProgressControl.tsx'));
  assert.match(
    progress,
    /variant=["']floor["']/,
    'dock progress uses flush floor variant — not floating default IconButton',
  );

  const sliced = src(
    join(process.cwd(), 'src/design-system/primitives/SlicedActionDock.tsx'),
  );
  assert.match(
    sliced,
    /EMBEDDED_TRACK = 'rounded-none/,
    'embedded Print·Receive is flush-square ops chrome — not soft rounded-xl pill',
  );
  assert.doesNotMatch(
    sliced,
    /EMBEDDED_TRACK = 'rounded-xl/,
    'banned: soft embedded pill on station floors',
  );

  const tabs = src(join(ROOT, 'line-edit/terminal/unbox-tabs.tsx'));
  assert.match(
    tabs,
    /layout=["']barDistribute["']/,
    'condition dock grades distribute full width (no left-clump dead air)',
  );
  assert.doesNotMatch(
    tabs,
    /itemPhotoSlot=\{/,
    'item_photos dock is ItemPhotoDockControl strip — not a camera slot from tabs',
  );
});