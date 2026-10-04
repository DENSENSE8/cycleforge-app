/**
 * The DISPLAY-METHOD DECISION FORMULA (owner 2026-09-29), executable.
 *
 * Every page is different, so the display is derived from facts about THIS
 * page — never from the word table/grid/list in the request. This module is
 * the source of truth the `DataTable` pin (`src/design-system/pinned.json`)
 * names; `scripts/display-method-guard.ts` is its CLI and the `ds_display_method`
 * MCP tool spawns that CLI.
 *
 *   STEP 1 — gather the facts (`DisplayFacts`; at least the four required).
 *   STEP 2 — score each candidate 0–5 per gathered fact, then the pin's
 *            explicit modifiers (DataTable +2 / −2, card list +2 / −1, detail
 *            hub +3) and the surface law (lists on a phone are cards; a
 *            column board on a phone is one column = the card list).
 *   STEP 3 — confidence = top ÷ (5 × facts gathered), clamped to [0, 1];
 *            HIGH ≥ 0.75 implement · MEDIUM 0.50–0.74 implement and name the
 *            runner-up · LOW, or the top two in the same tier, ASK.
 *
 * Pure: no React, no IO.
 */

export const DISPLAY_VERBS = [
  'scan-and-act',
  'read-and-compare',
  'edit-in-place',
  'browse-and-drill',
  'monitor-pipeline',
] as const;
export const DISPLAY_SURFACES = ['desk', 'phone', 'kiosk'] as const;
export const DISPLAY_SHAPES = ['entity-per-row', 'grouped', 'append-history'] as const;
export const DISPLAY_ROWS_PER_SCREEN = ['few', 'many'] as const;

export type DisplayVerb = (typeof DISPLAY_VERBS)[number];
export type DisplaySurface = (typeof DISPLAY_SURFACES)[number];
export type DisplayShape = (typeof DISPLAY_SHAPES)[number];
export type DisplayRowsPerScreen = (typeof DISPLAY_ROWS_PER_SCREEN)[number];

/** The page facts. Every provided field is one GATHERED fact. */
export interface DisplayFacts {
  /** Steady-state result-set size (not the worst case, not the empty state). */
  steadyRows: number;
  /** Facts the operator compares side-by-side across rows. */
  comparedFacts: number;
  verb: DisplayVerb;
  surface: DisplaySurface;
  shape?: DisplayShape;
  rowsPerScreen?: DisplayRowsPerScreen;
  /** The list is an urgency-banded queue (overdue / today / later). */
  urgencyBands?: boolean;
  /** Small admin CRUD (settings, staff, locations). */
  admin?: boolean;
  /** How many statuses / groups the operator must see at once (the columns a board would draw). */
  statusGroups?: number;
}

export const DISPLAY_CANDIDATE_IDS = [
  'data-table',
  'card-list',
  'record-ledger',
  'admin-table',
  'triage-sections',
  'detail-hub',
  'column-board',
] as const;
export type DisplayCandidateId = (typeof DISPLAY_CANDIDATE_IDS)[number];

export type ConfidenceTier = 'HIGH' | 'MEDIUM' | 'LOW';
export type DisplayDecision = 'implement' | 'implement-name-runner-up' | 'ask';

export interface DisplayCandidateResult {
  id: DisplayCandidateId;
  name: string;
  imports: readonly string[];
  score: number;
  /** This candidate's own score ÷ (5 × facts gathered), clamped to [0, 1]. */
  confidence: number;
  tier: ConfidenceTier;
  /** One line per rule that moved the score. */
  reasons: string[];
  /** Ask-menu: the trade this candidate gives up. */
  tradeOff: string;
  /** Ask-menu: the single page fact that would settle it. */
  settlingFact: string;
}

export interface DisplayMethodResult {
  facts: DisplayFacts;
  factsGathered: number;
  /** Highest score first; ties keep candidate order. */
  ranked: DisplayCandidateResult[];
  top: DisplayCandidateId;
  runnerUp: DisplayCandidateId;
  confidence: number;
  tier: ConfidenceTier;
  decision: DisplayDecision;
  summary: string;
}

