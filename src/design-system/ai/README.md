# AI design system — `@/design-system/ai`

The AI surfaces' own system, separate from the triage/ops system (Kinetic
Ledger): one calm column of prose, one distinct hue, soft large corners,
gentle depth, Motion (`motion/react`) + Motion+ movement. Spec: operator
interview 2026-09-26 (calm & premium; iridescent accent on AI activity only). `/ai-chat` is the
first surface on it. **Token values are provisional** — they live in ONE file
(`tokens.ts`) so the look can be re-tuned without touching components.

## Files

| File | Owns |
|---|---|
| `tokens.ts` | The SoT: `AI_PALETTE` (light + dark), `AI_RADIUS`, `AI_TYPE`, `AI_SPACE`, `AI_ELEVATION`, `AI_NEUTRAL_REMAP`; `aiSystemCssText()` → `<style id="app-ai-system">` (injected by `app/layout.tsx`) |
| `classes.ts` | Class recipes (`AI_COLUMN_CLASS`, `AI_COMPOSER_DOCK_CLASS`, `AI_USER_BUBBLE_CLASS`, `AI_CARD_CLASS`, `AI_CHIP_CLASS`, `AI_STEP_ROW_CLASS`, …) — static strings of AI utilities |
| `motion.ts` | `aiTransition` (near-critically-damped springs, `visualDuration`), `aiPresence`, `aiGesture`, `AI_COMPOSER_LAYOUT_ID`, `AI_PHASE_SCRAMBLE_DURATION`; re-exports the reduced-motion bridge (`useMotionPresence` / `useMotionTransition`) |
| `AiSurface.tsx` | Root of an AI surface: `data-ai-surface` + one `LayoutGroup` |
| `AiComposer.tsx` | The input: auto-growing field + one action row (Enter sends, Shift+Enter breaks); `onKeyDown` runs first (`preventDefault()` consumes the key), `overlay` floats above the field |
| `AiTurn.tsx` | Entrance wrapper for a transcript row |
| `AiTurnActions.tsx` | The icon row under a turn (Copy · Regenerate · 👍 · 👎; Copy · Edit on a bubble). Fades in on hover / focus-within of a `group/turn` host, always shown on touch; per-action `state` (`busy` spinner → `done` ✓ / `error` ✕) and `pressed` for toggles. `useAiActionStates()` holds those states and times the ✓ / ✕ flash |
| `AiArtifactCard.tsx` | Compact clickable card (title · kind · count); a skeleton while `pending` |
| `AiIris.tsx` | The iridescent activity set: `AiIrisSpinner`, `AiShimmer`, `AiIrisRing` |
| `AiSidePanel.tsx` | The right panel: absent until something is open in it, docks (wide) or overlays (narrow), × / Esc close; `actions` slot before the × |

## Tokens → utilities

`tokens.ts` renders CSS vars; `tailwind.config.mjs` binds them (twMerge groups
in `src/utils/_cn.ts`):

| Axis | Vars | Utilities |
|---|---|---|
| Neutrals | `--ai-{canvas,surface,sunken,hover,ink,muted,faint,line,line-strong,solid,solid-ink,user,user-ink,scrim}` — aliases of the theme's `--ds-color-*` roles, so they follow light / dark / every palette | `bg-ai-*`, `text-ai-*`, `border-ai-*`, `ring-ai-*` |
| Iridescent accent | `--ai-iris-{1..4}` (light + dark stops) → `--ai-iris-{linear,sweep,conic}` | `bg-ai-iris`, `bg-ai-iris-sweep`, `bg-ai-iris-conic` — AI ACTIVITY ONLY, via `AiIrisSpinner` / `AiShimmer` / `AiIrisRing` |
| Radius | `--ai-radius-{control,chip,step,card,panel,bubble,composer}` (8 · 12 · 12 · 16 · 16 · 16 · 20px) | `rounded-ai-*` |
| Type | `--ai-text-{greeting,prose,title,prose-sm,label}` (+ leading / tracking / weight) | `text-ai-greeting`, `text-ai-prose`, … |
| Space | `--ai-{column,gutter,turn,panel}` | `max-w-ai-column`, `px-ai-gutter`, `gap-ai-turn`, `w-ai-panel` |
| Elevation | `--ai-shadow-{card,card-hover,composer,panel}` | `shadow-ai-*` |

The neutral aliases are declared on `:root` and again on `[data-ai-surface]`,
so an AI surface inside a task-mode region follows that region's neutrals.
Iris stops and shadows flip on `html[data-color-scheme='dark']`. State tones
(success / warning / danger) stay the theme's.

## Using it

No frame: the page area is the scrollport and the column is centred in it.
Chatting, the composer docks to the viewport bottom (`AI_COMPOSER_DOCK_CLASS`,
sticky over a canvas fade) and the transcript scrolls under it. The composer
shell is the only rounded surface around the conversation; answers are plain
prose, the operator's turns soft bubbles.

```tsx
import { AiSurface, AiComposer, AiTurn, AI_COLUMN_CLASS, AI_COMPOSER_DOCK_CLASS, AI_USER_BUBBLE_CLASS } from '@/design-system/ai';

<AiSurface className="flex h-full">
  <div className="flex h-full min-w-0 flex-1 flex-col overflow-y-auto">
    <div className={cn(AI_COLUMN_CLASS, 'flex flex-1 flex-col gap-ai-turn')}>
      <AiTurn className="flex justify-end"><div className={AI_USER_BUBBLE_CLASS}>…</div></AiTurn>
    </div>
    <div className={AI_COMPOSER_DOCK_CLASS}>
      <div className={AI_COLUMN_CLASS}><AiComposer value={draft} onChange={setDraft} onSubmit={send} /></div>
    </div>
  </div>
</AiSurface>
```

- Prose: `MarkdownRenderer variant="ai"` (answers) / `"ai-bubble"` (the operator's turn).
- Never type a hex, a px radius, a px size or a spring inline — add a role here.
- Never reuse triage chrome (`cornerClass`, `INSTRUMENT_*`, `text-role-*`, `StationComposerHost`) on an AI surface.

## Motion rules

- Springs with a slight bounce (0.15–0.25) over 200–400ms; every state change moves.
- Only transform + opacity animate. Layout moves (composer centre → bottom,
  column re-centre beside the panel) are Motion `layout` animations gated by
  `layoutDependency`, so a streaming transcript never re-measures.
- Reduced motion: pair presets with `useMotionPresence` / `useMotionTransition`
  (travel stripped, fade kept); pass `layout={reduced ? false : …}`.
- Motion+ (`@/design-system/motion/plus`): `ScrambleText` drives the live
  thinking phrase (`AI_PHASE_SCRAMBLE_DURATION`).
- Activity loops (iris spin, shimmer sweep) animate `transform` on a
  pre-painted gradient layer; reduced motion keeps the colour, stops the loop.

## Discoverability

design-mcp answers from `tools/design-mcp/design-mcp.profile.json`, which this
worktree links from the main checkout. Registering this system there means an
`ai` entry in `extraAxes` over `tokens.ts` / `classes.ts` / `motion.ts` (the
`uses` prose per export) and a `primitiveHomes` entry for this folder
(`match: "\\.tsx$"`), so `ds_tokens({ axis: "ai" })` and `ds_contract` list it.
