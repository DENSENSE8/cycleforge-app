/**
 * The right-rail PUSH contract, pinned at the source.
 *
 * `RightRailHost` renders a non-modal occupant as an in-flow column so the work
 * surface reflows BESIDE it (`source-of-truth.md` → Right-rail modality). Three
 * things about that are invisible until an operator hits them, so they are
 * asserted here rather than left to a browser run:
 *
 *  1. **The host snaps width instantly** — Unbox `StationDisplaysPushColumn` /
 *     `ContextPanelLayout` twin. No `motionRole.push.rail` width tween on desk
 *     open ↔ park (`display/motion-crossfade.md`).
 *  2. **Occupants that must NOT push say so explicitly.** The station benches
 *     already push their right edge with `StationDisplaysPushColumn`; a second push
 *     mechanism on one edge is the exact collision the right-rail store exists
 *     to prevent. This list only ever SHRINKS — an entry leaves when the
 *     edge-ownership question is settled for that surface, never because a
 *     refactor lost the prop.
 *  3. **Width pressure never selects the float.** The derived fit geometry
 *     lives in `frame.ts`; it is not a breakpoint that changes shell grammar.
 *
 * Run: `npx tsx --test src/components/right-rail/right-rail-push.guard.test.ts`
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../../..');

function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), 'utf8');
}

/** Strip comments so a prop named in prose never satisfies an assertion. */
function code(rel: string): string {
  return read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

const HOST = 'src/components/right-rail/RightRailHost.tsx';

/**
 * Occupants frozen to the float, each with the reason recorded at its call site.
 * Keep this list in step with the `push={false}` props themselves — the test
 * below walks both directions, so a stale entry and a missing prop both fail.
 *
 * An entry names the file that DECIDES the float, which is not always the file
 * that registers. `SupportContextDetailPanel` has two hosts with opposite
 * answers — Unbox nests it inside an `StationDisplaysPushColumn`, `/support` gives it the
 * edge outright — so its `push` is a required prop and the decision moved up to
 * `SupportTicketDetail`, the host that nests. The panel itself left this list
 * because its edge ownership was settled, not because a refactor lost the prop.
 */
const FLOAT_ONLY: readonly string[] = [
  // Station edge — `StationDisplaysPushColumn` already pushes it on /unbox, /triage, /testing.
  'src/components/station/ReceivingDetailsStack.tsx',
  'src/components/sidebar/TestingSidebarPanel.tsx',
  'src/components/support/zendesk/chat/SupportTicketDetail.tsx',
  'src/components/receiving/workspace/ReceivingAuditRail.tsx',
  'src/components/receiving/workspace/SendPhotoNoteRail.tsx',
  'src/components/receiving/workspace/line-edit/MovePhotosBetweenPoRail.tsx',
  // Ambient chat with its own flush-right dock geometry.
  'src/components/assistant/AssistantProvider.tsx',
];

describe('right-rail push — the host', () => {
  it('snaps the push column instantly — never a layout tween or spring', () => {
    const src = code(HOST);
    assert.ok(
      src.includes('data-right-rail-mode="push"'),
      'push branch must stay marked for frame / e2e',
    );
    assert.equal(
      /motionRole\.push\.rail/.test(src),
      false,
      'desk push must snap like Station Displays — no push.rail width tween',
    );
    assert.equal(
      /framerPresence\.detailStackPush/.test(src),
      false,
      'push must not opacity-presence the column joining the flow',
    );
    assert.equal(
      /type:\s*['"]spring['"]/.test(src),
      false,
      'a spring would rubber-band the width every sibling lays out against',
    );
  });

  it('routes overlay presence through the reduced-motion bridge', () => {
    const src = code(HOST);
    // Overlay (modal / intake / assistant) still fades; push does not.
    assert.ok(src.includes('useMotionPresence'), 'overlay presence must go through the bridge');
    assert.ok(src.includes('useMotionTransition'), 'overlay transitions must go through the bridge');
    assert.ok(
      src.includes('framerPresence.detailStackOverlay'),
      'overlay branch keeps the x-slide overlay preset',
    );
  });

  it('keeps the overlay x-slide OFF the push branch', () => {
    const src = code(HOST);
    // Push is a plain <aside> with style.width — overlay alone owns motion.aside.
    assert.match(src, /data-right-rail-mode="push"/);
    assert.equal(
      /pushPresence\s*=\s*useMotionPresence\(\s*framerPresence\.detailStackOverlay/.test(src),
      false,
      'the push branch must never take the overlay preset (x: 48)',
    );
  });

  it('keeps width decisions in frame.ts instead of hardcoding a viewport breakpoint', () => {
    const src = code(HOST);
    // A literal like `1440` / `1024` here would drift from `frame.ts`'s arithmetic.
    const literals = src.match(/\b(?:9\d{2}|1[0-9]{3})\b/g) ?? [];
    assert.deepEqual(
      literals,
      [],
      `RightRailHost hardcodes viewport-sized literals (${literals.join(', ')}). ` +
        'The inline pressure decision belongs to resolveRightRailFrame.',
    );
  });

  it('keeps the click-off dismiss layer OUT of push mode', () => {
    // `closeOnOutsideClick` mounts a `fixed inset-0` catcher. Under push that
    // would blanket the very surface the push exists to keep live.
    assert.ok(
      /showDismissLayer[\s\S]{0,400}!isPush/.test(code(HOST)),
      'the dismiss layer must be gated off while pushing',
    );
  });
});

describe('right-rail push — occupants frozen to the float', () => {
  for (const file of FLOAT_ONLY) {
    it(`${file.split('/').pop()} opts out explicitly`, () => {
      const src = code(file);
      assert.ok(
        src.includes('push={false}') || src.includes('push: false'),
        `${file} is registered as float-only but no longer passes push={false} — ` +
          'a refactor dropped it, or it was converted without updating this guard.',
      );
    });
  }

  it('no OTHER occupant has quietly opted out', () => {
    // The default is push. An occupant that floats must be a reviewed entry
    // above, not a prop someone added in passing.
    const { readdirSync } = require('node:fs') as typeof import('node:fs');
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const e of readdirSync(resolve(ROOT, dir), { withFileTypes: true })) {
        if (e.name.startsWith('.') || e.name === 'node_modules') continue;
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) walk(rel, out);
        else if (e.name.endsWith('.tsx') && !e.name.includes('.test.')) out.push(rel);
      }
      return out;
    };
    const optOuts = walk('src').filter((f) => {
      const src = code(f);
      return (
        (src.includes('push={false}') || src.includes('push: false')) &&
        // Direct registrants, plus the one panel whose hosts decide its edge —
        // otherwise a host could opt out through that indirection unreviewed.
        (src.includes('DetailStackRailRegistrar') ||
          src.includes('useRegisterRightPanel') ||
          src.includes('SupportContextDetailPanel'))
      );
    });
    const unlisted = optOuts.filter((f) => !FLOAT_ONLY.includes(f));
    assert.deepEqual(
      unlisted,
      [],
      `These occupants opt out of the push without a reviewed entry:\n  ${unlisted.join('\n  ')}\n` +
        'Add them to FLOAT_ONLY with the reason, or let them push.',
    );
  });
});
