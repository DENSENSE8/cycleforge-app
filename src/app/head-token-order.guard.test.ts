/**
 * Head token-order guard — pins the cascade invariant the token consolidation
 * rests on (docs/todo/token-system-consolidation-plan.md §2.1).
 *
 * Three `:root` blocks compete at identical specificity: the compiled global
 * stylesheet, `<style id="app-design-tokens">`, and `<style id="app-theme-palettes">`.
 * Which one wins is decided by document order, and document order is FIXED:
 *
 *   1. Next emits `globals.css` as a `precedence`-carrying hoisted <link>.
 *   2. React flushes hoisted stylesheets BEFORE the <head>'s own JSX children.
 *   3. Neither <style> in layout.tsx carries `precedence`, so neither is hoisted.
 *
 *   ⇒ link → app-design-tokens → app-theme-palettes, always, dev and prod.
 *
 * Adding `precedence` to either <style> would hoist it and silently invert the
 * winner for every colliding name. So would enabling `experimental.inlineCss`,
 * which turns the stylesheet into an inline <style> subject to JSX ordering.
 * Both are guarded below.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { designTokenCssVariables } from '../styles/tokens';

const read = (...segments: string[]) => readFileSync(join(process.cwd(), ...segments), 'utf8');

const layout = read('src', 'app', 'layout.tsx');
const appGlobals = read('src', 'app', 'globals.css');
const styleGlobals = read('src', 'styles', 'globals.css');
const nextConfig = read('next.config.ts');

/**
 * The ONLY names allowed to be declared in both `src/styles/globals.css` and the
 * injected token block. This duplication is deliberate: the stylesheet is the
 * durable owner of the font chain (its readers — `body`, `.font-dm-sans`,
 * `fontFamily.sans` — have no fallback), and the injected copy is byte-identical
 * so retiring `src/styles/tokens.ts` is a no-op. Shrink this set as that module
 * is dismantled; never grow it.
 */
const FONT_CHAIN_EXCEPTION = new Set([
  '--font-sans',
  '--font-mono',
  '--ds-font-sans',
  '--ds-font-mono',
]);

describe('head token order', () => {
  it('renders app-design-tokens before app-theme-palettes', () => {
    const tokensAt = layout.indexOf('id="app-design-tokens"');
    const palettesAt = layout.indexOf('id="app-theme-palettes"');
    assert.ok(tokensAt > 0, '<style id="app-design-tokens"> must exist in layout.tsx');
    assert.ok(palettesAt > 0, '<style id="app-theme-palettes"> must exist in layout.tsx');
    assert.ok(
      tokensAt < palettesAt,
      'theme palettes must flush AFTER the base token block so themes win at equal specificity',
    );
  });

  it('never marks either token <style> with a precedence (hoisting inverts the cascade)', () => {
    for (const match of layout.matchAll(/<style\b[^>]*>/g)) {
      assert.doesNotMatch(
        match[0],
        /precedence/,
        `${match[0]} — a precedence prop hoists this <style> above globals.css and flips every colliding name`,
      );
    }
  });

  it('keeps globals.css an external stylesheet (no experimental.inlineCss)', () => {
    assert.match(layout, /import\s+["']\.\/globals\.css["']/, 'layout.tsx must import ./globals.css');
    assert.doesNotMatch(
      nextConfig,
      /inlineCss\s*:\s*true/,
      'inlineCss makes globals.css an inline <style> subject to JSX order, inverting the documented cascade',
    );
  });
});

describe('no token name is declared by more than one file', () => {
  const emitted = new Set(Object.keys(designTokenCssVariables));
  const declaredIn = (css: string) =>
    new Set([...css.matchAll(/^\s*(--[a-zA-Z0-9-]+)\s*:/gm)].map((m) => m[1]));

  it('src/styles/globals.css collides with the injected block only on the font chain', () => {
    const overlap = [...declaredIn(styleGlobals)].filter((name) => emitted.has(name)).sort();
    assert.deepEqual(
      overlap,
      [...FONT_CHAIN_EXCEPTION].sort(),
      'a new duplicate declaration silently loses to the injected <style> — declare it in exactly one place',
    );
  });

  it('src/app/globals.css declares no token the injected block also emits', () => {
    const overlap = [...declaredIn(appGlobals)].filter((name) => emitted.has(name)).sort();
    assert.deepEqual(overlap, [], 'app/globals.css is the entry file — it must not own token values');
  });

  it('src/app/globals.css does not redeclare theme-registry page vars', () => {
    const declared = declaredIn(appGlobals);
    for (const name of ['--background', '--foreground']) {
      assert.ok(
        !declared.has(name),
        `${name} is owned by themes/registry.ts (emitted per-palette); a static copy here is permanently shadowed`,
      );
    }
  });
});
