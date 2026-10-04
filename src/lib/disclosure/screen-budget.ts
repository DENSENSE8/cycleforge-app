/**
 * SCREEN BUDGET — just-in-time progressive disclosure as DATA (owner 2026-10-03:
 * "this amount of information at one time displayed at the screen, and it would
 * immediately clean up the display via agent coding").
 *
 * A surface DECLARES what its first screen (L1) carries and what lives one tap
 * behind each L1 control (its doors, L2). This module checks the declaration
 * against the budget (static) and the rendered screen against the declaration
 * (snapshot, measured live at :3050). Every finding lands in ONE of four lists —
 * DELETE · SIMPLIFY · MOVE · ENLARGE — with the recipe that fixes it.
 *
 * One module, three faces (the house shape for a law):
 *   1. `screen-budget.test.ts` + verify:fast `Disclosure` (static, every spec).
 *   2. `scripts/disclosure-audit.ts` — the CLI; `--surface <id>` measures live.
 *   3. `ds_disclosure` — the design-mcp face (profile gate → the same script).
 * The `declutter` skill (.claude/skills/declutter) drives 2/3 to zero findings.
 *
 * Slot vocabulary: a composition marks each L1 element `data-disclosure-slot="<slot>"`
 * and its regions `data-disclosure-zone="l1" | "body" | "dock"`. A trailing `?`
 * in a spec marks a slot that is legitimately absent on some records.
 */

export type DisclosureRemedy = 'delete' | 'simplify' | 'move' | 'enlarge';

export type DisclosureRule =
  | 'chrome-row'
  | 'corner-row'
  | 'one-fact-one-place'
  | 'l1-budget'
  | 'l1-height'
  | 'dock-budget'
  | 'door-declared'
  | 'slot-missing'
  | 'undeclared-control'
  | 'duplicate-text'
  | 'field-label'
  | 'tap-target';

/** Each rule's list and the recipe the declutter skill applies. */
export const DISCLOSURE_RULES: Readonly<Record<DisclosureRule, { remedy: DisclosureRemedy; law: string; fix: string }>> = {
  'chrome-row': {
    remedy: 'move',
    law: 'The record chrome is ONE row: identity/title left, header tools, close ✕ last and top-right, its centre on the title’s first line.',
    fix: 'Put the ✕ (and header tools, e.g. the timer glyph) in the title row; title py-2.5 + leading-6 so its first line centres on a 44px control; never a second header row.',
  },
  'corner-row': {
    remedy: 'move',
    law: 'State and time read as corners: status top-left, the time (due / overdue / reminder) top-right, one row.',
    fix: 'Row = justify-between: status trigger first, time last; nothing between them.',
  },
  'one-fact-one-place': {
    remedy: 'delete',
    law: 'A fact has ONE face and ONE control on a screen; a second control for it lives behind the first (its door).',
    fix: 'Keep the face (e.g. the status pill); move the second control (e.g. the quick slider) inside that face’s dropdown/sheet.',
  },
  'l1-budget': {
    remedy: 'simplify',
    law: 'The first screen carries at most the budgeted number of L1 slots.',
    fix: 'Demote the least-used slot behind the door of the slot it belongs to; tools become glyphs that open their full display (L2).',
  },
  'l1-height': {
    remedy: 'simplify',
    law: 'The L1 zone (everything above the scrolling body) stays inside its share of the viewport so the work itself is on screen.',
    fix: 'Collapse rows: a control that only changes a value becomes that value’s face; a secondary tool becomes a header glyph.',
  },
  'dock-budget': {
    remedy: 'simplify',
    law: 'The dock holds at most three verbs, exactly one primary (SURFACE_LAW R2, P2).',
    fix: 'Keep one filled primary; repeated verbs are tonal; the rest move into the record body next to their facts.',
  },
  'door-declared': {
    remedy: 'move',
    law: 'Every door opens from a slot that is on the first screen.',
    fix: 'Declare the door under an L1 slot, or put its trigger on L1.',
  },
  'slot-missing': {
    remedy: 'move',
    law: 'A declared L1 slot must render (or be marked optional with `?`).',
    fix: 'Mark the element with data-disclosure-slot, or fix the declaration.',
  },
  'undeclared-control': {
    remedy: 'simplify',
    law: 'Every control in the L1 zone belongs to a declared slot; anything else is clutter or belongs behind a door.',
    fix: 'Delete it, move it behind the door of the slot it serves (L2), or declare it in the surface spec (owner decision).',
  },
  'duplicate-text': {
    remedy: 'delete',
    law: 'A string is painted once per screen: the title is never repeated by a chip, a heading or the body’s first line.',
    fix: 'Drop the repeat at the derived site (e.g. taskBriefBody drops a note line equal to the title; a project chip hides when the title is the project).',
  },
  'field-label': {
    remedy: 'delete',
    law: 'No field labels on L1: the value and its glyph are the label (owner 2026-10-03, M2). Screen readers get the name via aria-label.',
    fix: 'Delete the visible label; put the name in aria-label / sr-only; lead the row with the value.',
  },
  'tap-target': {
    remedy: 'enlarge',
    law: 'Every touch target is ≥44px in both directions (a compact face may own a larger hit area).',
    fix: 'min-h-11 / size="touch", or a `before:absolute before:-inset-2` hit area that keeps the face small.',
  },
};