interface CandidateMeta {
  name: string;
  imports: readonly string[];
  tradeOff: string;
  settlingFact: string;
}

const CANDIDATES: Record<DisplayCandidateId, CandidateMeta> = {
  'data-table': {
    name: 'Canonical DataTable + direct TableSurfaceBinding',
    imports: ['src/components/tables/DataTable.tsx'],
    tradeOff: 'Gives up the one-glance card read and the phone face; every fact costs a column.',
    settlingFact: 'Does the operator sort or edit ≥5 facts side-by-side at a desk?',
  },
  'card-list': {
    name: 'TriageCardList + RecordCard',
    imports: [
      'src/design-system/components/triage-card-list/TriageCardList.tsx',
      'src/design-system/components/record-card/RecordCard.tsx',
    ],
    tradeOff: 'Gives up column sort and side-by-side comparison; facts read per card, not per column.',
    settlingFact: 'Is the primary verb scan-and-act on one record at a time (or is it a phone)?',
  },
  'record-ledger': {
    name: 'RecordLedger',
    imports: ['src/design-system/components/record-ledger/RecordLedgerSummary.tsx'],
    tradeOff: 'Gives up in-place editing and urgency ordering; rows are an append-style history read.',
    settlingFact: 'Is the list an append-only history the operator reads, never edits?',
  },
  'admin-table': {
    name: 'AdminTable',
    imports: ['src/design-system/components/AdminTable/AdminTable.tsx'],
    tradeOff: 'Gives up scale and operator workflow chrome; a desk-only CRUD sheet for a handful of rows.',
    settlingFact: 'Is this small admin CRUD (settings, staff, locations) with only a few rows?',
  },
  'triage-sections': {
    name: 'TriageSections / TriageScrollLayout',
    imports: [
      'src/design-system/components/TriageSections.tsx',
      'src/design-system/components/TriageScrollLayout.tsx',
    ],
    tradeOff: 'Gives up one flat sort order; rows are split into urgency bands.',
    settlingFact: 'Is the queue banded by urgency (overdue / today / later)?',
  },
  'detail-hub': {
    name: 'DetailHubScreen + DetailSummaryCard',
    imports: [
      'src/design-system/components/DetailHubScreen.tsx',
      'src/design-system/components/DetailSummaryCard.tsx',
    ],
    tradeOff: 'Gives up the list entirely; the page is one record surface.',
    settlingFact: 'Is the steady-state result set one row?',
  },
  'column-board': {
    name: 'Status column board',
    imports: ['src/design-system/components/column-board/ColumnBoard.tsx'],
    tradeOff:
      'Gives up one flat sort order and the phone face; each status is its own vertical list, side by side, scrolled sideways with snap.',
    settlingFact: 'Must the operator watch counts and items across six or more statuses at once, at a desk?',
  },
};

type Scores = Record<DisplayCandidateId, number>;
const s = (
  dataTable: number,
  cardList: number,
  recordLedger: number,
  adminTable: number,
  triageSections: number,
  detailHub: number,
  columnBoard: number,
): Scores => ({
  'data-table': dataTable,
  'card-list': cardList,
  'record-ledger': recordLedger,
  'admin-table': adminTable,
  'triage-sections': triageSections,
  'detail-hub': detailHub,
  'column-board': columnBoard,
});

/*
 * STEP 2 base scores (0–5 per fact). Columns:
 *                       DT CL RL AT TS DH CB
 */
const ROWS_ONE = s(0, 1, 0, 1, 0, 5, 0); // ≤ 1
const ROWS_HANDFUL = s(1, 3, 2, 4, 1, 2, 1); // 2–3
const ROWS_FEW = s(3, 4, 4, 5, 3, 0, 3); // 4–20
const ROWS_MANY = s(5, 4, 4, 1, 4, 0, 5); // > 20

const COMPARED_NONE = s(0, 4, 3, 3, 4, 4, 3); // 0–1
const COMPARED_SOME = s(2, 5, 4, 4, 4, 3, 4); // 2–4
const COMPARED_WIDE = s(5, 3, 2, 2, 2, 2, 1); // ≥ 5

