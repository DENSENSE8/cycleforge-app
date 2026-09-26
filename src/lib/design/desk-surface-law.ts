/**
 * DESK SURFACE LAW — which surface a desktop job may use (operator 2026-09-25).
 *
 * The desktop sibling of the phone sheet law (`src/lib/mobile/mobile-sheet-roles.ts`).
 * One question per UI job, answered before it is built:
 *
 *   - a different job / the primary record of a job → its own page (navigate)
 *   - a picked row's record, or a multi-field form     → ONE record view, TWO views
 *     the staffer chooses (operator 2026-09-25):
 *       · default — in place of the fixed-width list (DeskStageOverlay fill="stage",
 *         Center Lock Q5, `TableRecordPlane` 'stage-overlay'), J/K steps, Esc back
 *       · fullscreen — split: list on the left for selection, the record on the
 *         right, drawn inside the desk stage by `DeskRecordPlane`
 *         (docs/handoff/HANDOFF-desk-surface-law-2026-09-25.md, Step 0)
 *   - one value / one choice on a cell                 → a Popover anchored to it
 *   - irreversible                                      → a confirm Dialog
 *   - org config that outlives the record (rules, roles) → a config page, with a
 *     one-line summary + pencil in the record
 *   - tools over the WHOLE table while it stays visible → a `supporting` rail
 *
 * Neither view is the legacy right rail (RightRailHost `detail:*` panels, a
 * hand-rolled evidence aside). Every desktop rail must be classified; the
 * legacy `record` rails are debt counted against a shrink-only baseline,
 * exactly like `MOBILE_RECORD_SHEET_BASELINE`.
 *
 * ## One module, three consumers
 *   1. `desk-surface-law.test.ts` — pure verdicts on planted sources.
 *   2. `scripts/desk-surface-guard.ts` — the `Desk surface` gate in `verify`
 *      (and so in CI, which runs `pnpm verify`).
 *   3. `src/design-system/pinned.json` — the `ds_contract` answer cites this file.
 *
 * ## Adding a rule (the base is built to grow)
 *   1. Append a {@link DeskSurfaceRule} to {@link DESK_SURFACE_RULES}: an id, the
 *      one-line law, the roles a classified file may take, which role is debt,
 *      a `scope` and a `detect` over comment-stripped source.
 *   2. Add its ledger + baseline in `desk-surface-ledger.ts` — every file the
 *      rule hits today, classified, so the gate lands green.
 *   3. Plant a violation in `desk-surface-law.test.ts`.
 *   Nothing else changes: the guard, the CI wiring and the report are generic.
 */

import { stripComments } from '../mobile/detail-hub-law';

export interface DeskSurfaceRule {
  readonly id: string;
  /** Printed with every violation — the rule in one sentence. */
  readonly law: string;
  /** The classifications a ledger entry may carry for this rule. */
  readonly roles: readonly string[];
  /** The role that is migration debt, counted against the shrink-only baseline. */
  readonly debtRole: string;
  /** Repo-relative POSIX path → does this rule read the file? */
  readonly scope: (file: string) => boolean;
  /** Character offsets of offending constructs in comment-stripped source. */
  readonly detect: (text: string) => number[];
}

export interface DeskSurfaceLedgerEntry {
  readonly role: string;
  /** Why this file holds this role — required for anything that is not debt. */
  readonly note?: string;
}

export type DeskSurfaceLedger = Readonly<Record<string, Readonly<Record<string, DeskSurfaceLedgerEntry>>>>;

export interface DeskSurfaceViolation {
  readonly rule: string;
  readonly file: string;
  readonly line: number;
  readonly detail: string;
}

export interface DeskSurfaceAudit {
  readonly violations: DeskSurfaceViolation[];
  /** Ledger / baseline drift — the ratchet talking, not a file. */
  readonly problems: string[];
  /** Per rule: debt entries now vs the baseline. */
  readonly debt: Readonly<Record<string, { count: number; baseline: number }>>;
}

const isDesktopSource = (file: string) =>
  file.startsWith('src/') &&
  !file.startsWith('src/components/mobile/') &&
  !file.startsWith('src/app/m/');

function offsets(text: string, pattern: RegExp): number[] {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  return [...text.matchAll(new RegExp(pattern.source, flags))].map((m) => m.index ?? 0);
}

