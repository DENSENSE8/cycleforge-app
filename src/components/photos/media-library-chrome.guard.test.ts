/**
 * Source guard: **the Media Library is rail-less, and its scope has exactly one
 * writer.**
 *
 * `/ops/photos` ran a resident left facet rail (`PhotoLibrarySidebarPanel`)
 * until 2026-08-09. It was deleted outright — not gated, not migrated — and its
 * lifecycle scopes became Band-1 tabs (`PhotoLibraryScopeBand`).
 *
 * That reverses the 2026-07-29 ruling which put the scope control in the rail
 * and forbade one in the chrome. **The invariant it protected is unchanged, and
 * this guard is what keeps it true**: that bug was a chrome media-type dropdown
 * whose built-in rows were byte-for-byte the rail's source scopes, so two
 * controls wrote `sourceScope` and could disagree. Exactly one writer was always
 * the law; "the writer must be a rail" never was.
 *
 * Deleting the rail *first* is what made the two-writer state unreachable rather
 * than temporary — so the first thing asserted here is that nothing under
 * `src/components/photos/` can mount a sidebar again.
 *
 * The frame half (the reclaimed width actually reaching the stream, the three
 * bands stacking contiguously) is `tests/e2e/photos-railless-frame.spec.ts` —
 * geometry is measured in a browser, never inferred from source.
 *
 * SoT: `.claude/rules/display/media-library.md`.
 *
 * Run: node --test --import tsx \
 *        src/components/photos/media-library-chrome.guard.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';

import { hasSidebarContextPanel } from '@/lib/sidebar-navigation';

const ROOT = process.cwd();
const PHOTOS_DIR = join(ROOT, 'src/components/photos');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : [];
  });
}

const PHOTO_SOURCES = walk(PHOTOS_DIR).map((path) => ({
  path,
  rel: relative(ROOT, path),
  src: readFileSync(path, 'utf8'),
}));

describe('media library chrome — rail-less, one scope writer', () => {
  it('no photos component mounts a sidebar shell or a facet rail', () => {
    // Imports and JSX only — a docblock may (and should) still name the deleted
    // rail: that prose is the EVIDENCE for why the reversal was legal, and
    // banning the words would delete the reasoning with the code.
    for (const { rel, src } of PHOTO_SOURCES) {
      assert.ok(
        !/from '@\/components\/layout\/SidebarShell'/.test(src),
        `${rel} imports SidebarShell — /ops/photos is rail-less (Pattern E)`,
      );
      for (const banned of ['SidebarFacetGroup', 'PhotoLibrarySidebarPanel']) {
        assert.ok(
          !new RegExp(`^\\s*import[^;]*\\b${banned}\\b`, 'm').test(src),
          `${rel} imports ${banned} — the facet rail was deleted 2026-08-09`,
        );
        assert.ok(
          !new RegExp(`<${banned}[\\s/>]`).test(src),
          `${rel} mounts ${banned} — the facet rail was deleted 2026-08-09`,
        );
      }
    }
  });

  it('`/ops/photos` reserves no context column', () => {
    // `CONTEXT_PANEL_ROUTE_KEYS` is private; `hasSidebarContextPanel` is its
    // one public read and the same predicate `ContextPanelLayout` composes.
    assert.equal(
      hasSidebarContextPanel('/ops/photos'),
      false,
      '/ops/photos must not reserve a context panel — its scopes are Band-1 tabs',
    );
    // The route-key dispatcher must not have a branch waiting to be re-wired.
    const dispatcher = readFileSync(
      join(ROOT, 'src/components/sidebar/SidebarContextPanel.tsx'),
      'utf8',
    );
    assert.ok(
      !/routeKey === 'ops-photos'/.test(dispatcher),
      'SidebarContextPanel still branches on ops-photos',
    );
    // A sibling desk's predicate must not be widened to cover photos: it is
    // named for, and guarded as, the To-ship ORDER feed.
    const nav = readFileSync(join(ROOT, 'src/lib/sidebar-navigation.ts'), 'utf8');
    const raillessFn = nav.slice(nav.indexOf('export function isRaillessOrderFeedSurface'));
    assert.ok(
      !/photos/.test(raillessFn.slice(0, raillessFn.indexOf('\n}'))),
      'isRaillessOrderFeedSurface must not be widened to the media library',
    );
  });

  it('exactly one file writes sourceScope / imageType', () => {
    // A "writer" is something that PATCHES the URL state with the param.
    // Reading it (`sourceScopeFromFilters`) or threading it as a render prop
    // (`photo-grid-format.ts`) is fine and widespread — the 2026-07-29 bug was
    // two things that could SET it and disagree. So the predicate looks inside
    // `patch(...)` / `applySourceScopeTab(...)` calls, not for the bare word.
    const writers = PHOTO_SOURCES.filter(({ src }) => {
      if (/applySourceScopeTab\s*\(/.test(src)) return true;
      return [...src.matchAll(/\bpatch\s*\(\s*\{([\s\S]*?)\}\s*\)/g)].some(([, body]) =>
        /\b(sourceScope|imageType)\s*:/.test(body),
      );
    }).map(({ rel }) => rel);

    assert.deepEqual(
      writers,
      ['src/components/photos/PhotoLibraryScopeBand.tsx'],
      `sourceScope must have exactly one writer under src/components/photos (found: ${writers.join(', ') || 'none'})`,
    );
  });

  it('the chrome slot stacks Band 1 → Band 2 → Band 3 in that order', () => {
    const page = readFileSync(join(PHOTOS_DIR, 'PhotoLibraryPage.tsx'), 'utf8');
    const chrome = page.slice(page.indexOf('chrome={'), page.indexOf('<div className={WORKBENCH_SHEET_HOST}'));

    const order = ['PhotoLibraryScopeBand', 'PhotoLibraryWorkspaceHeader', 'PhotoLibraryHeader'];
    const positions = order.map((name) => chrome.indexOf(`<${name}`));
    for (const [i, at] of positions.entries()) {
      assert.ok(at > -1, `${order[i]} is not mounted in the chrome slot`);
    }
    assert.deepEqual(
      [...positions].sort((a, b) => a - b),
      positions,
      `chrome bands are out of order — expected ${order.join(' → ')}`,
    );

    // The host stays flush: bands stack with `gap-0` and the host owns no pad.
    assert.match(
      chrome,
      /WORKBENCH_SHEET_CHROME, 'flex flex-col gap-0'/,
      'the chrome host must stay flush (`gap-0`, no host padding)',
    );
  });

  it('Band 1 carries no trailing CTA cluster (honest absence)', () => {
    const band = readFileSync(join(PHOTOS_DIR, 'PhotoLibraryScopeBand.tsx'), 'utf8');
    assert.ok(
      !/trailing=/.test(band),
      'Band 1 has no import / add / return-to-scan CTA on this surface — do not invent one',
    );
  });

  it('the batch rail puts Delete on the action floor, never in the verb rows', () => {
    const src = readFileSync(
      join(PHOTOS_DIR, 'photo-inspector/PhotoBatchInspectorPanel.tsx'),
      'utf8',
    );
    // Comments stripped: the docblock records WHY Delete left the rows, and a
    // guard that banned the word would delete its own rationale.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

    assert.ok(
      code.includes('InspectorActionFloor'),
      'the batch rail must mount the desk Macro floor',
    );
    assert.ok(
      code.includes('InspectorFlushDelete') && code.includes('FLOOR_DELETE_PEER_CLASS'),
      'Delete is the flush trailing floor child, not a hand-rolled danger button',
    );
    assert.ok(
      !/id:\s*'delete'/.test(code),
      "Delete must not be an armed verb row — it is the floor's trailing child",
    );
    assert.ok(
      !/StationDisplaysActionFloor|UnboxDisplaysActionFloor/.test(code),
      'that is the STATION floor — a desk RightRailHost occupant composes InspectorActionFloor (C2)',
    );
    // Park is the chrome row's `→|`; the law is explicit that a dismiss never
    // sits beside a delete.
    const floorIdx = code.indexOf('<InspectorActionFloor');
    assert.ok(floorIdx > -1);
    assert.ok(
      !/onClose|DeskRailChromeRow/.test(code.slice(floorIdx)),
      'close / clear-selection must stay on DeskRailChromeRow, never in the floor',
    );
  });

  it('the surface imports no motion', () => {
    // Every file under `src/components/photos` — the picker fork and the public
    // share page included. None animates today, so the honest assertion is the
    // whole directory rather than an allowlist that would silently pre-approve
    // motion in the files it names. A file that genuinely earns motion later
    // fails here on purpose: that is a decision, not a slip.
    //
    // Comments stripped first, same as the prompt assertion below: `PhotoThumb`'s
    // docblock names `layoutId` because recording WHY the hero morph was removed
    // is what keeps it removed, and a guard that banned the word would delete
    // its own rationale.
    for (const { rel, src } of PHOTO_SOURCES) {
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
      assert.ok(
        !/@\/design-system\/motion|motion-framer|framerPresence|framerTransition|motionRole|from '(?:framer-motion|motion\/react)'/.test(
          code,
        ),
        `${rel} imports motion — /ops/photos runs on one predictable DS (2026-08-09)`,
      );
      assert.ok(
        !/\blayoutId\b/.test(code),
        `${rel} uses layoutId — list → detail is a REPLACE, not a move (display/motion-crossfade.md)`,
      );
    }
  });

  it('the armed batch rows keep the marker pulse OFF', () => {
    const src = readFileSync(
      join(PHOTOS_DIR, 'photo-inspector/PhotoBatchInspectorPanel.tsx'),
      'utf8',
    );
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
    // Operator-confirmed divergence from the Unbox golden (2026-08-10): this
    // surface runs no motion, so the armed face is chevron + track only.
    assert.ok(
      !/ARMED_CURSOR_MARKER_PULSE_CLASS|animate-pulse/.test(code),
      'the batch rail arms without a pulse — /ops/photos has no motion',
    );
    assert.ok(
      code.includes('ARMED_CURSOR_CHEVRON_CLASS') && code.includes('ARMED_CURSOR_TRACK_CLASS'),
      'the armed face still composes the shared tokens — never a page-local twin',
    );
  });

  it('inline create uses a DS input path, never window.prompt', () => {
    // Comments are stripped first: a docblock recording that a `window.prompt`
    // was replaced is the reason the fix is durable, and a guard that bans the
    // WORD deletes its own rationale. Only a live call site fails.
    for (const { rel, src } of PHOTO_SOURCES) {
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
      assert.ok(
        !/\bwindow\.prompt\s*\(|(?:^|[^.\w`])prompt\s*\(/m.test(code),
        `${rel} calls a native prompt — the house bans them (unstyleable, untestable, steals wedge focus)`,
      );
    }
  });
});
