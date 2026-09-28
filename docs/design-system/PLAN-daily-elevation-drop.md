# PLAN — Daily "Elevation Drop" welcome variant

Status: **IMPLEMENTED — REPO GATE BLOCKED**. Targeted welcome tests and changed-file
lint pass on 2026-09-27. Runtime sampling confirms the compositor transform spring,
the configured elevated hold, row cascade, replay state preservation, reload
one-shot, and reduced-motion identity transform. `pnpm verify:fast` remains subject
to concurrent failures outside this plan; current attribution is recorded below.

## Goal

A third post-sign-in welcome variant, **`elevation`**, alongside the handoff's
`simple` and the existing `complex`. On Daily it plays:

1. **Greeting** — minimal centred `"{greeting}, {name}"`: fade in, hold ~800ms,
   fade out fast.
2. **Rise + depress** — the Daily page container rises from the bottom of the
   viewport, reads briefly as elevated (scale 1.05, soft shadow, 12px corners),
   then snaps flush (scale 1, no shadow, radius 0) on a spring
   `stiffness: 300, damping: 25`.
3. **Row waterfall** — task rows are hidden during 1–2 and snap in once the
   container is flush: `opacity 0 → 1`, `y 10 → 0`, 50ms apart.
4. **Lenis** (the existing ledger-scoped instance) attaches only after 3.

On any other page, `elevation` plays phase 1 only; the page is simply there.
`simple` and `complex` are not rewritten. The complex one is never deleted.

## Repo facts (verified 2026-09-27 — don't re-derive)