/** Where rail registration is DEFINED (and this law, whose regexes name it) — not used. */
const RAIL_PRIMITIVE_HOMES = new Set([
  'src/components/right-rail/DetailStackRailRegistrar.tsx',
  'src/components/right-rail/useRegisterRightPanel.ts',
  'src/lib/design/desk-surface-law.ts',
]);

/** Desk table / ledger modules a search surface must not remount (operator 2026-09-25). */
export const DESK_TABLE_MODULES = [
  '@/components/tables/DataTable',
  '@/components/tables/useCompoundSpreadsheet',
  '@/components/outbound/orders/OutboundOrdersLedger',
  '@/components/outbound/orders/OrderRecordView',
] as const;

const DESK_TABLE_IMPORT = new RegExp(
  `from\\s+['"](?:${DESK_TABLE_MODULES.map((m) => m.replace(/[/.]/g, '\\$&')).join('|')})['"]`,
);

/** Where a record is ALLOWED to be placed by hand: the plane and the overlay it drives. */
const RECORD_PLANE_HOMES = new Set([
  'src/design-system/components/DeskRecordPlane.tsx',
  'src/design-system/components/DeskStageOverlay.tsx',
  'src/lib/design/desk-surface-law.ts',
]);

/**
 * Offsets of `<DeskStageOverlay … fill="stage" …>` openings. The tag is walked
 * to its real end — attributes hold `{…}` expressions of any depth (arrow
 * bodies, object args) whose `>` do not close it — and only a `fill` written
 * at the tag's own level counts.
 */