/** Owner-tunable budgets — the "amount of information at one time". */
export const SCREEN_BUDGET = {
  phone: {
    /** Max L1 slots (title, close, tools, status, time, people …). */
    l1Slots: 10,
    /** Max share of the viewport height the L1 zone may take. */
    l1MaxViewportFraction: 0.3,
    dockVerbs: 3,
    minTargetPx: 44,
    /** Two centres within this many px are "the same row". */
    rowTolerancePx: 6,
    /** Max distance of the ✕ / the time from the right edge, and of the status from the left. */
    cornerInsetPx: 24,
    /** Strings shorter than this may repeat (names, "Due", counts). */
    duplicateMinChars: 12,
  },
} as const;

export type DisclosureSurfaceKind = keyof typeof SCREEN_BUDGET;

/** Visible words that are field labels, never L1 text (M2). Lowercased, exact match. */
export const BANNED_FIELD_LABELS: Readonly<Record<string, true>> = {
  status: true, people: true, team: true, owner: true, owners: true, assignee: true, assignees: true,
  project: true, due: true, 'due date': true, linked: true, from: true, brief: true, 'followed up': true,
  focus: true, spent: true, reminder: true, alert: true, email: true,
};

export interface SurfaceDisclosureSpec {
  id: string;
  surface: DisclosureSurfaceKind;
  /** The composition that paints it. */
  file: string;
  /** Who decided, dated, in their words. */
  owner: string;
  /** How the live audit opens it at :3050. `{name}` placeholders come from params. */
  probe: { path: string; params: Readonly<Record<string, string>>; ready: string };
  /** Left → right. Must start with 'title' and end with 'close'. */
  chromeRow: readonly string[];
  /** The corners row: state left, time right. */
  cornerRow?: { left: string; right: string };
  /** Other L1 rows, top → bottom. */
  rows: readonly (readonly string[])[];
  /** Bottom verbs; exactly one `primary`. */
  dock: readonly string[];
  /** L1 slot → what lives one tap behind it (L2). */
  doors: Readonly<Record<string, readonly string[]>>;
}

export interface DisclosureFinding {
  rule: DisclosureRule;
  remedy: DisclosureRemedy;
  /** What was found, concretely (slot, text, px). */
  detail: string;
  fix: string;
}

const slotName = (slot: string) => slot.replace(/\?$/, '');
const isOptional = (slot: string) => slot.endsWith('?');