| Fact | Consequence |
|---|---|
| Daily is route `/` → `src/features/home/DailyAgenda.tsx` (`DailyAgenda`). There is no `/daily` route. | All Daily edits land in `src/features/home/`. |
| `WelcomeHost` (`src/components/boot/WelcomeHost.tsx`) is mounted once in `src/components/layout/WarehouseShell.tsx` and plays over any page. It decides in a layout effect (`consumeBootSplash()` + `?welcome=1`), and replays on `cf:welcome-play` (`WELCOME_PLAY_EVENT`, `src/lib/boot-flag.ts`) and `cf:welcome-replay` (`WELCOME_REPLAY_EVENT`). | Daily can't own the greeting. The greeting→page handoff needs a shared signal (Step B1). |
| `WelcomeSimple.tsx` **does not exist yet**, and neither does the variant resolver or the variant switch. | Session A (the handoff) is a prerequisite. |
| `motion` ^12.42.2, `lenis` ^1.3.26, React ^19.2.1, Next 16.3.3. Motion may be imported from `motion/react` or `@/design-system/motion` anywhere (motion lint rules were removed 2026-09-27). `framer-motion` is banned. | Use `motion/react`. `useReducedMotion` and `usePointerFine` come from `@/design-system/motion`. |
| Lenis already exists: `src/features/home/useDailySmoothScroll.ts`, `useDailySmoothScroll(wrapperRef)`. Wrapper mode on the ledger's own scroller (never the window), `autoRaf: false`, off under reduced motion and without a fine pointer. It is called at `DailyAgenda.tsx:139` with `ledgerScrollRef`. | **No new Lenis instance.** "Init after phase 3" means gating this hook with an `enabled` argument. |
| `RecordLedger` (`src/design-system/components/record-ledger/RecordLedger.tsx`, shared DS) uses `@tanstack/react-virtual`. Each row wrapper is `absolute left-0 top-0 w-full` with `style={{ transform: translateY(item.start px) }}` and calls `renderRecord(row, open)`. Rows mount and unmount on scroll. | Never animate the virtual wrapper (its transform is the row's position). Don't touch `RecordLedger`. Row motion goes inside `AgendaRecord` (Daily-owned). Rows that scroll into view after the reveal must NOT replay the entrance. |
| `AgendaRecord` (`src/features/home/AgendaRecord.tsx`) returns `<IndustrialRecord …>` at line ~92. | Wrap that root in the row's `motion.div`. |
| `DailyAgenda` main return (line ~358) is `frame(<div data-welcome-focus…><RecordLedger …/></div>)`. `frame()` wraps `DeskPageLayout`. The composer branch (`?compose=1`, line ~305) returns `frame(…)` separately. `loading` is computed at line ~135, and `useSurfacePaintMark(DAILY_PRIMARY_PAINT_MARK, !loading)` runs at line ~136. `renderRecord` is a `useCallback` at line ~272. | The "container" is the whole `frame(…)` output of the main return. Phase 3 also waits on `!loading`. |
| `motion-grammar.ts` (`src/components/boot/welcome/`) is the only place welcome timings live (`enter`, `exit`, `move`, `settle`, `grammar(reduced)`, `PHASE`, `ms()`). | Every new duration, spring and stagger is a named token there, each with a one-line reason. No literals in components. |

## Decisions (and why)

1. **A third variant, not a rewrite.** The handoff says the simple variant never
   flies the page in, and targets 1.5–2.0s. This brief contradicts both, so it
   becomes its own variant: `type WelcomeVariant = 'simple' | 'complex' | 'elevation'`.
   It is selected through the handoff's existing mechanism
   (`?welcomeVariant=elevation` in dev, persisted to
   `localStorage['cf:welcome-variant']`; in production, `localStorage` only).
   The default stays `simple`, as the handoff says. Flipping the default is a
   one-constant change once the operator has compared them.
2. **No `animateLayout` / `layout`.** The container is in normal document flow
   from its first render. The rise is a pure transform, and there is no
   overlay→flow DOM move.
3. **Sequence imperatively on a stable component** with `useAnimationControls()`
   and awaited `controls.start(...)`. **No key remount on replay**: composer
   drafts, the open record and other React state survive. A replay only resets
   motion values (`controls.set('hidden')`).
4. **Explicit per-row delay instead of `staggerChildren` variant propagation.**
   Variant inheritance mixed with a virtualizer and imperative replay is three
   interacting behaviours, and each is easy to get wrong (later-mounting rows
   inherit `initial`, and `controls.set` propagates to children in ways that are
   hard to predict). Each row gets `delay = min(index, DROP.STAGGER_CAP) × DROP.STAGGER_S`.
   The look is the same as `staggerChildren: 0.05`, and the result is
   deterministic. Deviation from the brief's literal API: intended.
5. **Waterfall only once, bounded.** Rows animate only in phase `rows`. Once the
   phase is `revealed`, every row renders with `initial={false}`, so rows
   scrolled in later appear in place. Only the first `DROP.STAGGER_CAP` (12) rows
   stagger; rows past the cap share the cap's delay.
6. **Shadow and corners are static during flight.** The handoff allows only
   transform and opacity on moving elements. The shadow lives on an
   `aria-hidden` plate behind the container and fades by opacity only. Both
   layers carry the existing `rounded-xl` token while hidden/rising; the content
   drops that class at the `rows` boundary. No radius value is interpolated, so
   the full-page spring stays compositor-only.
7. **Hydration-safe hold, with no render-time peek.** The server and the
   hydration render always show the container flush and visible, so markup
   matches. The hide happens in `DailyEntrance`'s `useLayoutEffect` (before
   paint) via `controls.set('hidden')`. On arrival the pre-hydration boot splash
   (`#__boot_splash_pre`, removed by WelcomeHost in a passive effect, i.e. after
   paint) covers the page throughout, so there is no flash. It doesn't matter
   whether WelcomeHost's layout effect runs before or after DailyEntrance's:
   `DailyEntrance` reads the store snapshot in its layout effect AND subscribes
   there. A hold that lands later in the same commit fires the subscription
   callback, which calls `controls.set('hidden')` synchronously, still before
   paint. Deliberately **not** a render-time `sessionStorage` peek: that would
   make the first client render differ from the server markup (a style
   mismatch).