const VERB: Record<DisplayVerb, Scores> = {
  'scan-and-act': s(1, 5, 1, 0, 3, 2, 1),
  'read-and-compare': s(5, 2, 3, 2, 1, 2, 1),
  'edit-in-place': s(5, 1, 0, 4, 0, 2, 0),
  'browse-and-drill': s(2, 4, 4, 2, 2, 3, 2),
  'monitor-pipeline': s(1, 3, 1, 0, 2, 1, 5),
};

const SURFACE: Record<DisplaySurface, Scores> = {
  desk: s(5, 4, 4, 5, 4, 4, 5),
  phone: s(0, 5, 2, 0, 3, 4, 0),
  kiosk: s(1, 4, 1, 0, 3, 3, 3),
};

const SHAPE: Record<DisplayShape, Scores> = {
  'entity-per-row': s(5, 4, 2, 5, 3, 2, 3),
  grouped: s(1, 5, 3, 1, 4, 2, 5),
  'append-history': s(1, 1, 5, 0, 0, 1, 0),
};

const ROWS_PER_SCREEN: Record<DisplayRowsPerScreen, Scores> = {
  many: s(5, 3, 4, 2, 3, 0, 5),
  few: s(1, 4, 2, 4, 3, 5, 1),
};

const URGENCY_BANDED = s(0, 3, 0, 0, 5, 0, 4);
const URGENCY_FLAT = s(3, 3, 3, 3, 0, 3, 2);
const ADMIN_YES = s(1, 0, 0, 5, 0, 1, 0);
const ADMIN_NO = s(3, 3, 3, 0, 3, 3, 3);

const GROUPS_ONE = s(3, 4, 3, 3, 1, 3, 0); // ≤ 1
const GROUPS_FEW = s(2, 3, 1, 1, 5, 1, 3); // 2–5
const GROUPS_MANY = s(2, 2, 1, 0, 2, 0, 5); // 6–12
const GROUPS_WIDE = s(4, 3, 1, 0, 1, 0, 2); // > 12

/** A display that cannot exist on these facts loses this much: SURFACE_LAW (lists on a phone are cards, a board on a phone is one column = the card list) and a one-group board (a board of one column is a list). */
export const DISPLAY_EXCLUDED_PENALTY = -10;

const COMPARE_VERB: Record<DisplayVerb, boolean> = {
  'scan-and-act': false,
  'read-and-compare': true,
  'edit-in-place': true,
  'browse-and-drill': false,
  'monitor-pipeline': false,
};

function rowsBucket(rows: number): { scores: Scores; label: string } {
  if (rows <= 1) return { scores: ROWS_ONE, label: '≤1' };
  if (rows <= 3) return { scores: ROWS_HANDFUL, label: '2–3' };
  if (rows <= 20) return { scores: ROWS_FEW, label: '4–20' };
  return { scores: ROWS_MANY, label: '>20' };
}

function comparedBucket(compared: number): { scores: Scores; label: string } {
  if (compared <= 1) return { scores: COMPARED_NONE, label: '0–1' };
  if (compared <= 4) return { scores: COMPARED_SOME, label: '2–4' };
  return { scores: COMPARED_WIDE, label: '≥5' };
}

function groupsBucket(groups: number): { scores: Scores; label: string } {
  if (groups <= 1) return { scores: GROUPS_ONE, label: '≤1' };
  if (groups <= 5) return { scores: GROUPS_FEW, label: '2–5' };
  if (groups <= 12) return { scores: GROUPS_MANY, label: '6–12' };
  return { scores: GROUPS_WIDE, label: '>12' };
}

interface Rule {
  line: string;
  scores: Partial<Scores>;
}

