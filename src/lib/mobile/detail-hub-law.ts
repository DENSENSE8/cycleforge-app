/**
 * The mobile exoskeleton law — ONE record grammar for every scanned thing on a
 * phone (operator 2026-09-24: *"always ruled to these new rules for building
 * this like the MCP DS"*; *"a single grouping on the most top mounted then
 * grouped into exact actions like photos below a compact information display
 * on top"*).
 *
 * ```
 * MobileDetailTopBar  ‹ Back · IDENT (mono) · meta ··········· Scan
 * DetailSummaryCard   read-only; the whole card → /<entity>/[id]/info
 * DetailAck           server-stamped, dismissable
 * content             optional live working set (a location's SKUs + ± strips)
 * DetailNav           one door per exact job (Photos · Locations · …)
 * DetailDock          ≤3 verbs, one primary — OR, when the hub's job is
 *                     scanning, MobileCaptureWindow itself (lens + keyed entry)
 * /info               every fact (DetailFacts grid of DetailFact) + the ONLY edit (bar pencil)
 * /<job>              one job per screen, its own sticky job bar
 * ```
 *
 * The kit that renders it is `DetailHubScreen` (+ `DetailRecordFrame`) in
 * `src/design-system/components/DetailHubScreen.tsx`, doors come from
 * `detailDoor` (`src/lib/mobile/detail-door.ts`).
 *
 * ONE module, three consumers (the sku-identity shape):
 *   1. `detail-hub-law.test.ts` — the pure predicates, planted violations.
 *   2. `scripts/detail-hub-guard.ts` — the `Detail hub` gate in `verify:fast`.
 *   3. `ds_detail_hub` — the design-mcp face, which spawns that script.
 *
 * Pure text rules: no fs here. The guard reads files and hands this module
 * source text plus a resolver for imported mappers. Heuristic text matching,
 * not an AST — comments are stripped first so a docblock explaining a rule
 * cannot trip it.
 */

/** The kit, as served on the `detail-hub` design-mcp axis. */
export const DETAIL_HUB_KIT = [
  {
    name: 'DetailHubScreen',
    file: 'src/design-system/components/DetailHubScreen.tsx',
    role: 'The hub: bar · card · ack · content · doors · dock, plus loading / error / notice / missing faces.',
  },
  {
    name: 'DetailRecordFrame',
    file: 'src/design-system/components/DetailHubScreen.tsx',
    role: 'The frame of the entity\'s other screens (/info and each job screen): same bar and record states.',
  },
  {
    name: 'DetailSummaryCard',
    file: 'src/design-system/components/DetailSummaryCard.tsx',
    role: 'The read-only summary on top; the whole card opens /info. An entity maps onto it (RepairInfoCard).',
  },
  {
    name: 'DetailNav',
    file: 'src/components/mobile/detail/DetailParts.tsx',
    role: 'The door list — one row per exact job. Rows come from detailDoor().',
  },
  {
    name: 'detailDoor',
    file: 'src/lib/mobile/detail-door.ts',
    role: 'detailDoor(base, id, title, icon, { meta, enabled }) → the door to <base>/<id>.',
  },
  {
    name: 'DetailDock',
    file: 'src/design-system/components/DetailDock.tsx',
    role: 'The hub\'s verbs: at most three, exactly one primary. The only surface that changes the entity.',
  },
  {
    name: 'DetailAck',
    file: 'src/components/mobile/detail/DetailParts.tsx',
    role: 'Server-stamped save acknowledgement; dismissable, never a modal.',
  },
  {
    name: 'DetailFacts',
    file: 'src/components/mobile/detail/DetailParts.tsx',
    role: 'Facts on /info (and a record screen\'s facts): full-bleed DetailFact rows — mono caps label left, value right, one mode rule between rows; a DetailSectionHeading band opens each further group; copy= for identifier keys.',
  },
  {
    name: 'MobileDetailTopBar',
    file: 'src/components/mobile/redesign/MobileDetailTopBar.tsx',
    role: 'Identity bar; Back via backHref (nav-trail), the /info pencil in its right slot.',
  },
  {
    name: 'MobileCaptureWindow',
    file: 'src/components/mobile/station/MobileCaptureWindow.tsx',
    role:
      'The bottom scan surface. When a hub\'s job is scanning (serials into a visit), it IS the dock: ' +
      'the lens, its collapsed "Scan" bar to re-arm, and the keyed fallback for typing a code by hand. ' +
      'Never a Scan verb that opens it and never a second typed field beside it.',
  },
] as const;