8. **Phase 3 waits on data.** Rows start when the container is flush AND
   `!loading` (the same condition that stamps `DAILY_PRIMARY_PAINT_MARK`). If the
   feeds are slow, the container lands showing the ledger's loading state, and
   rows waterfall in when the data arrives.
9. **The spring stays as specified (300/25, mass 1).** Its damping ratio is
   about 0.72, so the rise overshoots its resting place by about 1–3% of the
   travel (roughly 20px at 1080px). That's accepted. If the operator objects,
   the only sanctioned tweak is `damping: 30` on `y`.

## Timeline (tokens → values)

| Beat | Token | Value | Notes |
|---|---|---|---|
| Greeting in | `ELEVATION.GREET_IN_S` | 0.2 | opacity only |
| Greeting hold | `ELEVATION.GREET_HOLD_S` | 0.8 | |
| Greeting out | `ELEVATION.GREET_OUT_S` | 0.15 | AnimatePresence exit |
| Rise | `DROP.SPRING` | `{ type: 'spring', stiffness: 300, damping: 25 }` | y `100vh → 0` at scale 1.05 |
| Elevated beat | `DROP.HOLD_S` | 0.18 | delay before the depress |
| Depress | `DROP.SPRING` | same | scale 1.05 → 1; plate opacity 1 → 0; corners snap flush at the `rows` boundary |
| Row snap | `DROP.ROW` | `{ type: 'spring', stiffness: 500, damping: 35 }` | opacity 0→1, y `DROP.ROW_RISE_PX` (10) → 0 |
| Row stagger | `DROP.STAGGER_S` / `DROP.STAGGER_CAP` | 0.05 / 12 | max 0.6s of cascade |
| Lift scale / corner token | `DROP.LIFT_SCALE` / `rounded-xl` | 1.05 / existing token | Corner geometry is static during motion. |

Expected total is about 2.5s (1.15 greeting + ~0.8 rise/depress + ≤0.6 cascade
+ row settle). It's longer than simple's 1.5–2.0s by design; that's why this is
a separate variant.

## Session A — prerequisite: build the handoff

Build `docs/design-system/HANDOFF-welcome-simple-variant.md` as written
(`WelcomeSimple.tsx`, `SIMPLE` tokens, the variant resolver plus its
`node:test`, the WelcomeHost switch, the dev replay toggle, the static twins),
with one change: **`WelcomeVariant` includes `'elevation'` from the start.**
- The resolver accepts `elevation` from `?welcomeVariant=` (dev only) and from
  `localStorage`.
- The dev replay chip cycles S → C → E.
- In `elevation`, WelcomeHost renders `<WelcomeSimple mode="minimal">`: greeting
  line only (no avatar, no "N open today" line, no ambient shapes), using the
  `ELEVATION.GREET_*` tokens instead of `SIMPLE.*`. Skip on any key or pointer
  still works. Under reduced motion it's an opacity crossfade.
- The static twins (WelcomeBridge / boot script) are unchanged for
  `elevation`: its resting frame is the simple frame minus the avatar and line,
  and the boot splash covering the page until handover is what matters.

To keep it cheap: read only `WelcomeAssembly.tsx` lines ~560–700 (identity and
staff-colour helpers, the `onExited` pattern). Never read the whole
~1570-line file.

## Session B — the Elevation Drop

### B1. New `src/components/boot/welcome/welcome-stage.ts` (~50 lines, no React import besides types)

A module-scope external store:

```ts
export type WelcomeStage = {
  phase: 'idle' | 'greeting' | 'released';
  variant: WelcomeVariant | null;   // the variant of the current or last play
  nonce: number;                    // ++ on every hold (arrival, staff switch, replay)
  skipped: boolean;                 // true when released by skip
};
export function getWelcomeStage(): WelcomeStage;
export function subscribeWelcomeStage(cb: () => void): () => void;
export function holdWelcome(variant: WelcomeVariant): void;  // phase='greeting', nonce++, skipped=false; notify synchronously
export function releaseWelcome(opts?: { skipped?: boolean }): void; // phase='released'; notify synchronously
```