function factRules(facts: DisplayFacts): Rule[] {
  const rules: Rule[] = [];
  const rows = rowsBucket(facts.steadyRows);
  rules.push({ line: `steadyRows ${facts.steadyRows} (${rows.label})`, scores: rows.scores });
  const compared = comparedBucket(facts.comparedFacts);
  rules.push({ line: `comparedFacts ${facts.comparedFacts} (${compared.label})`, scores: compared.scores });
  rules.push({ line: `verb ${facts.verb}`, scores: VERB[facts.verb] });
  rules.push({ line: `surface ${facts.surface}`, scores: SURFACE[facts.surface] });
  if (facts.shape !== undefined) rules.push({ line: `shape ${facts.shape}`, scores: SHAPE[facts.shape] });
  if (facts.rowsPerScreen !== undefined) {
    rules.push({ line: `rowsPerScreen ${facts.rowsPerScreen}`, scores: ROWS_PER_SCREEN[facts.rowsPerScreen] });
  }
  if (facts.urgencyBands !== undefined) {
    rules.push({
      line: facts.urgencyBands ? 'urgency-banded queue' : 'no urgency bands',
      scores: facts.urgencyBands ? URGENCY_BANDED : URGENCY_FLAT,
    });
  }
  if (facts.admin !== undefined) {
    rules.push({ line: facts.admin ? 'admin CRUD' : 'operator workflow (not admin)', scores: facts.admin ? ADMIN_YES : ADMIN_NO });
  }
  if (facts.statusGroups !== undefined) {
    const groups = groupsBucket(facts.statusGroups);
    rules.push({ line: `statusGroups ${facts.statusGroups} (${groups.label})`, scores: groups.scores });
  }

  // The pin's explicit modifiers.
  const wide = facts.comparedFacts >= 5;
  if (wide && facts.surface === 'desk' && COMPARE_VERB[facts.verb]) {
    rules.push({ line: '≥5 compared columns at a desk with a sort/spreadsheet-edit verb', scores: { 'data-table': 2 } });
  }
  if (facts.statusGroups !== undefined && facts.statusGroups <= 1) {
    rules.push({ line: 'one status group: a board of one column is a list', scores: { 'column-board': DISPLAY_EXCLUDED_PENALTY } });
  }
  if (facts.steadyRows <= 3) rules.push({ line: 'steady state ≤3 rows', scores: { 'data-table': -2 } });
  if (facts.verb === 'scan-and-act' || facts.surface === 'phone') {
    rules.push({ line: facts.verb === 'scan-and-act' ? 'scan-and-act verb' : 'phone surface', scores: { 'card-list': 2 } });
  }
  if (wide) rules.push({ line: '≥5 compared columns', scores: { 'card-list': -1 } });
  if (facts.steadyRows <= 1) rules.push({ line: 'steady state ≤1 row', scores: { 'detail-hub': 3 } });
  if (facts.surface === 'phone') {
    rules.push({
      line: 'SURFACE_LAW: lists on a phone are cards',
      scores: {
        'data-table': DISPLAY_EXCLUDED_PENALTY,
        'admin-table': DISPLAY_EXCLUDED_PENALTY,
        'column-board': DISPLAY_EXCLUDED_PENALTY,
      },
    });
  }
  return rules;
}

/** Number of provided fields — every provided field is a gathered fact. */
export function countGatheredFacts(facts: DisplayFacts): number {
  return (Object.keys(facts) as (keyof DisplayFacts)[]).filter((k) => facts[k] !== undefined).length;
}

/** STEP 3: top ÷ (5 × facts gathered), clamped to [0, 1]. */
export function displayConfidence(score: number, factsGathered: number): number {
  if (factsGathered <= 0) return 0;
  return Math.min(1, Math.max(0, score / (5 * factsGathered)));
}

export function confidenceTier(confidence: number): ConfidenceTier {
  if (confidence >= 0.75) return 'HIGH';
  if (confidence >= 0.5) return 'MEDIUM';
  return 'LOW';
}

