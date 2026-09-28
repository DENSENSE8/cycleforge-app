# HANDOFF — Simple welcome variant (keep the complex one, switchable)

Paste everything below the line into a fresh agent session in
`/home/michaelgarisek/Projects/cycleforge-lanes/prod`.

---

## Goal

Add a **simple** post-sign-in welcome alongside the existing **complex** one,
behind a switch, so the operator can compare the two live and go back to the
complex one if needed. **Do not delete or rewrite the complex animation.**
Default the switch to `simple`.

The simple welcome should feel short, calm and inviting. It greets the person
by name, then gets out of the way. It plays on every desktop sign-in and staff
switch, so it must never feel like waiting.

## Simple choreography (target: about 1.5–2.0s total)

1. **Enter (about 0–0.5s):** the avatar (staff photo, else initials, ringed in
   the staff colour) and `"{greeting}, {name}"` rise gently into the centre.
   Animate **word by word**, not letter by letter: opacity plus a small y-rise,
   with no blur. The name is in the staff colour with the existing metallic ink.
   Below it goes the soft line `"{Weekday} · N open today"`; include the count
   only when it is real (it comes from the Daily queries in the React Query
   cache, and only on Daily).
2. **Hold (about 0.5–1.3s):** hold still. The theme's background shapes may
   drift slowly.
3. **Leave (about 1.3–1.9s):** the greeting and background soften and fade away
   (opacity plus a slight scale or y). The real page, already rendered
   underneath, simply appears.

**Not in the simple variant:** the flying card, the card→search-bar morph, the
spotlight, per-region covers, arrival chips, the agenda ring, the region
readiness phases, and the letter-by-letter exit of the name.

**Kept:**
- Holiday themes (palette plus background shapes; particles allowed but calm).
- Skip on any key or pointer.
- The dev replay button.
- `onExited` fires once per mount.
- Reduced motion: opacity crossfade only, no rise.
- The static twins match the resting frame (see Invariants).

## Current architecture (read these before editing)

| File | Role |
|---|---|
| `src/components/boot/WelcomeHost.tsx` | Mounted once in the desktop shell (`src/components/layout/WarehouseShell.tsx`). Decides once on mount to play (sessionStorage `cf:boot-splash` via `consumeBootSplash()`, or `?welcome=1` on any path). Also plays in place on `WELCOME_PLAY_EVENT` (`cf:welcome-play`, from staff switch) and on `WELCOME_REPLAY_EVENT` (`cf:welcome-replay`, from the dev replay button). Renders `<WelcomeAssembly key onExited>` in a body portal and removes `#__boot_splash_pre` when mounted. |
| `src/components/boot/WelcomeAssembly.tsx` | **The complex variant** (about 1570 lines): per-letter greeting, name exits first, card narrows, card flies to the header search and morphs (radius → 0), spotlight, veils, arrival chips, agenda count and ring. **Leave it intact.** |
| `src/components/boot/welcome/motion-grammar.ts` | The only place timings live: `enter`, `exit`, `move` (spring 250/20/0.5), `settle`, `drift(periodS)`, `fall`, `charStagger`, `durationForDistance`, `reducedMotion`, `grammar(reduced)`, `PHASE` beats, `ms()`. |
| `src/components/boot/welcome/split-text.tsx` | `SplitText`: splits text into letters for animation, accessible (screen readers get one string). |
| `src/components/boot/welcome/welcome-theme.ts` | `WelcomeTheme` data and `resolveWelcomeTheme(date, override)` (PST date windows: halloween, thanksgiving, christmas, new-year, else default), `welcomePaletteStyle`, `serializeWelcomeTheme`. Test: `welcome-theme.test.ts` (run with `npx tsx --test`). |
| `src/components/boot/welcome/AmbientLayer.tsx` / `AmbientLayerStatic.tsx` | Animated and static background shapes and particles for a theme. |
| `src/components/boot/WelcomeBridge.tsx` | Static greeting frame shown on `/signin` while signing in. It must NOT import motion (critical public route). |
| `src/lib/boot-splash-script.ts` | Pre-hydration inline script: paints the same static greeting frame (from the `cf:welcome-staff` stash plus theme) before React hydrates. |
| `src/lib/boot-flag.ts` | `armBootSplash(staff: WelcomeStaff)`, `consumeBootSplash()`, `WELCOME_PLAY_EVENT`, `WelcomeStaff { name, colorHex, avatarUrl?, initials, themeId }`. |
| `src/components/boot/WelcomeReplayButton.tsx` | Dev-only replay button, bottom right, portaled above the overlay, with magnetic pull. |
| `src/app/globals.css` | The `cf-welcome-*` block: palette variables, card, frost, avatar ring, shape and particle classes. |

Arming (already correct, do not change): every desktop sign-in arms via
`src/app/signin/page.tsx` `finish()`; server-redirect sign-ins append
`?welcome=1` (`withWelcomeHandoff` in `src/lib/auth/landing-path.ts`); the staff
switch (`src/components/auth/SwitchStaffSheet.tsx`) arms and then dispatches
`cf:welcome-play`.

## What to build