The initial state is `{ phase: 'idle', variant: null, nonce: 0, skipped: false }`.
Notifications are synchronous, and that's required: decision 7 depends on the
subscriber running inside the same layout phase.

Wiring:
- **`WelcomeHost.tsx`:** in the existing layout effect, when
  `arrivalDecisionRef.current` is true, call `holdWelcome(resolvedVariant)`
  (StrictMode-safe: the ref already guards the one-shot consume, and a second
  hold only bumps the nonce while nothing has animated yet). In `play()` (the
  event path), call `holdWelcome(resolvedVariant)` before `setPlaying(true)`.
  Nothing else changes.
- **`WelcomeSimple.tsx`:** the greeting's `<AnimatePresence onExitComplete>`
  calls `releaseWelcome()` and then `onExited()`. Skip calls
  `releaseWelcome({ skipped: true })`.
- **`WelcomeAssembly.tsx`:** one line, `releaseWelcome()` right before
  `onExitedRef.current()` (~line 638). Its choreography is otherwise untouched.

### B2. Tokens in `motion-grammar.ts`

Add the `ELEVATION` and `DROP` groups from the timeline table, `as const`, each
with a one-line reason comment. Reduced motion reuses `grammar(true)`.

### B3. New `src/features/home/DailyEntrance.tsx` (~110 lines)

Props: `{ children: ReactNode; ready: boolean; onPhase: (p: EntrancePhase) => void }`.
`type EntrancePhase = 'hidden' | 'rising' | 'rows' | 'revealed'`, exported along
with `DailyEntranceContext = createContext<{ phase: EntrancePhase }>({ phase: 'revealed' })`.

```tsx
<DailyEntranceContext.Provider value={{ phase }}>
  <div className="relative flex h-full min-h-0 min-w-0 flex-col">
    <motion.div aria-hidden initial={false} animate={plateControls}
      className="pointer-events-none absolute inset-0 rounded-xl <shadow token>"
      style={{ opacity: 0, willChange: flying ? 'transform, opacity' : 'auto' }} />
    <motion.div initial={false} animate={controls} inert={flying}
      className={cn('relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden',
        flying && 'rounded-xl')}
      style={{ willChange: flying ? 'transform, opacity' : 'auto' }}>
      {children}
    </motion.div>
  </div>
</DailyEntranceContext.Provider>
```
- Get the shadow class from `node tools/design-mcp/ds.mjs tokens shadow` (or MCP
  `ds_tokens` with axis `shadow`). Don't invent one.
- The plate is outside the container, so its shadow isn't clipped by
  `overflow-hidden`.
- The plate must follow the container's transform: animate the plate with the
  same y/scale values in the same `controls` sequence, plus its own opacity.
  Two controls objects, started together. Use a small helper
  `run(label)` = `Promise.all([controls.start(label), plateControls.start(label)])`.

Variants (identical labels on both elements; the plate adds opacity) animate one
full transform property rather than Motion's individual transform CSS variables:
```ts
hidden:   { transform: 'translate3d(0, 100vh, 0) scale(1.05)' } // plate opacity 1
elevated: { transform: 'translate3d(0, 0, 0) scale(1.05)',
            transition: DROP.SPRING }                           // plate opacity 1
flush:    { transform: 'translate3d(0, 0, 0) scale(1)',
            transition: { ...DROP.SPRING, delay: DROP.HOLD_S } } // plate opacity 0
```
Reduced motion: `hidden = { opacity: 0 }` and `flush = { opacity: 1 }` with the
crossfade from `grammar(true)`; skip `elevated`. The plate stays at opacity 0.