/** At most this many verbs on a hub dock. */
export const DETAIL_DOCK_MAX_VERBS = 3;

export const DETAIL_HUB_REFUSAL =
  'Mobile exoskeleton law (operator 2026-09-24): a scanned entity\'s phone record is ONE grammar — ' +
  'DetailHubScreen with a DetailSummaryCard mapper on top (whole card → /info), DetailNav doors built ' +
  'with detailDoor(), and a DetailDock of at most three verbs with one primary. /info holds every fact ' +
  'and the only edit (the pencil in its bar). No Edit button or heading on the hub, no router Back, no ' +
  'nested <main>, no useEffect+fetch for hub data (React Query), no hand-rolled sticky dock, and never ' +
  'MobileTriagePage as a record screen. The primary record of the job being worked is never a phone ' +
  'BottomSheet: it opens as its hub route with an X back to the job; every phone sheet declares its role ' +
  'in src/lib/mobile/mobile-sheet-roles.ts and record sheets only shrink. Scanning on a phone is the ' +
  'bottom MobileCaptureWindow or nothing (operator 2026-09-25): a screen that scans mounts it as its ' +
  'bottom surface — no Scan button that opens it, no hand-rolled typed-entry bar beside it, because its ' +
  'keyed fallback already types. See src/lib/mobile/detail-hub-law.ts.';

export type DetailHubRule =
  | 'hub-missing-screen'
  | 'hub-missing-card'
  | 'hub-missing-dock'
  | 'hub-edit-affordance'
  | 'hub-heading'
  | 'hub-router-back'
  | 'hub-nested-main'
  | 'hub-effect-fetch'
  | 'hub-raw-dock'
  | 'hub-triage-page'
  | 'dock-too-many-verbs'
  | 'dock-many-primary'
  | 'info-write-control'
  | 'sheet-unclassified'
  | 'capture-scan-verb'
  | 'capture-typed-fork';

export interface DetailHubViolation {
  /** Repo-relative, POSIX separators. */
  file: string;
  line: number;
  rule: DetailHubRule;
  detail: string;
}

/**
 * Blank out comments, keeping every newline and column so line numbers still
 * point at the source. String contents are left alone (a class string is
 * exactly what some rules read).
 */
export function stripComments(text: string): string {
  let out = '';
  let i = 0;
  let quote: string | null = null;
  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];
    if (quote) {
      out += ch;
      if (ch === '\\') {
        out += next ?? '';
        i += 2;
        continue;
      }
      if (ch === quote) quote = null;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') {
        out += ' ';
        i += 1;
      }
      continue;
    }
    if (ch === '/' && next === '*') {
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) {
        out += text[i] === '\n' ? '\n' : ' ';
        i += 1;
      }
      out += '  ';
      i += 2;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

function lineAt(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i += 1) if (text[i] === '\n') line += 1;
  return line;
}

/** The balanced `(…)` / `{…}` / `[…]` span that opens at `open` (inclusive), or ''. */
export function balancedSpan(text: string, open: number): string {
  const pairs: Record<string, string> = { '(': ')', '{': '}', '[': ']' };
  const first = text[open];
  if (!pairs[first]) return '';
  const stack: string[] = [];
  for (let i = open; i < text.length; i += 1) {
    const ch = text[i];
    if (pairs[ch]) stack.push(pairs[ch]);
    else if (ch === stack[stack.length - 1]) {
      stack.pop();
      if (stack.length === 0) return text.slice(open, i + 1);
    }
  }
  return '';
}