1. **New `src/components/boot/WelcomeSimple.tsx`.** Same props contract as
   WelcomeAssembly (`{ onExited }`). Reuse:
   - the existing identity sources (`useAuth` name and avatar via the house
     `StaffAvatar`, staff colour via the same helper WelcomeAssembly uses);
   - `resolveWelcomeTheme` with `welcomePaletteStyle`, and `AmbientLayer`;
   - the `cf-welcome-*` classes;
   - the grammar tokens.

   Add any new simple-variant tokens to `motion-grammar.ts` (for example
   `SIMPLE = { ENTER, HOLD, LEAVE, WORD_STAGGER }`, each with a one-line
   reason). **No timing literals in the component.** Word splitting can reuse
   `SplitText` if it supports word mode (add one if needed, keeping it
   accessible), or map over words inline with one sr-only string.
2. **Variant switch**, resolved once per play in WelcomeHost:
   `type WelcomeVariant = 'simple' | 'complex'`, default `'simple'`.
   - Resolution order:
     1. `?welcomeVariant=` (dev only), persisted to
        `localStorage['cf:welcome-variant']` so it sticks across sign-ins;
     2. an existing `localStorage['cf:welcome-variant']`;
     3. the default.

     Keep the resolver in one small pure function (for example in
     `welcome-theme.ts` or a new `welcome-variant.ts`) with a short `node:test`.
   - WelcomeHost renders `<WelcomeSimple>` or `<WelcomeAssembly>` accordingly.
     Nothing else changes in WelcomeHost's triggers.
   - Dev replay button: add a small adjacent toggle, or a modifier click
     (Alt-click, or a tiny S/C chip next to it, dev only) that flips the
     variant and replays, so the operator can A/B compare in one click. Keep
     it dev only (`NODE_ENV !== 'production'`).
   - In production, allow switching only by explicit `localStorage` (no URL
     param), so a staff member can't accidentally flip it.
3. **Static twins:** the simple variant's resting frame (avatar, greeting,
   line, card, theme shapes) should match what WelcomeBridge and
   BOOT_SPLASH_SCRIPT already paint. If the simple card differs visually (for
   example no card, or a smaller card), make the twins render the simple frame
   when the variant is simple: stash `variant` in `cf:welcome-staff` at arm time
   next to `themeId` (update `WelcomeStaff`, `armBootSplash` callers in
   `signin/page.tsx` and `SwitchStaffSheet.tsx`, the Bridge, and the script).
   Prefer designing the simple frame to BE the existing resting frame, so
   nothing changes there.

## Invariants (don't break)

- Real data only: no fabricated counts or names.
- Moving elements animate transform and opacity only: no animated
  `filter`/blur, no layout thrash.
- Reduced motion: crossfade only.
- `WelcomeBridge` imports no motion.
- The boot script sets text via `textContent`, validates the colour
  (`#rrggbb`), and allows only same-origin relative avatar URLs; keep its
  trigger conditions and the `__boot_splash_pre` id.
- Motion+ may only be imported through `src/design-system/motion/plus.ts`.
- One-shot: a plain reload never replays.
- The worktree contains other people's uncommitted edits. Touch only the files
  named above and never reformat unrelated code.

## Verification

- The lane is live at `http://localhost:3050` (never another port;
  `systemctl --user restart cycleforge-lane@prod` if down).
- Throwaway Playwright script under `tests/tmp-*.mjs`:
  `import { chromium } from '@playwright/test'`, context option
  `storageState: 'tests/.auth/admin.json'` (do NOT call `/api/auth/signin`;
  it rate-limits).
- Trigger with `/?welcome=1`, `/pack?welcome=1`,
  `/?welcome=1&welcomeVariant=complex`, and
  `&welcomeTheme=halloween|christmas`.
- For flag arming, load and wait for `load` plus about 1.5s BEFORE setting
  sessionStorage (the shell hydrates late and would consume the flag on the
  previous page). Don't use `networkidle` on pages with realtime traffic.
- Assert and print:
  - simple overlay visible for about 1.5–2.0s (poll for
    `Press any key to skip` or the overlay root);
  - complex still about 5s;
  - reload plays nothing;
  - `cf:welcome-play` plays in place;
  - reduced motion (`page.emulateMedia({ reducedMotion: 'reduce' })`) exits
    cleanly;
  - no `pageerror`.

  Take screenshots at enter, hold and leave. Delete the script afterwards.
- Run `npx tsx --test src/components/boot/welcome/*.test.ts`, then
  `npx eslint <changed files>` and `npx tsc --noEmit -p .` (attribute any error
  outside your files to concurrent edits; don't fix others' files), then
  `pnpm verify:fast`, and report it red or green with attribution.
- Optional live check: `npx vercel deploy --yes` (preview only, never
  `--prod`). The deployment is protected. Fetch the automation bypass secret
  with
  `npx vercel api /v9/projects/prj_YZR1X4CjATyScn00JRQJmp1UvgMr` →
  `Object.keys(protectionBypass)[0]` into an env var (never print it), and send
  it as the `x-vercel-protection-bypass` header. The preview runs a production
  build: the dev-only `welcomeVariant` and `welcomeTheme` params and the replay
  button are inert there; use `localStorage['cf:welcome-variant']` to switch.

## Report back

Files changed, the simple timeline (token → value), how to switch variants in
dev and prod, measured durations for simple and complex, screenshot paths, and
gate results.