State machine (`phase` in `useState`, starting `'revealed'`, which matches the
server):
- **`useLayoutEffect` (once):**
  `const apply = () => { const s = getWelcomeStage(); if (s.variant === 'elevation' && s.phase === 'greeting' && s.nonce !== seenNonce.current) { seenNonce.current = s.nonce; controls.set('hidden'); plateControls.set('hidden'); setPhase('hidden'); } else if (s.phase === 'released' && phaseRef.current === 'hidden') { startRise(s.skipped); } }`.
  Call `apply()` immediately (covers a hold that landed earlier in this commit),
  then `return subscribeWelcomeStage(apply)` (covers a hold that lands later in
  this commit, a staff switch or a replay). Keep `phaseRef` in sync with
  `phase`.
- **`startRise(skipped)`:** if `skipped`, `controls.set('flush')`,
  `plateControls.set('flush')` and `setPhase('revealed')`. Skipping means "get
  me there". Otherwise `setPhase('rising')`, `await run('elevated')`,
  `await run('flush')`, then `setPhase('rows')`.
- **Phase `rows`, once `ready` is true:** start a single timer
  `ms(DROP.STAGGER_CAP * DROP.STAGGER_S + ROW_SETTLE_S)` → `setPhase('revealed')`.
  `ROW_SETTLE_S` is a `DROP` token (about 0.25) for the row spring's settle time.
  If `ready` is still false, wait (effect deps: `[phase, ready]`).
- **Unmount mid-sequence:** a cancelled flag stops the awaited chain from
  calling `setState` after unmount.
- **Client navigation to Daily with no play** (`phase` stays `'idle'` or
  `'released'` with an already-seen nonce): nothing happens. The page is
  visible, `phase = 'revealed'`.
- Call `onPhase(phase)` in an effect whenever the phase changes.

### B4. `src/features/home/DailyAgenda.tsx` (small, surgical)

- Add `const [entrance, setEntrance] = useState<EntrancePhase>('revealed');`.
- Line 139: `useDailySmoothScroll(ledgerScrollRef, entrance === 'revealed');`.
- Main return (line ~358):
  `return <DailyEntrance ready={!loading} onPhase={setEntrance}>{frame(…)}</DailyEntrance>;`.
  The composer branch (line ~305) is **not** wrapped.
- Row index for the cascade:
  `const indexByKey = useMemo(() => new Map(visible.map((r, i) => [r.key, i])), [visible]);`.
  Pass `entranceIndex={indexByKey.get(row.key) ?? 0}` into `<AgendaRecord>`
  inside `renderRecord`, and add `indexByKey` to its dependency list.
- Touch nothing else. The file contains other people's work.

### B5. `src/features/home/useDailySmoothScroll.ts`

The signature becomes `useDailySmoothScroll(wrapperRef, enabled: boolean)`.
Change the guard to `if (!enabled || !wrapper || reduceMotion || !pointerFine) return;`
and add `enabled` to the effect's dependencies. Add one doc-comment line: Lenis
waits for the welcome entrance so it can't grab scroll while the page is in
the air. Check for other callers first (`grep useDailySmoothScroll src`); as of
2026-09-27 the only caller is DailyAgenda.

### B6. `src/features/home/AgendaRecord.tsx`

Add the prop `entranceIndex?: number`. Read
`const { phase } = useContext(DailyEntranceContext);`. Wrap the
`<IndustrialRecord>` root:
```tsx
<motion.div
  initial={phase === 'revealed' ? false : { opacity: 0, y: DROP.ROW_RISE_PX }}
  animate={phase === 'rows' || phase === 'revealed' ? { opacity: 1, y: 0 } : { opacity: 0, y: DROP.ROW_RISE_PX }}
  transition={{ ...DROP.ROW, delay: phase === 'rows' ? Math.min(entranceIndex ?? 0, DROP.STAGGER_CAP) * DROP.STAGGER_S : 0 }}
>
```
- Rows mounted after the reveal: `initial={false}`, so they're already at the
  target with no animation.