function finding(rule: DisclosureRule, detail: string): DisclosureFinding {
  const r = DISCLOSURE_RULES[rule];
  return { rule, remedy: r.remedy, detail, fix: r.fix };
}

/** Every L1 slot a spec declares, in reading order. */
export function l1Slots(spec: SurfaceDisclosureSpec): string[] {
  return [
    ...spec.chromeRow,
    ...(spec.cornerRow ? [spec.cornerRow.left, spec.cornerRow.right] : []),
    ...spec.rows.flat(),
  ];
}

/** STATIC: does the declaration itself respect the law? (verify:fast `Disclosure`.) */
export function checkSurfaceSpec(spec: SurfaceDisclosureSpec): DisclosureFinding[] {
  const out: DisclosureFinding[] = [];
  const budget = SCREEN_BUDGET[spec.surface];
  if (slotName(spec.chromeRow[0] ?? '') !== 'title' || slotName(spec.chromeRow.at(-1) ?? '') !== 'close') {
    out.push(finding('chrome-row', `${spec.id}: chromeRow is [${spec.chromeRow.join(', ')}] — must run title … close`));
  }
  const l1 = l1Slots(spec).map(slotName);
  if (l1.length > budget.l1Slots) {
    out.push(finding('l1-budget', `${spec.id}: ${l1.length} L1 slots > budget ${budget.l1Slots}`));
  }
  const behind = Object.values(spec.doors).flat().map(slotName);
  const seen = new Map<string, number>();
  for (const s of [...l1, ...spec.dock.map(slotName), ...behind]) seen.set(s, (seen.get(s) ?? 0) + 1);
  for (const [s, n] of seen) {
    if (n > 1) out.push(finding('one-fact-one-place', `${spec.id}: "${s}" is declared ${n} times (L1, dock or behind a door)`));
  }
  const primaries = spec.dock.filter((v) => slotName(v) === 'primary').length;
  if (spec.dock.length > budget.dockVerbs || primaries !== 1) {
    out.push(finding('dock-budget', `${spec.id}: dock [${spec.dock.join(', ')}] — max ${budget.dockVerbs}, exactly one primary`));
  }
  for (const door of Object.keys(spec.doors)) {
    if (!l1.includes(slotName(door))) out.push(finding('door-declared', `${spec.id}: door "${door}" opens from no L1 slot`));
  }
  return out;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What the live audit measures (scripts/disclosure-audit.ts → `snapshotScreen`). */
export interface ScreenSnapshot {
  viewport: { width: number; height: number };
  /** `data-disclosure-slot` → its first rendered rect. */
  slots: Readonly<Record<string, Rect>>;
  /** Height of the `data-disclosure-zone="l1"` region. */
  l1Height: number;
  /** The first line box of the `title` slot (a wrapped title's later lines do not count). */
  titleFirstLine: Rect | null;
  /** Controls inside the L1 zone; `slot` = the nearest declared slot ancestor (or self). */
  l1Controls: readonly { name: string; slot: string | null }[];
  /** Visible text leaves in the first viewport. */
  texts: readonly { text: string; zone: string | null; isLabel: boolean }[];
  /** Visible controls in the first viewport, with their effective hit box. */
  targets: readonly { name: string; width: number; height: number }[];
}

const centreY = (r: Rect) => r.y + r.height / 2;
const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

/** SNAPSHOT: does the rendered first screen honour its declaration and the budget? */
export function checkScreenSnapshot(spec: SurfaceDisclosureSpec, snap: ScreenSnapshot): DisclosureFinding[] {
  const out: DisclosureFinding[] = [];
  const budget = SCREEN_BUDGET[spec.surface];
  const vw = snap.viewport.width;

  for (const s of l1Slots(spec)) {
    if (!isOptional(s) && !snap.slots[slotName(s)]) out.push(finding('slot-missing', `"${slotName(s)}" did not render`));
  }

  const title = snap.titleFirstLine ?? snap.slots.title;
  const close = snap.slots.close;
  if (title && close) {
    if (Math.abs(centreY(close) - centreY(title)) > budget.rowTolerancePx) {
      out.push(
        finding('chrome-row', `✕ centre ${Math.round(centreY(close))}px vs title first line ${Math.round(centreY(title))}px — not one row`),
      );
    }
    if (vw - (close.x + close.width) > budget.cornerInsetPx) {
      out.push(finding('chrome-row', `✕ sits ${Math.round(vw - close.x - close.width)}px from the right edge`));
    }
  }

  if (spec.cornerRow) {
    const left = snap.slots[slotName(spec.cornerRow.left)];
    const right = snap.slots[slotName(spec.cornerRow.right)];
    if (left && right) {
      if (Math.abs(centreY(left) - centreY(right)) > budget.rowTolerancePx || left.x > right.x) {
        out.push(finding('corner-row', `${spec.cornerRow.left} and ${spec.cornerRow.right} are not one left/right row`));
      }
      if (left.x > budget.cornerInsetPx) out.push(finding('corner-row', `${spec.cornerRow.left} starts ${Math.round(left.x)}px in — not top-left`));
      if (vw - (right.x + right.width) > budget.cornerInsetPx) {
        out.push(finding('corner-row', `${spec.cornerRow.right} ends ${Math.round(vw - right.x - right.width)}px from the right — not top-right`));
      }
    }
  }

  const rendered = Object.keys(snap.slots).filter((s) => l1Slots(spec).some((d) => slotName(d) === s));
  if (rendered.length > budget.l1Slots) out.push(finding('l1-budget', `${rendered.length} L1 slots rendered > ${budget.l1Slots}`));
  const maxL1 = Math.round(snap.viewport.height * budget.l1MaxViewportFraction);
  if (snap.l1Height > maxL1) out.push(finding('l1-height', `L1 zone is ${Math.round(snap.l1Height)}px > ${maxL1}px`));

  for (const c of snap.l1Controls) {
    if (c.slot == null) out.push(finding('undeclared-control', `"${c.name}" is on the first screen but belongs to no declared slot`));
  }

  // A string is a repeat when it is ON L1 and painted again anywhere on the first screen. Rows of
  // one list legitimately share a title ("Replied on the ticket" × 4 events) — not a repeat.
  const counts = new Map<string, { text: string; n: number; onL1: boolean }>();
  for (const t of snap.texts) {
    const key = norm(t.text);
    if (key.length < budget.duplicateMinChars) continue;
    const hit = counts.get(key) ?? { text: t.text, n: 0, onL1: false };
    hit.n += 1;
    hit.onL1 ||= t.zone === 'l1';
    counts.set(key, hit);
  }
  for (const { text, n, onL1 } of counts.values()) {
    if (n > 1 && onL1) out.push(finding('duplicate-text', `"${text.slice(0, 60)}" is on L1 and painted ${n}× on the first screen`));
  }

  for (const t of snap.texts) {
    if ((t.zone === 'l1' || t.isLabel) && BANNED_FIELD_LABELS[norm(t.text)]) {
      out.push(finding('field-label', `visible label "${t.text}"${t.zone === 'l1' ? ' on L1' : ''}`));
    }
  }

  for (const t of snap.targets) {
    if (t.width < budget.minTargetPx || t.height < budget.minTargetPx) {
      out.push(finding('tap-target', `"${t.name}" hit box ${Math.round(t.width)}×${Math.round(t.height)}px`));
    }
  }
  return out;
}

/** The four lists the owner reads (and the skill works through), in this order. */
export function disclosureLists(findings: readonly DisclosureFinding[]): Record<DisclosureRemedy, DisclosureFinding[]> {
  const lists: Record<DisclosureRemedy, DisclosureFinding[]> = { delete: [], simplify: [], move: [], enlarge: [] };
  for (const f of findings) lists[f.remedy].push(f);
  return lists;
}
