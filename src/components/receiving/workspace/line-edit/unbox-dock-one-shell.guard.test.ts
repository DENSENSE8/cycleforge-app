/**
 * Hard law (main Unbox): bottom dock is the raised Omnichannel notes bubble
 * (`WorkspaceNotesCard`) with trailing divided Print · Receive
 * (`StationTerminalDock` embedded + `embeddedChrome="pill"`). Ghost label-note
 * autocomplete stays on the bubble. Flush two-band procedure floor is parked
 * on `unbox-work` — see `docs/todo/unbox-dock-procedure-parked-HANDOFF.md`.
 *
 * Arrival still mounts `UnboxDockHost` — host geometry tests stay for that shared
 * floor instrument.
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
const LINE_NOTES = join(ROOT, 'line-edit/LineNotesCard.tsx');
const GHOST_HOOK = join(ROOT, 'line-edit/hooks/useLabelNoteGhostAutocomplete.ts');
const PHRASES = join(process.cwd(), 'src/lib/receiving/label-note-phrases.ts');
const TERMINAL = join(process.cwd(), 'src/components/station/terminal/StationTerminalDock.tsx');
const SLICED = join(process.cwd(), 'src/design-system/primitives/SlicedActionDock.tsx');

function src(path: string): string {
  return readFileSync(path, 'utf8');
}

/** Code-only — docblocks mention banned names as negatives. */
function codeOnly(path: string): string {
  return src(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

test('LineEditPanel mounts WorkspaceNotesCard bubble + pill Print · Receive', () => {
  const panel = src(LINE_EDIT);
  const code = codeOnly(LINE_EDIT);
  assert.match(panel, /WorkspaceNotesCard/, 'notes bubble is the float root');
  assert.match(panel, /chrome=["']raised["']/, 'raised Omnichannel shell');
  assert.match(panel, /StationTerminalDock/, 'Print · Receive composed');
  assert.match(code, /embeddedChrome=["']pill["']/, 'divided rounded pill in composer footer');
  assert.match(panel, /handlePrintAndReceive/, 'receive path unchanged');
  assert.match(panel, /data-unbox-dock-float/, 'float band marker');
  assert.match(panel, /slicedActionDockWrapperClass/, 'shared float gutters (bubble era)');
  assert.doesNotMatch(code, /data-unbox-dogfood-print/, 'no flush dogfood strip');
  assert.doesNotMatch(
    code,
    /dock=\{[\s\S]*?<UnboxDockHost/,
    'Unbox must not mount UnboxDockHost procedure floor',
  );
  assert.doesNotMatch(code, /buildUnboxStepDock|UnboxProcedurePager/, 'no Band 1/2 procedure chrome');
  assert.doesNotMatch(code, /UnboxDockNotesEntry/, 'ghost notes live in LineNotesCard bubble');
});

test('Enter on notes fires Print · Receive primary (chat Send)', () => {
  const panel = codeOnly(LINE_EDIT);
  assert.match(
    panel,
    /WorkspaceNotesCard[\s\S]{0,1200}onPrimaryAction=\{/,
    'bubble wires onPrimaryAction',
  );
  assert.match(
    panel,
    /onPrimaryAction=\{[\s\S]{0,500}handlePrintAndReceive/,
    'Enter → handlePrintAndReceive when not yet received',
  );
  assert.match(
    panel,
    /onPrimaryAction=\{[\s\S]{0,500}runPrintLabel/,
    'Enter → runPrintLabel when already received',
  );
});

test('ReceiveFeedbackRegion rides in the dock float stack above the bubble', () => {
  const panel = src(LINE_EDIT);
  assert.match(panel, /<ReceiveFeedbackRegion/, 'feedback region present');
  const floatIdx = panel.indexOf('data-unbox-dock-float');
  const feedbackIdx = panel.indexOf('<ReceiveFeedbackRegion');
  const notesIdx = panel.indexOf('<WorkspaceNotesCard');
  assert.ok(floatIdx >= 0 && feedbackIdx > floatIdx, 'feedback inside float');
  assert.ok(notesIdx > feedbackIdx, 'notes bubble below feedback in the stack');
});

test('Scroll clearance is notes-bubble height — not procedure pager', () => {
  const panel = codeOnly(LINE_EDIT);
  assert.match(panel, /reserveScrollClearance/, 'clears float');
  assert.doesNotMatch(
    panel,
    /reserveScrollClearance=["']pager["']/,
    'pager clearance retired with Band 2',
  );
});

test('LineEditPanel does not pin UnboxItemsPanel or ProcedureDeck in the centre', () => {
  const panel = codeOnly(LINE_EDIT);
  assert.doesNotMatch(panel, /UnboxItemsPanel/, 'no items panel twin in centre');
  assert.doesNotMatch(panel, /<ProcedureDeck[\s>]/, 'centre ProcedureDeck stays parked');
});

test('Ghost autocomplete is on the bubble path (LineNotesCard + phrase bank)', () => {
  const notes = src(LINE_NOTES);
  const hook = src(GHOST_HOOK);
  const phrases = src(PHRASES);
  assert.match(notes, /useLabelNoteGhostAutocomplete/, 'LineNotesCard mounts ghost hook');
  assert.match(notes, /ghostSuffix|onAcceptGhost/, 'ghost wired into OmnichannelComposerDock');
  assert.match(notes, /data-unbox-notes-recent/, 'recent (History) control always in footer');
  assert.match(notes, /recent-label-note|recentLabelNoteQueryKey/, 'Recent reads DB recent-label-note');
  assert.match(notes, /setRecentHover|recentHover/, 'Recent hover paints ghost preview');
  assert.doesNotMatch(
    notes,
    /last-applied-label-note|sessionStorage|localStorage/,
    'Recent must not use device-local storage',
  );
  assert.match(hook, /matchLabelNotePhrase/, 'hook uses phrase bank');
  assert.match(hook, /rememberLabelNotePhrase/, 'hook remembers on save');
  assert.match(phrases, /unbox:label-note-phrases/, 'device-local MRU key');
});

test('StationTerminalDock exposes embeddedChrome pill for composer footer', () => {
  const terminal = src(TERMINAL);
  const sliced = src(SLICED);
  assert.match(terminal, /embeddedChrome/, 'terminal forwards chrome mode');
  assert.match(sliced, /embeddedChrome/, 'SlicedActionDock owns pill vs flush');
  assert.match(sliced, /PILL_TRACK/, 'rounded pill track still defined');
});

test('Shared UnboxDockHost (Arrival) stays a flush two-band floor — no raised Panel', () => {
  const host = src(HOST);
  const code = codeOnly(HOST);
  assert.match(host, /w-full/, 'full-width plane');
  assert.match(host, /STATION_COLUMN_FOOTER_SEAM_CLASS/, 'floor top seam');
  assert.match(host, /bg-surface-card/, 'flush card plane');
  assert.doesNotMatch(code, /\bPanel\b/, 'no Panel identifier in code');
  assert.doesNotMatch(host, /radius=["']2xl["']/, 'no chat-island radius on host');
  assert.doesNotMatch(host, /elevation=["']raised["']/, 'no raised elevation on host');
  assert.match(host, /data-unbox-dock-progress/, 'Band 2 progress slot exists for Arrival');
});
