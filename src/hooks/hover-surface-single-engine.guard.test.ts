import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

/**
 * ONE hover-open engine. `src/hooks/useHoverSurface.ts` owns *when* a hover
 * surface opens/closes and *which* one may be open; callers own positioning and
 * chrome only.
 *
 * Before consolidation the carton context header alone ran four engines with
 * three different close delays (0 / 120 / 150ms), none of them a token. The
 * flashing bug that prompted this lived in the seam between two of them. A
 * fifth engine puts it straight back, so this guard fails if a hover surface
 * grows its own timers again.
 *
 * See `docs/todo/carton-context-hover-unification-GEMINI-RESEARCH-BRIEFING.md`.
 */

const ROOT = join(import.meta.dirname, '..', '..');

/** Surfaces that MUST delegate timing to the shared hook. */
const MIGRATED = [
  'src/components/ui/CopyChipHoverMenu.tsx',
  'src/components/sidebar/rail-shell/useRailHoverPreview.ts',
  'src/components/receiving/workspace/line-edit/InlinePillPicker.tsx',
  // The carton bar's identity chips (order # / tracking # / ticket) all render
  // through this one. It was missed by the first consolidation: it ran a local
  // `useState` + bare mouseenter/mouseleave with a `duration-100` fade, so it
  // never joined the registry and its menu could sit open alongside a classify
  // menu — two panels, one pointer.
  'src/components/receiving/workspace/line-edit/IdentityLinkChip.tsx',
];

const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

test('no surface mirrors lifted open-state back INTO the registry', () => {
  /**
   * Two writers for one boolean, each reacting to the other's not-yet-committed
   * value, oscillate one render out of phase — every hover on a classify pill
   * threw "Maximum update depth exceeded". Whoever owns the state owns it
   * outright: the registry drives `onOpenChange` outward, and nothing drives it
   * back in from an effect.
   */
  for (const rel of MIGRATED) {
    const src = read(rel);
    for (const effect of src.match(/useEffect\(\(\) => \{[\s\S]*?\}, \[[^\]]*\]\);/g) ?? []) {
      assert.doesNotMatch(
        effect,
        /hover\.(open|close)\(\)/,
        `${rel}: calling hover.open()/close() from an effect re-creates the two-writer oscillator. Read the registry (hover.isOpen) as the owner instead.`,
      );
    }
  }
});

test('the hover engine is the only place a hover delay is defined', () => {
  const engine = read('src/hooks/useHoverSurface.ts');
  assert.match(
    engine,
    /OPEN_MS:\s*0\b/,
    'Open must stay 0ms — a scan bench cannot afford hover-intent latency.',
  );
  assert.match(
    engine,
    /CLOSE_MS:\s*\d+/,
    'Close must stay non-zero — it is the only thing that lets the pointer cross the seam onto the panel.',
  );
});

test('migrated hover surfaces own no timers of their own', () => {
  for (const rel of MIGRATED) {
    const src = read(rel);
    assert.ok(
      src.includes('useHoverSurface'),
      `${rel} must delegate hover timing to useHoverSurface.`,
    );
    assert.doesNotMatch(
      src,
      /setTimeout\s*\(/,
      `${rel} defines its own timer. Hover timing belongs to useHoverSurface — ` +
        'a per-component debounce is how the four-engine drift started.',
    );
    assert.doesNotMatch(
      src,
      /CLOSE_DELAY_MS|OPEN_DELAY_MS|closeDelay\s*=\s*\d|openDelay\s*=\s*\d/,
      `${rel} declares its own hover delay constant. Compose HOVER_DELAYS instead.`,
    );
  }
});

test('the classify menu opens instantly and runs no appear motion', () => {
  const picker = read(
    'src/components/receiving/workspace/line-edit/InlinePillPicker.tsx',
  );
  // `modal` defaults to true on Radix Root, which puts `pointer-events: none`
  // on <body>: the trigger stops receiving pointer events, fires mouseleave,
  // the debounce closes, the pointer "re-enters" — the flashing loop.
  assert.match(
    picker,
    /modal=\{false\}/,
    'The hover-opened classify menu must be non-modal, or it flashes.',
  );

  const chipMenu = read('src/components/ui/CopyChipHoverMenu.tsx');
  assert.doesNotMatch(
    chipMenu,
    /transition-opacity/,
    'The chip hover menu must not fade in — the panel is readable the instant it exists.',
  );
});

test('the carton bar never observes the element its own decision resizes', () => {
  const layout = read(
    'src/components/station/entity-context/useCartonContextBarLayout.ts',
  );
  // Observing '[data-carton-bar-slot="classify"]' closes a feedback loop:
  // measure -> flip classifyCompact -> labels become shortLabels -> width
  // changes -> observer fires. While it flaps, pills move under a stationary
  // pointer and their menus flash.
  assert.doesNotMatch(
    layout,
    /observe\(\s*classifyEl/,
    'Observe the CONTAINER only. The classify cluster width is this hook’s output, not its input.',
  );
  assert.match(
    layout,
    /frozen/,
    'The responsive decision must be freezable while a cell owns the pointer.',
  );
});