export function scoreDisplayMethod(facts: DisplayFacts): DisplayMethodResult {
  const factsGathered = countGatheredFacts(facts);
  const rules = factRules(facts);

  const scored = DISPLAY_CANDIDATE_IDS.map((id, order) => {
    let score = 0;
    const reasons: string[] = [];
    for (const rule of rules) {
      const delta = rule.scores[id];
      if (delta === undefined || delta === 0) continue;
      score += delta;
      reasons.push(`${delta > 0 ? `+${delta}` : delta} ${rule.line}`);
    }
    const confidence = displayConfidence(score, factsGathered);
    const meta = CANDIDATES[id];
    const result: DisplayCandidateResult = {
      id,
      name: meta.name,
      imports: meta.imports,
      score,
      confidence,
      tier: confidenceTier(confidence),
      reasons,
      tradeOff: meta.tradeOff,
      settlingFact: meta.settlingFact,
    };
    return { result, order };
  });

  scored.sort((a, b) => b.result.score - a.result.score || a.order - b.order);
  const ranked = scored.map((x) => x.result);
  const [top, runnerUp] = ranked as [DisplayCandidateResult, DisplayCandidateResult];

  const decision: DisplayDecision =
    top.tier === 'LOW' || top.tier === runnerUp.tier
      ? 'ask'
      : top.tier === 'HIGH'
        ? 'implement'
        : 'implement-name-runner-up';

  const pct = (c: number) => `${Math.round(c * 100)}%`;
  const summary =
    decision === 'ask'
      ? `ASK — ${top.id} ${pct(top.confidence)} ${top.tier} vs ${runnerUp.id} ${pct(runnerUp.confidence)} ${runnerUp.tier}: present the ranked menu and implement the operator's pick.`
      : decision === 'implement'
        ? `Implement ${top.id} (${pct(top.confidence)} HIGH).`
        : `Implement ${top.id} (${pct(top.confidence)} MEDIUM); name runner-up ${runnerUp.id} in the change summary.`;

  return {
    facts,
    factsGathered,
    ranked,
    top: top.id,
    runnerUp: runnerUp.id,
    confidence: top.confidence,
    tier: top.tier,
    decision,
    summary,
  };
}

export type ParseDisplayFactsResult = { ok: true; facts: DisplayFacts } | { ok: false; errors: string[] };

const FACT_KEYS: Record<keyof DisplayFacts, true> = {
  steadyRows: true,
  comparedFacts: true,
  verb: true,
  surface: true,
  shape: true,
  rowsPerScreen: true,
  urgencyBands: true,
  admin: true,
  statusGroups: true,
};

/** Validate untrusted input (the gate CLI's `--input`) against the exported enums. */
export function parseDisplayFacts(input: unknown): ParseDisplayFactsResult {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, errors: ['input must be a JSON object'] };
  }
  const raw = input as Record<string, unknown>;
  const errors: string[] = [];
  for (const key of Object.keys(raw)) {
    if (!Object.hasOwn(FACT_KEYS, key)) errors.push(`unknown fact "${key}"`);
  }
  const count = (key: 'steadyRows' | 'comparedFacts' | 'statusGroups', required: boolean) => {
    const v = raw[key];
    if (v === undefined && !required) return;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) errors.push(`${key} must be a non-negative integer`);
  };
  count('steadyRows', true);
  count('comparedFacts', true);
  count('statusGroups', false);
  const enumField = (key: string, values: readonly string[], required: boolean) => {
    const v = raw[key];
    if (v === undefined && !required) return;
    if (typeof v !== 'string' || !values.includes(v)) errors.push(`${key} must be one of ${values.join(' | ')}`);
  };
  enumField('verb', DISPLAY_VERBS, true);
  enumField('surface', DISPLAY_SURFACES, true);
  enumField('shape', DISPLAY_SHAPES, false);
  enumField('rowsPerScreen', DISPLAY_ROWS_PER_SCREEN, false);
  for (const key of ['urgencyBands', 'admin'] as const) {
    if (raw[key] !== undefined && typeof raw[key] !== 'boolean') errors.push(`${key} must be a boolean`);
  }
  if (errors.length > 0) return { ok: false, errors };

  const facts: DisplayFacts = {
    steadyRows: raw.steadyRows as number,
    comparedFacts: raw.comparedFacts as number,
    verb: raw.verb as DisplayVerb,
    surface: raw.surface as DisplaySurface,
  };
  if (raw.shape !== undefined) facts.shape = raw.shape as DisplayShape;
  if (raw.rowsPerScreen !== undefined) facts.rowsPerScreen = raw.rowsPerScreen as DisplayRowsPerScreen;
  if (raw.urgencyBands !== undefined) facts.urgencyBands = raw.urgencyBands as boolean;
  if (raw.admin !== undefined) facts.admin = raw.admin as boolean;
  if (raw.statusGroups !== undefined) facts.statusGroups = raw.statusGroups as number;
  return { ok: true, facts };
}