function stageFillOverlays(text: string): number[] {
  const hits: number[] = [];
  for (const start of offsets(text, /<DeskStageOverlay\b/)) {
    // The tag's own attributes, with every `{…}` expression collapsed to `{}`
    // unless it is a bare string literal (`fill={'stage'}`).
    let attrs = '';
    let depth = 0;
    let exprStart = -1;
    let quote: string | null = null;
    for (let i = start + '<DeskStageOverlay'.length; i < text.length; i += 1) {
      const ch = text[i];
      if (quote) {
        if (depth === 0) attrs += ch;
        if (ch === quote) quote = null;
        continue;
      }
      if (depth === 0) {
        if (ch === '>') break;
        if (ch === '"' || ch === "'") {
          quote = ch;
          attrs += ch;
        } else if (ch === '{') {
          depth = 1;
          exprStart = i;
        } else attrs += ch;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') quote = ch;
      else if (ch === '{') depth += 1;
      else if (ch === '}' && (depth -= 1) === 0) {
        const expr = text.slice(exprStart, i + 1);
        attrs += /^\{\s*(['"])[^'"]*\1\s*\}$/.test(expr) ? expr : '{}';
      }
    }
    if (/\bfill=(?:"stage"|'stage'|\{\s*['"]stage['"]\s*\})/.test(attrs)) hits.push(start);
  }
  return hits;
}

export const DESK_SURFACE_RULES: readonly DeskSurfaceRule[] = [
  {
    id: 'rail',
    law:
      "A picked row's record never lives in the legacy right rail or a hand-rolled evidence aside: it opens " +
      'in place of the fixed-width list (DeskStageOverlay), or — when the staffer chooses fullscreen — beside ' +
      'the list in the split drawn by DeskRecordPlane — the one primitive that places a record in both views. ' +
      'Classify every rail in src/lib/design/desk-surface-ledger.ts; `record` rails are debt and the baseline only shrinks.',
    roles: ['record', 'supporting', 'station-edge', 'linked-peek'],
    debtRole: 'record',
    scope: (file) => isDesktopSource(file) && /\.tsx?$/.test(file) && !RAIL_PRIMITIVE_HOMES.has(file),
    detect: (text) => [
      ...offsets(text, /<DetailStackRailRegistrar\b/),
      ...offsets(text, /useRegisterRightPanel\(\s*\{[^}]*priority:\s*RIGHT_RAIL_PRIORITY\.detail\b/),
      ...offsets(text, /className=\{LEDGER_EVIDENCE_CLASS\}/),
    ],
  },
  {
    id: 'search-desk-copy',
    law:
      'Search is a find-and-identify job: its results and its record view are search components ' +
      '(fixed-width result rows, a two-column record with "Open in desk"), never a remount of a desk ' +
      'table or ledger. Legacy imports are debt and the baseline only shrinks.',
    roles: ['legacy'],
    debtRole: 'legacy',
    scope: (file) => file.startsWith('src/components/search/') || file.startsWith('src/app/search/'),
    detect: (text) => offsets(text, DESK_TABLE_IMPORT),
  },
  {
    id: 'binding-inspector',
    law:
      "A table binding's recordPlane is never `inspector` (legacy RightRailHost peek): new and converted " +
      "bindings declare 'stage-overlay', 'navigate', 'dialog', 'station' or 'none'. Legacy inspector " +
      'bindings are debt and the baseline only shrinks.',
    roles: ['legacy'],
    debtRole: 'legacy',
    scope: (file) => isDesktopSource(file) && /table-definition\.ts$/.test(file),
    detect: (text) => offsets(text, /kind:\s*['"]inspector['"]/),
  },
  {
    id: 'record-plane',
    law:
      'A desk record is placed by DeskRecordPlane, never by a hand-mounted DeskStageOverlay fill="stage": the ' +
      "plane is what honours the staffer's choice of view (in place by default, list-left / record-right split in " +
      'fullscreen). Legacy hand placements are debt and the baseline only shrinks.',
    roles: ['legacy'],
    debtRole: 'legacy',
    scope: (file) => isDesktopSource(file) && /\.tsx$/.test(file) && !RECORD_PLANE_HOMES.has(file),
    detect: stageFillOverlays,
  },
];

function lineAt(text: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i += 1) if (text[i] === '\n') line += 1;
  return line;
}

/**
 * Audit every rule over `files` against the ledger and baselines. A hit in an
 * unlisted file is a violation; a listed file that no longer hits, a role the
 * rule does not know, a non-debt entry without a note, or a debt count that
 * differs from its baseline is a problem (the ratchet).
 */
export function auditDeskSurfaces(
  files: readonly { file: string; source: string }[],
  ledger: DeskSurfaceLedger,
  baselines: Readonly<Record<string, number>>,
  rules: readonly DeskSurfaceRule[] = DESK_SURFACE_RULES,
): DeskSurfaceAudit {
  const violations: DeskSurfaceViolation[] = [];
  const problems: string[] = [];
  const debt: Record<string, { count: number; baseline: number }> = {};

  for (const rule of rules) {
    const entries = ledger[rule.id] ?? {};
    const hitting = new Set<string>();
    for (const { file, source } of files) {
      if (!rule.scope(file)) continue;
      const text = stripComments(source);
      const hits = rule.detect(text);
      if (hits.length === 0) continue;
      hitting.add(file);
      if (!entries[file]) {
        violations.push({
          rule: `${rule.id}-unclassified`,
          file,
          line: lineAt(text, Math.min(...hits)),
          detail: `not in the ${rule.id} ledger (src/lib/design/desk-surface-ledger.ts) — ${rule.law}`,
        });
      }
    }

    for (const [file, entry] of Object.entries(entries)) {
      if (!hitting.has(file)) problems.push(`${rule.id}: ${file} no longer matches — drop it from the ledger`);
      if (!rule.roles.includes(entry.role)) {
        problems.push(`${rule.id}: ${file} has unknown role '${entry.role}' (one of ${rule.roles.join(', ')})`);
      } else if (entry.role !== rule.debtRole && !entry.note?.trim()) {
        problems.push(`${rule.id}: ${file} is '${entry.role}' without a note saying why`);
      }
    }

    const count = Object.values(entries).filter((e) => e.role === rule.debtRole).length;
    const baseline = baselines[rule.id] ?? 0;
    debt[rule.id] = { count, baseline };
    if (count > baseline) {
      problems.push(
        `${rule.id}: '${rule.debtRole}' entries rose to ${count} (baseline ${baseline}) — the baseline only shrinks`,
      );
    } else if (count < baseline) {
      problems.push(`${rule.id}: debt retired — drop the ${rule.id} baseline to ${count} in the same commit`);
    }
  }

  return { violations, problems, debt };
}

export function formatDeskSurfaceViolation(v: DeskSurfaceViolation): string {
  return `${v.file}:${v.line} [${v.rule}] ${v.detail}`;
}
