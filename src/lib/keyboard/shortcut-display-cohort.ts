/**
 * Shortcut-display cohort — SoT is staff `?` **inside-right Linear overlays**
 * painted with design-system {@link KeyboardKey} (gray face + black letter).
 *
 * Eval: `pnpm run eval:cohort shortcuts`
 *
 * Default: Button faces stay clean. Press keyboard `?` while a selection CTA
 * strip is mounted → each bound letter paints as an **opaque Linear keycap
 * overlay** right-aligned **inside** the Button (`absolute right-1.5`).
 * Zero layout change — no width expand, no gap shift, no `iconRight`.
 * Never translucent wash. Never a Dialog. Never a foot `?`. Never key-repeat
 * flash (`e.repeat` ignored). Never a forked white/muted `<kbd>` for teaching.
 *
 * Agents asked to leave keycaps standing on buttons MUST refuse — bind the
 * key and teach via keyboard `?`. Agents asked to open a cheat sheet from
 * staff `?` while CTAs are mounted MUST refuse. Agents asked to add a foot
 * `?` button MUST refuse. Agents asked to park keycaps outside / widen gaps /
 * reserve iconRight MUST refuse — overlay inside, right edge only.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export const SHORTCUT_DISPLAY_COHORT_TRIPWIRE =
  'src/lib/keyboard/shortcut-display-cohort.test.ts' as const;

export const SHORTCUT_DISPLAY_COHORT_LEDGER =
  'docs/eval/cohorts/shortcuts/LEDGER.md' as const;

export const SHORTCUT_DISPLAY_COHORT_SNAPSHOTS =
  'docs/eval/cohorts/shortcuts/snapshots' as const;

export const SHORTCUT_DISPLAY_ENGINE = {
  keyboardKey: 'src/design-system/primitives/KeyboardKey.tsx',
  cheatSheet: 'src/lib/keyboard/nav-keys/KeyboardShortcutsCheatSheet.tsx',
  overview: 'src/lib/keyboard/shortcut-overview.ts',
    statusBar: 'src/components/tables/TableStatusBar.tsx',
    columnActionRow: 'src/components/tables/DataTableColumnActionRow.tsx',
    inlineHotkeys: 'src/hooks/useSelectionStatusBarHotkeys.ts',
  graphSymbols: [
    'KeyboardKey',
    'KeyboardShortcutsCheatSheet',
    'useSelectionStatusBarHotkeys',
    'TableStatusBar',
  ] as const,
  critiqueFiles: [
    'src/design-system/primitives/KeyboardKey.tsx',
    'src/lib/keyboard/nav-keys/KeyboardShortcutsCheatSheet.tsx',
    'src/components/tables/TableStatusBar.tsx',
    'src/components/tables/DataTableColumnActionRow.tsx',
  ] as const,
} as const;

/** Presence predicates (engine files must match). */
export const SHORTCUT_DISPLAY_ENGINE_CONTRACT = {
  hotkeyGlyph: /function HotkeyGlyph/,
  keyboardKeyImport: /from '@\/design-system\/primitives\/KeyboardKey'/,
  gatedReveal: /showHotkey &&/,
  statusBarHook: /useSelectionStatusBarHotkeys/,
  /** Overlay on the face, right-aligned — zero layout shift. */
  insideRightOverlay: /absolute right-1\.5/,
  actionWrap: /data-testid="data-table-selection-action-wrap"/,
  /** Face paint lives ONLY on KeyboardKey — gray bg, black letter. */
  opaqueKeycap: /bg-surface-sunken/,
  softKeyRim: /ring-1 ring-inset ring-border-hairline/,
  blackLetter: /text-text-default/,
  keyElevation: /elevationClass\('raised', 'soft'\)/,
  squaredKeycap: /SEGMENTED_CONTROL_FACE_CORNER/,
  hotkeyCapTestId: /data-testid="data-table-selection-hotkey-cap"/,
  ignoreKeyRepeat: /e\.repeat/,
  cheatSheetYields: /isSelectionInlineHotkeySurfaceActive/,
  hookToggle: /export function toggleSelectionInlineHotkeys/,
} as const;