- On replay, rows go back to hidden while the container is off-screen, so it
  can't be seen. The delay is only non-zero during `rows`.
- The wrapper `motion.div` must not add layout: no classes that change row
  height. Check that the row's height still equals `RECORD_ROW_PX`.

## Files touched

| File | Change |
|---|---|
| `src/components/boot/welcome/welcome-stage.ts` | new (B1) |
| `src/components/boot/welcome/welcome-events.ts` | lightweight replay event, isolated from Motion+ |
| `src/components/boot/welcome/welcome-loader.ts` | selected-variant dynamic loader and bounded arm-point preload |
| `src/components/boot/welcome/motion-grammar.ts` | `SIMPLE` (A), `ELEVATION` + `DROP` (B2), visible first-paint opacity floors |
| `src/components/boot/WelcomeSimple.tsx` | new (A), `mode="minimal"`, mount handoff, transform-only motion |
| `src/components/boot/WelcomeHost.tsx` | dynamic variant switch, static-bridge handoff, chunk-failure release |
| `src/components/boot/WelcomeAssembly.tsx` | `releaseWelcome()` plus mount handoff |
| `src/components/boot/WelcomeReplayButton.tsx` | S/C/E chip (A), lightweight shared replay event |
| `src/components/layout/WarehouseShell.tsx` | development-only dynamic replay controls |
| `src/app/signin/page.tsx` | preload selected variant at the desktop arm point |
| `src/components/auth/SwitchStaffSheet.tsx` | preload selected variant before desktop staff-switch play |
| variant resolver + `*.test.ts` | new (A) |
| `src/features/home/DailyEntrance.tsx` | compositor-only full-page transform, static corners, scoped `will-change` |
| `src/features/home/DailyAgenda.tsx` | wrap, phase state, frozen rising rows, Lenis release at `rows` |
| `src/features/home/useDailySmoothScroll.ts` | `enabled` argument (B5) |
| `src/features/home/AgendaRecord.tsx` | transform-only row `motion.div`, scoped `will-change` |

`RecordLedger.tsx`, `WelcomeBridge.tsx`, and `boot-splash-script.ts` remain unchanged.

### Rendering optimization follow-up

- Welcome variants are separate dynamic chunks. `#__boot_splash_pre` remains until
  the selected overlay reports its layout mount; a chunk failure releases the
  welcome stage instead of leaving Daily inert.
- Sign-in and staff-switch arm points warm only the persisted variant. Warm-up is
  capped at 200ms, so a cold or failed chunk cannot indefinitely delay navigation.
- Daily holds one prewarmed `renderedVisible` snapshot during the viewport spring,
  preventing query hydration and virtualizer churn from competing with the
  full-page transform. It resumes live rows at the `rows` boundary.
- The page, shadow plate, and rows write one `transform` property. `will-change`
  exists only while those elements animate and returns to `auto` afterward.
- Simple/elevation greetings start at opacity `0.1`, preserving a visible first
  frame when the welcome is the first saved-session display.
- Lenis and pointer interaction resume at `rows`, after the page is flush, rather
  than waiting for the final staggered row to settle.

## Verification

The lane is `http://localhost:3050` only. If it's down:
`systemctl --user restart cycleforge-lane@prod`.

One throwaway script, `tests/tmp-elevation-drop.mjs`, deleted afterwards.
`import { chromium } from '@playwright/test'`, context
`storageState: 'tests/.auth/admin.json'` (never call `/api/auth/signin`).
Select `elevation` with `?welcome=1&welcomeVariant=elevation`, or set
`localStorage['cf:welcome-variant']` after `load` + ~1.5s. Don't wait for
`networkidle`. Sample every ~16ms with `page.evaluate` in a rAF loop, and print:

