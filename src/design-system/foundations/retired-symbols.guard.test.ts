/**
 * Guard — retired design-system symbols must not return in shipped code
 * (DS fork-consolidation program — Phase 1, slices 1a + 1d / D4 + D12).
 *
 * ## Why a source-text scan and not a dependency-cruiser ban
 *
 * D12 sanctions either "a matching `dependency-cruiser` ban OR a guard
 * `doesNotMatch(/Symbol/)`". For SYMBOL-level retirement, the guard is strictly
 * more capable: dependency-cruiser reasons over the import GRAPH, so it can only
 * flag a re-created MODULE PATH — but a retired symbol (`parkRail`,
 * `salesCartStore`) reappears as an in-file declaration inside a module that
 * still exists, which the graph never sees. A comment-aware identifier scan
 * catches BOTH a re-created module and a re-added symbol, runs inside the verify
 * `src/**` sweep with zero wiring, and needs no install. (A dependency-cruiser
 * module-path tripwire + a `jscpd` clone baseline remain separate Phase-1 items:
 * they need a shared-config edit / a network install — see the program PLAN §2
 * 1a/1b.)
 *
 * ## The contract
 *
 * Each entry is VERIFIED (0 live *code* references today — the only residuals are
 * doc comments that explain the retirement, which this guard strips before
 * scanning) and cites the rule that retires it. This is the D12 prose↔code parity
 * for the retirement claims: a "deleted/retired X" rule with a real enforcement.
 *
 * Shrink-only: `maxLiveRefs` may only DECREASE. A symbol that still has residual
 * live refs is a ratchet toward 0 — never a baseline raised to make a re-fork
 * pass. Add a verified retirement to `RETIRED`; never remove the enforcement.
 *
 * Deliberately NOT in `RETIRED`: `ContextualSelectionBar` (the LIVE multi-select
 * SoT, 13 consumers — `display/workbench.md`), `MobileSelectionBar` (no evidence
 * it ever existed). The program PLAN listed both under 1a; both are stale.
 *
 * Run: node --import tsx --test src/design-system/foundations/retired-symbols.guard.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');

interface RetiredSymbol {
  /** The identifier that must not reappear in shipped code. */
  symbol: string;
  /** When it was retired (civil date, or `—` if predating the log). */
  since: string;
  /** The rule that retires it + what to compose instead — the D12 prose link. */
  retiredBy: string;
  /** Shrink-only ceiling of live code refs. 0 = fully retired. Never raise. */
  maxLiveRefs?: number;
}

const RETIRED: RetiredSymbol[] = [
  {
    symbol: 'ToolbarSearchToggle',
    since: '2026-08-03',
    retiredBy:
      'source-of-truth.md → Workbench chrome scoped search — deleted; compose TechRailSearchBar (always-open field).',
  },
  {
    symbol: 'UnboxProcedureRail',
    since: '2026-08-02',
    retiredBy:
      'source-of-truth.md → Right-rail modality — the ambient always-on right-edge procedure region was retired within a day; the checklist is a Displays leaf.',
  },
  {
    symbol: 'parkRail',
    since: '2026-08-05',
    retiredBy:
      'source-of-truth.md → Right-rail modality / Frame column budget — the park-rail rung is retired; do not reintroduce parkRail.',
  },
  {
    symbol: 'salesCartStore',
    since: '2026-08-02',
    retiredBy:
      'counter cart is CounterDraft.retailLines; salesCartStore.ts was deleted 2026-08-02 and must not return (counter-transaction-types.ts).',
  },
  {
    symbol: 'StationWorkbenchShell',
    since: '—',
    retiredBy:
      'display/station-workbench.md → Hard Never — used max-w-3xl; compose StationWorkbench + STATION_WORKBENCH_* instead.',
  },
  {
    symbol: 'RecordPaneHeader',
    since: '—',
    retiredBy:
      'source-of-truth.md / right-rail-inspector.md — the desk order inspector is DeskRailChromeRow + index→leaf, not the retired RecordPaneHeader identity ladder.',
  },
  {
    symbol: 'GridFieldsMenu',
    since: '2026-08-02',
    retiredBy:
      'source-of-truth.md → Grid column visibility — deleted; the one door is GridColumnGutter → GridColumnDetailsPanel.',
  },
];

/** Recursively collect shipped `.ts`/`.tsx` under src (skip tests + node_modules). */
function walkSrcFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      walkSrcFiles(p, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\.(ts|tsx)$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

/**
 * Strip block + line comments so a retired symbol NAMED in a doc comment (which
 * documents the retirement — a good thing) does not count as a live reference.
 * The `[^:'"\`\\]` guard keeps `://` in URLs/strings from being read as a line
 * comment. A re-introduced symbol is always CODE (import / JSX / call), never a
 * bare comment, so comment-stripping cannot hide a real re-fork.
 */
function stripComments(src: string): string {
  const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, '');
  return noBlock.replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

// Walk + scan ONCE; test all symbols per file.
const scanned = RETIRED.map((e) => ({ ...e, re: new RegExp(`\\b${e.symbol}\\b`), hits: [] as string[] }));
const GUARD_REL = relative(ROOT, join(SRC, 'design-system/foundations/retired-symbols.guard.test.ts'));
for (const file of walkSrcFiles(SRC)) {
  const rel = relative(ROOT, file);
  if (rel === GUARD_REL) continue; // the registry naturally names each symbol
  const code = stripComments(readFileSync(file, 'utf8'));
  for (const s of scanned) if (s.re.test(code)) s.hits.push(rel);
}

describe('retired design-system symbols stay retired (1a + 1d)', () => {
  for (const s of scanned) {
    const max = s.maxLiveRefs ?? 0;
    it(`${s.symbol} — 0 live code refs (retired: ${s.since})`, () => {
      assert.ok(
        s.hits.length <= max,
        `${s.symbol} reappeared in ${s.hits.length} shipped file(s) (max ${max}): ${s.hits.join(', ')}.\n` +
          `It is retired — ${s.retiredBy}\n` +
          `Compose the SoT (node scripts/sot-lookup.mjs "${s.symbol}"), do not re-fork it.`,
      );
    });
  }

  it('registry is honest — no duplicates, every entry cites a retiring rule', () => {
    const seen = new Set<string>();
    for (const e of RETIRED) {
      assert.ok(!seen.has(e.symbol), `duplicate registry entry: ${e.symbol}`);
      seen.add(e.symbol);
      assert.ok(e.retiredBy.length > 10, `${e.symbol} needs a retiredBy citation (the D12 prose link)`);
    }
  });
});