/** Absence predicates — standing chrome / sheet / foot `?` / layout-shifting park. */
export const SHORTCUT_DISPLAY_FORBIDDEN = {
  hotkeyPopover: /function HotkeyPopoverLabel/,
  staffQuestionOpensSheet: /toggleShortcutOverview/,
  footQuestionButton: /data-testid="data-table-selection-hotkey-hints"/,
  translucentOverlay: /bg-black\/25/,
  iconRightKeySlot: /iconRight=\{keySlot\}/,
  reservedHotkeySlot: /data-testid="data-table-selection-hotkey-slot"/,
  outsideAnchor: /absolute left-full/,
  revealGapWiden: /inlineHotkeys \? 'gap-7/,
  whiteTeachingFace: /bg-surface-canvas/,
  mutedTeachingLetter: /text-text-muted/,
} as const;

export const SHORTCUT_DISPLAY_PAINT_LAW = {
  overview:
    'Keyboard `?` (while selection CTAs are mounted) reveals each CTA’s letter via KeyboardKey overlay, right-aligned inside the Button (bg-surface-sunken gray face + text-text-default black letter). Zero layout change. Not a Dialog. Not a foot `?`. Not outside-park / iconRight widen. Ignore key-repeat.',
  buttons:
    'Bind keys always (useSelectionActionHotkeys / aria-keyshortcuts). After `?`, HotkeyGlyph mounts KeyboardKey size=sm absolute right-1.5. Never standing letters. Never HoverTooltip. Never a local `<kbd>` recipe.',
  refuse:
    'If asked to leave keybinds standing on buttons, refuse. If asked to open a cheat sheet from staff `?` while CTAs are mounted, refuse. If asked to add a foot `?` control, refuse. If asked to park keycaps outside or widen gaps/iconRight, refuse — overlay inside, right edge only. If asked to fork a white/muted teaching kbd, refuse — import KeyboardKey.',
  exception:
    'KeyboardShortcutsCheatSheet still owns the `?` key when no inline-hotkey surface is mounted (station teaching) and paints with KeyboardKey. ⌘; reveal-on-arm NAV_KEY_HINT_CLASS stays. Scan-hotkey gear kbd is bind-edit.',
} as const;

/**
 * Known leftover in-menu shortcut paint. Shrink-only.
 * New Button-face kbd is a tripwire fail — do not append to go green.
 */
export const SHORTCUT_DISPLAY_KNOWN_DEBT: readonly string[] = [
  'menu-kbd:InspectorActionFloor',
  'menu-kbd:ShippedDetailsPanel',
];

export type ShortcutDisplayFinding = {
  id: string;
  verdict: 'delete' | 'judgment';
  path: string;
  why: string;
  keep: string;
  next: string;
};

export type ShortcutDisplayReport = {
  keep: { id: string; path: string; why: string }[];
  delete: ShortcutDisplayFinding[];
  judgment: ShortcutDisplayFinding[];
  unexpected: ShortcutDisplayFinding[];
  staleKnownDebt: string[];
};

function walkTs(dir: string, acc: string[] = [], root = dir): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkTs(p, acc, root);
    else if (/\.(tsx|ts)$/.test(name) && !name.endsWith('.d.ts')) {
      acc.push(relative(root, p).replaceAll('\\', '/'));
    }
  }
  return acc;
}