/** `import { A, B as C } from 'x'` → { A: 'x', C: 'x' }; default imports too. */
export function importMap(text: string): Record<string, string> {
  const map: Record<string, string> = {};
  const re = /import\s+(?:type\s+)?([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
  for (const m of text.matchAll(re)) {
    const clause = m[1];
    const spec = m[2];
    const named = clause.match(/\{([\s\S]*)\}/);
    if (named) {
      for (const part of named[1].split(',')) {
        const bits = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/);
        const local = (bits[1] ?? bits[0]).trim();
        if (local) map[local] = spec;
      }
    }
    const def = clause.replace(/\{[\s\S]*\}/, '').replace(/,/g, ' ').trim();
    if (def && /^[A-Za-z_$][\w$]*$/.test(def)) map[def] = spec;
  }
  return map;
}

/** The first JSX component a slot prop renders: `card={(r) => <RepairInfoCard …` → `RepairInfoCard`. */
export function slotComponent(text: string, prop: string): { name: string; index: number } | null {
  const at = text.search(new RegExp(`\\b${prop}=\\{`));
  if (at < 0) return null;
  const span = balancedSpan(text, text.indexOf('{', at));
  const tag = span.match(/<([A-Z][\w.]*)/);
  return tag ? { name: tag[1], index: at } : null;
}

/**
 * Reads the source of an imported module (`'@/components/…'` → text), or null.
 * Supplied by the guard; tests pass a map.
 */
export type ModuleReader = (fromFile: string, spec: string) => string | null;

function rendersKit(
  file: string,
  text: string,
  name: string,
  kit: 'DetailSummaryCard' | 'DetailDock' | 'MobileCaptureWindow',
  read: ModuleReader,
): boolean {
  if (name === kit) return true;
  const spec = importMap(text)[name];
  if (!spec) return false;
  const source = read(file, spec);
  return source != null && new RegExp(`<${kit}\\b`).test(stripComments(source));
}

/**
 * Rules a HUB page (`/m/<entity>/[id]/page.tsx`) must obey. `read` resolves
 * the card / dock mappers so a thin mapper (`RepairInfoCard`,
 * `RepairWorkbenchDock`) passes when its body renders the kit.
 */
export function auditDetailHubPage(file: string, source: string, read: ModuleReader): DetailHubViolation[] {
  const text = stripComments(source);
  const out: DetailHubViolation[] = [];
  const push = (index: number, rule: DetailHubRule, detail: string) =>
    out.push({ file, line: lineAt(text, index), rule, detail });

  const screen = text.search(/<DetailHubScreen\b/);
  if (screen < 0) {
    push(0, 'hub-missing-screen', 'the hub does not mount DetailHubScreen');
  } else {
    const card = slotComponent(text, 'card');
    if (!card || !rendersKit(file, text, card.name, 'DetailSummaryCard', read)) {
      push(card?.index ?? screen, 'hub-missing-card', `card slot is not a DetailSummaryCard mapper${card ? ` (${card.name})` : ''}`);
    }
    const dock = slotComponent(text, 'dock');
    const dockIsKit =
      dock != null &&
      (rendersKit(file, text, dock.name, 'DetailDock', read) ||
        rendersKit(file, text, dock.name, 'MobileCaptureWindow', read));
    if (!dockIsKit) {
      push(
        dock?.index ?? screen,
        'hub-missing-dock',
        `dock slot is not DetailDock, MobileCaptureWindow, or a mapper over one${dock ? ` (${dock.name})` : ''}`,
      );
    }
  }

  const scan = (re: RegExp, rule: DetailHubRule, detail: (m: RegExpMatchArray) => string) => {
    for (const m of text.matchAll(re)) push(m.index ?? 0, rule, detail(m));
  };
  scan(/<Pencil\b|\bPencil\b(?=\s*[,}])|>\s*Edit\s*<|\b(?:label|ariaLabel|aria-label)\s*[=:]\s*\{?\s*['"]Edit\b/g, 'hub-edit-affordance', (m) =>
    `edit affordance on the hub (${m[0].trim()}) — the only edit is the /info bar pencil`,
  );
  scan(/<h[1-6]\b|<DetailSectionHeading\b/g, 'hub-heading', (m) => `heading on the hub (${m[0]}) — the bar carries identity`);
  scan(/\brouter\.back\(|\bonBack=/g, 'hub-router-back', (m) => `${m[0]} — Back is MobileDetailTopBar backHref (nav-trail)`);
  scan(/<main\b/g, 'hub-nested-main', () => 'nested <main> — the shell owns the landmark');
  scan(/\bMobileTriagePage\b/g, 'hub-triage-page', () => 'MobileTriagePage is a search-and-pick job screen, never a record');
  scan(/className=(?:\{`|["'])[^"'`]*\b(?:sticky|fixed)\b[^"'`]*\bbottom-0\b/g, 'hub-raw-dock', () =>
    'hand-rolled bottom bar — the hub\'s verbs are DetailDock',
  );
  for (const m of text.matchAll(/\buseEffect\(/g)) {
    const open = (m.index ?? 0) + m[0].length - 1;
    if (/\bfetch\(/.test(balancedSpan(text, open))) {
      push(m.index ?? 0, 'hub-effect-fetch', 'useEffect + fetch — hub facets read through React Query');
    }
  }
  return out;
}

/** Rules every `<DetailDock verbs={[…]}>` obeys, wherever it is mounted. */
export function auditDetailDockSource(file: string, source: string): DetailHubViolation[] {
  const text = stripComments(source);
  const out: DetailHubViolation[] = [];
  for (const m of text.matchAll(/<DetailDock\b/g)) {
    const at = m.index ?? 0;
    const verbsAt = text.indexOf('verbs={', at);
    const close = text.indexOf('/>', at);
    if (verbsAt < 0 || (close >= 0 && verbsAt > close)) continue;
    const list = balancedSpan(text, verbsAt + 'verbs='.length);
    const verbs = (list.match(/\bid:\s*['"`]/g) ?? []).length;
    const primaries = (list.match(/\bprimary:\s*true\b/g) ?? []).length;
    const line = lineAt(text, at);
    if (verbs > DETAIL_DOCK_MAX_VERBS) {
      out.push({ file, line, rule: 'dock-too-many-verbs', detail: `${verbs} verbs (max ${DETAIL_DOCK_MAX_VERBS})` });
    }
    if (primaries > 1) {
      out.push({ file, line, rule: 'dock-many-primary', detail: `${primaries} primary verbs (exactly one)` });
    }
  }
  return out;
}

/** The definition of the capture window — the one file allowed to own its keyed field. */
export const CAPTURE_WINDOW_FILE = 'src/components/mobile/station/MobileCaptureWindow.tsx';

/**
 * Rules for a phone file that mounts `<MobileCaptureWindow` (operator
 * 2026-09-25: *"scan serial number button should not be mounted to the bottom,
 * it must be using the bottom scan … display component or not using it, the
 * bottom scan mounting has the needed manual typing already"*).
 *
 * - `capture-scan-verb` — a `DetailDock` in the same file carrying a scan verb
 *   (id or label says scan). The window IS the scan surface; a verb that opens
 *   it is a second control for the one job, parked where the window belongs.
 * - `capture-typed-fork` — a text field in the same file (`TextField`,
 *   `<input`, `<Input`, `KioskEntryField`, `<textarea`). Typing a code by hand
 *   is the window's keyed fallback (its leading slot), committed through the
 *   same `onDecode`; a second field forks that path.
 *
 * Navigation verbs elsewhere ("Scan again" → `/m/scan`) are not this rule:
 * those files do not host the window.
 */
export function auditCaptureWindowSource(file: string, source: string): DetailHubViolation[] {
  if (file === CAPTURE_WINDOW_FILE || !isPhoneSheetScope(file)) return [];
  const text = stripComments(source);
  if (!/<MobileCaptureWindow\b/.test(text)) return [];
  const out: DetailHubViolation[] = [];
  for (const m of text.matchAll(/<DetailDock\b/g)) {
    const at = m.index ?? 0;
    const verbsAt = text.indexOf('verbs={', at);
    const close = text.indexOf('/>', at);
    if (verbsAt < 0 || (close >= 0 && verbsAt > close)) continue;
    const list = balancedSpan(text, verbsAt + 'verbs='.length);
    const scanVerb = list.match(/\b(?:id|label):\s*['"`]([^'"`]*\bscan[^'"`]*)['"`]/i);
    if (scanVerb) {
      out.push({
        file,
        line: lineAt(text, at),
        rule: 'capture-scan-verb',
        detail: `dock verb "${scanVerb[1]}" opens a scanner — mount MobileCaptureWindow as the bottom instead`,
      });
    }
  }
  for (const m of text.matchAll(/<(?:TextField|input|Input|KioskEntryField|textarea)\b/g)) {
    out.push({
      file,
      line: lineAt(text, m.index ?? 0),
      rule: 'capture-typed-fork',
      detail: `${m[0]} beside MobileCaptureWindow — its keyed fallback is the typed entry`,
    });
  }
  return out;
}

/** `/info`: every fact, and no write control but the one bar pencil. */
export function auditDetailInfoPage(file: string, source: string): DetailHubViolation[] {
  const text = stripComments(source);
  const out: DetailHubViolation[] = [];
  for (const m of text.matchAll(/<(Button|button|input|textarea|select|form|Switch|Checkbox)\b/g)) {
    out.push({
      file,
      line: lineAt(text, m.index ?? 0),
      rule: 'info-write-control',
      detail: `<${m[1]}> on /info — the only write control is the bar pencil (edit in a sheet)`,
    });
  }
  const icons = [...text.matchAll(/<IconButton\b/g)];
  if (icons.length > 1) {
    out.push({
      file,
      line: lineAt(text, icons[1].index ?? 0),
      rule: 'info-write-control',
      detail: `${icons.length} IconButtons on /info — one bar pencil only`,
    });
  }
  return out;
}

/** Phone files the sheet law reads: `src/components/mobile/**` and `src/app/m/**`. */
export function isPhoneSheetScope(file: string): boolean {
  return file.startsWith('src/components/mobile/') || file.startsWith('src/app/m/');
}

/** Whether this source mounts a `<BottomSheet` (comments ignored). */
export function mountsBottomSheet(source: string): boolean {
  return /<BottomSheet\b/.test(stripComments(source));
}

/**
 * The sheet-vs-screen law over the phone files that mount a `BottomSheet`:
 * each must carry a role in `roles`; a listed file that no longer mounts one
 * is stale; the `record` count is a shrink-only baseline.
 */
export function auditMobileSheets(
  sheetFiles: { file: string; source: string }[],
  roles: Readonly<Record<string, string>>,
  recordBaseline: number,
): { violations: DetailHubViolation[]; problems: string[] } {
  const violations: DetailHubViolation[] = [];
  const problems: string[] = [];
  const mounting = new Set<string>();
  for (const { file, source } of sheetFiles) {
    if (!isPhoneSheetScope(file) || !mountsBottomSheet(source)) continue;
    mounting.add(file);
    if (roles[file] == null) {
      const text = stripComments(source);
      violations.push({
        file,
        line: lineAt(text, text.search(/<BottomSheet\b/)),
        rule: 'sheet-unclassified',
        detail:
          'phone BottomSheet with no role — classify it in src/lib/mobile/mobile-sheet-roles.ts ' +
          "(edit · dock-verb · confirm · picker · linked-peek); a job's primary record is a hub route, not a sheet",
      });
    }
  }
  for (const file of Object.keys(roles)) {
    if (!mounting.has(file)) problems.push(`${file} no longer mounts a BottomSheet — drop it from MOBILE_SHEET_ROLES`);
  }
  const records = Object.keys(roles).filter((file) => roles[file] === 'record').length;
  if (records > recordBaseline) {
    problems.push(
      `record sheets rose to ${records} (baseline ${recordBaseline}) — the primary record of a job is its hub ` +
        'route with an X back, never a sheet; the baseline only shrinks',
    );
  } else if (records < recordBaseline) {
    problems.push(`record sheet retired — drop MOBILE_RECORD_SHEET_BASELINE to ${records} in the same commit`);
  }
  return { violations, problems };
}

export function formatDetailHubViolation(v: DetailHubViolation): string {
  return `${v.file}:${v.line} [${v.rule}] ${v.detail}`;
}