- greeting visible → gone (target: hold about 800ms, total ≤1.2s);
- the container's computed `transform` and corner class over time: starts
  off-screen, y reaches ~0 at scale 1.05, then scale 1; `rounded-xl` is static
  during flight and absent from the content at `rows`;
- the first row's opacity passes 0.99 **after** the container's scale is 1;
- rows animated ≤ 12 and the gaps between row start times are about 50ms;
- Lenis attaches at `rows`, after the full-page spring and before the bounded
  row cascade finishes. Detection: Lenis adds `lenis` classes to its wrapper
  element. Confirm the class name once in `node_modules/lenis/dist` before asserting;
- `inert` is on the container during flight and gone at `rows`;
- after scrolling the ledger 2000px, newly mounted rows are at opacity 1 on
  their first sampled frame (no replay);
- replay: open a record (`?task=` or `?check=`), type into the search field,
  dispatch `cf:welcome-replay`. The drop plays again, and the search text and
  open record survive (no remount);
- skip (press a key during the greeting): the page is flush and revealed
  immediately, with no rise;
- reduced motion (`page.emulateMedia({ reducedMotion: 'reduce' })`): opacity
  crossfade only; transform stays `none` / identity;
- `/pack?welcome=1&welcomeVariant=elevation`: greeting only, no transform on the
  page;
- reload plays nothing; no hydration warning in the console; no `pageerror`;
- `welcomeVariant=simple` and `complex` still behave as before (durations
  printed).

Screenshots: greeting, mid-rise, elevated, flush, mid-cascade → `tests/tmp-shots/`
(deleted with the script once reviewed).

Gates: `npx tsx --test src/components/boot/welcome/*.test.ts`,
`npx eslint <changed files>`, `npx tsc --noEmit -p .`, then `pnpm verify:fast`.
Attribute failures in files outside this list to concurrent edits; don't fix
other people's files.

### Verification result — 2026-09-27 rendering pass

- `npx tsx --test src/components/boot/welcome/*.test.ts`: 17/17 pass.
- Changed-file ESLint: clean.
- rAF sampling at `:3050` observed
  `revealed → hidden → rising → rows → revealed`. The full-page transform
  travelled `1000px → 0`, held at scale `1.05`, then the flush spring crossed
  its target to `0.99813` before settling at `1`; this proves Motion retained
  spring interpolation for the full transform string rather than degrading to a
  linear tween.
- The first sampled row frame was opacity `0` at `translateY(10px)`; the last
  was opacity `1` at identity. Greeting opacity never fell below the configured
  `0.1` while mounted.
- In-place replay preserved `?welcomeVariant=elevation&check=7&q=Label`, the
  open record, and the exact search input DOM node. Reload produced zero welcome
  overlays. Reduced motion finished at `transform: none`.
- The Daily ledger exposed the Lenis classes after reveal. Scrolling requested
  `2000px`, reached the `1205px` maximum, and newly virtualized records mounted
  at opacity `1`, transform `none`, `will-change: auto`.
- Direct `tsc` was polluted by stale `.next` validator output plus unrelated
  source diagnostics. `pnpm verify:fast` regenerated route types: 10/11 gates
  passed; Typecheck alone failed at `src/lib/auth/pin.ts:159` (`TS2344`), outside
  this plan.


## Budget discipline

- Two sessions: A, then B. B needs no exploration. Open only the B files, and
  `DailyAgenda.tsx` only at lines 130–140, 270–290 and 355–360.
- Never read `WelcomeAssembly.tsx` in full or `RecordLedger.tsx` at all.
- Tune feel by changing tokens in `motion-grammar.ts` only; re-run the one
  script.
- Skip `ds_critique` and the eval cohorts; this is motion work.

## Report back

Files changed, the timeline table with the final token values, how to switch
variants (dev: `?welcomeVariant=` or the S/C/E chip; prod: `localStorage`),
measured durations for all three variants, screenshot paths, and gate results
(red or green, with attribution).