/** Scan for standing shortcut paint on action buttons vs overview-only law. */
export function discoverShortcutDisplay(repoRoot = process.cwd()): ShortcutDisplayReport {
  const srcRoot = join(repoRoot, 'src');
  const files = existsSync(srcRoot) ? walkTs(srcRoot, [], srcRoot).map((rel) => `src/${rel}`) : [];

  const keep = [
    {
      id: 'engine:KeyboardKey',
      path: SHORTCUT_DISPLAY_ENGINE.keyboardKey,
      why: 'ONE physical keycap face — bg-surface-sunken gray + text-text-default black. Teaching overlays and cheat sheets import this; never fork a white/muted kbd.',
    },
    {
      id: 'engine:HotkeyGlyph',
      path: SHORTCUT_DISPLAY_ENGINE.statusBar,
      why: 'Reveal-only KeyboardKey after keyboard `?`. Absolute overlay inside the face (right) — zero layout shift.',
    },
    {
      id: 'engine:DataTableColumnActionRow',
      path: SHORTCUT_DISPLAY_ENGINE.columnActionRow,
      why: 'Icon-only column-aligned selection foot. Same HotkeyGlyph overlay law as TableStatusBar.',
    },
    {
      id: 'engine:useSelectionStatusBarHotkeys',
      path: SHORTCUT_DISPLAY_ENGINE.inlineHotkeys,
      why: 'ONE hook: bind letters + `?` reveal store. TableStatusBar and the cheat sheet both read it.',
    },
    {
      id: 'engine:useSelectionActionHotkeys',
      path: 'src/hooks/useSelectionActionHotkeys.ts',
      why: 'Re-export seam onto useSelectionStatusBarHotkeys — keep until stale importers die.',
    },
    {
      id: 'engine:KeyboardShortcutsCheatSheet',
      path: SHORTCUT_DISPLAY_ENGINE.cheatSheet,
      why: '`?` key when no CTA strip is mounted (station teaching). Must yield to trailing keycap reveal while the strip exists. Paints with KeyboardKey.',
    },
    {
      id: 'exception:NAV_KEY_HINT_CLASS',
      path: 'src/lib/keyboard/nav-keys/nav-key-face.ts',
      why: '⌘; reveal-on-arm only. Not a standing button keycap.',
    },
    {
      id: 'exception:ScanHotkeyControl',
      path: 'src/components/scan/ScanHotkeyControl.tsx',
      why: 'Bind-edit UI for the scan chord — not a verb-face keycap.',
    },
  ];

  const findings: ShortcutDisplayFinding[] = [];

  for (const rel of files) {
    if (rel.includes('.test.')) continue;
    const src = readFileSync(join(repoRoot, rel), 'utf8');

    if (rel.endsWith('TableStatusBar.tsx') && /toggleShortcutOverview/.test(src)) {
      findings.push({
        id: 'sheet:TableStatusBar:staff-question',
        verdict: 'delete',
        path: rel,
        why: 'The status bar opens KeyboardShortcutsCheatSheet. Law: keyboard `?` reveals overlay keycaps on the CTAs.',
        keep: 'HotkeyGlyph gated by showHotkey; cheat sheet yields via isSelectionInlineHotkeySurfaceActive',
        next: 'Do not call toggleShortcutOverview from the status bar.',
      });
    }

    if (
      rel.endsWith('TableStatusBar.tsx') &&
      /data-testid="data-table-selection-hotkey-hints"/.test(src)
    ) {
      findings.push({
        id: 'foot:TableStatusBar:question-button',
        verdict: 'delete',
        path: rel,
        why: 'Foot `?` button teaches hotkeys. Law: keyboard `?` only — no foot control.',
        keep: 'KeyboardShortcutsCheatSheet yield → toggleSelectionInlineHotkeys',
        next: 'Delete data-testid="data-table-selection-hotkey-hints" and any toggleHotkeys foot wiring.',
      });
    }

    if (rel.endsWith('TableStatusBar.tsx') && /function HotkeyPopoverLabel/.test(src)) {
      findings.push({
        id: 'button-face:TableStatusBar:HotkeyPopover',
        verdict: 'delete',
        path: rel,
        why: 'Hover popover teaches the key instead of keyboard `?` painting a Linear overlay.',
        keep: 'Absolute right-1.5 HotkeyGlyph sibling after `?`',
        next: 'Delete HotkeyPopoverLabel / HoverTooltip wrap. Gate glyphs with showHotkey.',
      });
    }

    if (rel.endsWith('TableStatusBar.tsx') && /bg-black\/25/.test(src)) {
      findings.push({
        id: 'overlay:TableStatusBar:translucent-absolute',
        verdict: 'delete',
        path: rel,
        why: 'Translucent keycap wash. Law: opaque Linear overlay inside the face.',
        keep: 'bg-surface-sunken KeyboardKey with absolute right-1.5',
        next: 'Import KeyboardKey (gray face + black letter); overlay right-aligned inside the Button.',
      });
    }

    if (
      rel.endsWith('TableStatusBar.tsx') &&
      (/iconRight=\{keySlot\}/.test(src) ||
        /data-testid="data-table-selection-hotkey-slot"/.test(src) ||
        /absolute left-full/.test(src) ||
        /inlineHotkeys \? 'gap-7/.test(src))
    ) {
      findings.push({
        id: 'layout:TableStatusBar:keycap-moves-layout',
        verdict: 'delete',
        path: rel,
        why: 'Keycap parks via iconRight / outside-anchor / gap widen — that moves layout. Law: overlay only.',
        keep: 'relative wrap + HotkeyGlyph absolute right-1.5 (inside)',
        next: 'Remove iconRight/left-full/gap-7; overlay on the face, right edge.',
      });
    }

    if (
      rel.endsWith('TableStatusBar.tsx') &&
      /function HotkeyGlyph/.test(src) &&
      !/absolute right-1\.5/.test(src)
    ) {
      findings.push({
        id: 'anchor:TableStatusBar:missing-inside-right-overlay',
        verdict: 'delete',
        path: rel,
        why: 'HotkeyGlyph is not an inside-right overlay.',
        keep: 'pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2',
        next: 'Wrap Button; position HotkeyGlyph inside the face on the right.',
      });
    }

    if (
      rel.endsWith('KeyboardShortcutsCheatSheet.tsx') &&
      !/isSelectionInlineHotkeySurfaceActive/.test(src)
    ) {
      findings.push({
        id: 'hijack:cheat-sheet:no-inline-yield',
        verdict: 'delete',
        path: rel,
        why: '`?` key does not yield to overlay glyphs while the CTA strip is mounted.',
        keep: 'KeyboardShortcutsCheatSheet for `?` when no CTA strip exists',
        next: 'If isSelectionInlineHotkeySurfaceActive(), return without opening the Dialog — useSelectionStatusBarHotkeys owns the toggle (do not stopPropagation or double-toggle).',
      });
    }

    if (
      rel.endsWith('DataTableColumnActionRow.tsx') &&
      /function HotkeyGlyph/.test(src) &&
      !/absolute right-1\.5/.test(src)
    ) {
      findings.push({
        id: 'anchor:DataTableColumnActionRow:missing-inside-right-overlay',
        verdict: 'delete',
        path: rel,
        why: 'HotkeyGlyph is not an inside-right overlay.',
        keep: 'pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2',
        next: 'Wrap IconButton; position HotkeyGlyph inside the face on the right.',
      });
    }

    if (
      rel.endsWith('TableStatusBar.tsx') &&
      /function HotkeyGlyph/.test(src) &&
      !/KeyboardKey/.test(src)
    ) {
      findings.push({
        id: 'sot:TableStatusBar:missing-KeyboardKey',
        verdict: 'delete',
        path: rel,
        why: 'HotkeyGlyph hand-rolls a keycap instead of mounting KeyboardKey.',
        keep: 'KeyboardKey from @/design-system/primitives/KeyboardKey',
        next: 'Replace local <kbd> with <KeyboardKey size="sm" …>.',
      });
    }

    if (
      rel.endsWith('KeyboardShortcutsCheatSheet.tsx') &&
      !/from '@\/design-system\/primitives\/KeyboardKey'/.test(src)
    ) {
      findings.push({
        id: 'sot:cheat-sheet:missing-KeyboardKey',
        verdict: 'delete',
        path: rel,
        why: 'Cheat sheet paints a forked KeyCap instead of KeyboardKey.',
        keep: 'KeyboardKey size=md',
        next: 'Delete local KeyCap; import KeyboardKey.',
      });
    }

    if (rel.endsWith('InspectorActionFloor.tsx') && /item\.shortcut/.test(src) && /<kbd/.test(src)) {
      findings.push({
        id: 'menu-kbd:InspectorActionFloor',
        verdict: 'judgment',
        path: rel,
        why: 'More-menu rows still paint ⌥+letter. Not a standing Button face; operator may fold into `?` later.',
        keep: 'InspectorActionFloor verbs and bindings',
        next: 'Human: keep menu trailing kbd or move those rows into registerShortcutOverviewGroup.',
      });
    }

    if (rel.endsWith('ShippedDetailsPanel.tsx') && /item\.shortcut/.test(src) && /<kbd/.test(src)) {
      findings.push({
        id: 'menu-kbd:ShippedDetailsPanel',
        verdict: 'judgment',
        path: rel,
        why: 'Shipped details menu still paints shortcut kbd on items.',
        keep: 'The menu verbs',
        next: 'Human: fold into `?` overview or leave as menu trailing hint.',
      });
    }
  }

  const known = new Set(SHORTCUT_DISPLAY_KNOWN_DEBT);
  const deleteF = findings.filter((f) => f.verdict === 'delete');
  const judgment = findings.filter((f) => f.verdict === 'judgment');
  const unexpected = findings.filter((f) => !known.has(f.id));
  const foundIds = new Set(findings.map((f) => f.id));
  const staleKnownDebt = SHORTCUT_DISPLAY_KNOWN_DEBT.filter((id) => !foundIds.has(id));

  return { keep, delete: deleteF, judgment, unexpected, staleKnownDebt };
}

export function nextShortcutDeleteGap(
  report: ShortcutDisplayReport,
): ShortcutDisplayFinding | null {
  return report.delete[0] ?? null;
}

export function formatShortcutDiscoverMarkdown(report: ShortcutDisplayReport): {
  keep: string;
  delete: string;
  judgment: string;
  next: string;
} {
  const keep = [
    `| id | path | keep because |`,
    `|---|---|---|`,
    ...report.keep.map((k) => `| \`${k.id}\` | \`${k.path}\` | ${k.why} |`),
  ].join('\n');

  const header = `| id | path | why | KEEP | next |\n|---|---|---|---|---|`;
  const row = (f: ShortcutDisplayFinding) =>
    `| \`${f.id}\` | \`${f.path}\` | ${f.why} | **${f.keep}** | ${f.next} |`;

  const deleteBlock =
    report.delete.length === 0
      ? '_No mechanical deletes. Keyboard `?` reveals inside-right Linear overlays; zero layout shift._'
      : [header, ...report.delete.map(row)].join('\n');

  const judgmentBlock =
    report.judgment.length === 0
      ? '_None._'
      : [header, ...report.judgment.map(row)].join('\n');

  const nxt = nextShortcutDeleteGap(report);
  const next = nxt
    ? `**Next mechanical gap:** \`${nxt.id}\`\n\n- Delete: \`${nxt.path}\`\n- Keep: ${nxt.keep}\n- Do: ${nxt.next}`
    : '_No unblocked mechanical deletes. Menu-row kbd is judgment._';

  return { keep, delete: deleteBlock, judgment: judgmentBlock, next };
}

export function assertShortcutKnownDebtRatchet(report: ShortcutDisplayReport): {
  ok: boolean;
  extra: string[];
  stale: string[];
} {
  return {
    ok: report.unexpected.length === 0 && report.staleKnownDebt.length === 0,
    extra: report.unexpected.map((f) => f.id),
    stale: report.staleKnownDebt,
  };
}

export type ShortcutDisplayEvalManifest = {
  id: 'shortcuts';
  label: string;
  ledger: string;
  snapshotsDir: string;
  critiqueFiles: readonly string[];
  graphSymbols: readonly string[];
  tripwires: readonly string[];
};

export function shortcutDisplayEvalManifest(): ShortcutDisplayEvalManifest {
  return {
    id: 'shortcuts',
    label: 'Staff `?` KeyboardKey inside-right overlay (gray face, black letter, zero layout shift)',
    ledger: SHORTCUT_DISPLAY_COHORT_LEDGER,
    snapshotsDir: SHORTCUT_DISPLAY_COHORT_SNAPSHOTS,
    critiqueFiles: SHORTCUT_DISPLAY_ENGINE.critiqueFiles,
    graphSymbols: SHORTCUT_DISPLAY_ENGINE.graphSymbols,
    tripwires: [
      SHORTCUT_DISPLAY_COHORT_TRIPWIRE,
      'src/hooks/useSelectionStatusBarHotkeys.test.ts',
    ],
  };
}
