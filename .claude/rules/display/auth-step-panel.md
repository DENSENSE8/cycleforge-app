# Auth / compact step panel — multi-step form motion

> **Superseded for the 2-field credential case (2026-07-26).** `/signin` no longer swaps panels.
> Both credential fields stay mounted: email is always visible and the password row **reveals**
> beneath it via `framerPresence.collapseHeight`. There is no back chip and no fixed-height
> viewport — the email field is on screen, so nothing needs to travel or be restored. See
> **[Progressive reveal](#progressive-reveal--the-2-field-default)** below; `signInStepVariants` /
> `signInStepVariantsReduced` were deleted with the last consumer.
>
> The panel-swap architecture documented in the rest of this file still applies to **genuine
> multi-step wizards** (3+ steps, or steps whose earlier input must leave the screen) — it is no
> longer the default for a 2-field sign-in.

Canonical architecture for **compact, centered multi-step forms** (sign-up, onboarding wizards)
where step 2+ may show a **back chip** above the field row.

**Inherits:** [`motion-crossfade.md`](motion-crossfade.md) (opacity+transform, `mode="wait"`, hooks bridge),
[`ui-design-system.md`](../ui-design-system.md) (Kinetic Ledger tokens). This doc is the **layout +
motion contract** for step panels only — it does not restate region-contract picker logic.

---

## Progressive reveal — the 2-field default

For a credential form of **two fields** (email → password), keep both mounted and reveal the second.

```tsx
<div className="space-y-3">
  <TextField id="email" label="Email" … />          {/* always visible */}
  <AnimatePresence initial={false}>
    {step === 'password' && (
      <motion.div
        initial={revealPresence.initial}            // framerPresence.collapseHeight
        animate={revealPresence.animate}
        exit={revealPresence.exit}
        transition={revealTransition}               // framerTransition.signInStepSlide
        onAnimationComplete={ => setSettled(true)}
        className={cn('px-1 -mx-1', settled ? 'overflow-visible' : 'overflow-hidden')}
      >
        …password field + Forgot link…
      </motion.div>
    )}
  </AnimatePresence>
</div>
```

Why this shape:

- **`collapseHeight` is the sanctioned height animation.** `motion-crossfade.md` bans animating
  layout *except* Framer `height: 'auto'` on a low-frequency expand/collapse. A once-per-visit
  password reveal qualifies; a per-keystroke or per-row toggle does not.
- **Release the clip once settled.** `TextField`'s focus affordance is an **outward** `focus:ring-2`
  (`TextField.tsx`), so a permanent `overflow-hidden` shears the glow off the password field. Clip
  only while opening, then flip to `overflow-visible`. `px-1 -mx-1` keeps the horizontal glow off the
  clip edge mid-animation. **This is the single most-repeated bug on this surface — the old
  fixed-viewport recipe hit it too (see the anti-pattern table below).**
- **No back chip, no fixed viewport height.** Both were compensating for the email field leaving the
  screen. It no longer leaves.
- **Focus the revealed field after the animation**, not during — `setTimeout(…, duration)`, `0` under
  reduced motion.

Reference: `src/components/auth/SignInAuthStepPanels.tsx`.

---

## When to use

- A **card or modal** with a **static title** and **one swapping field region** (email → password, code → new password, …).
- Step 2+ needs a **tappable back chip** (e.g. `‹ you@company.com`) — never animate the chip separately from its step.
- **Not** for workbench panes, station scan cards, or tab pagers — use `motion-crossfade.md` / `tabPagerVariants` there.

---

## Layout zones (never blend)

```
┌─ Card ─────────────────────────────────────┐
│  STATIC HEADER (never inside AnimatePresence) │
│    eyebrow + title (SignInTitle crossfade OK) │
│  space-y-2  ← tight gap header → fields      │
│  ┌─ STEP VIEWPORT (fixed height, justify-end)┐│
│  │  ONE keyed motion panel at a time        ││
│  │  email step  OR  chip + fields step     ││
│  └──────────────────────────────────────────┘│
│  STATIC CHROME (checkbox, primary CTA)       │
│  optional: messages, alternate methods         │
└──────────────────────────────────────────────┘
```

1. **Header stays outside** the step viewport — title never shares `AnimatePresence` with fields.
2. **Header → viewport** uses `space-y-2` (not `space-y-5`) inside a wrapper; card-level `space-y-5` stays for sections below the form.
3. **Step viewport** owns all step motion — fixed `height`, `flex flex-col justify-end`, `overflow-visible px-0.5`.
4. **Back chip lives inside the advanced step panel** — same `motion.div` as the fields; exits with the panel on back.
5. **Chrome below** (remember-me, submit, OAuth) stays outside the viewport.

---

## Motion contract (7 steps)

1. **`<AnimatePresence mode="wait" initial={false}>`** — exit finishes before enter; first paint is instant.
2. **Key by step identity** — `key="email-step"` / `key="password-step"` (never field-level keys).
3. **Whole panel variants** — `signInStepVariants` / `signInStepVariantsReduced` (`opacity` + small `y`; no horizontal slide, no `blur`/`scale`).
4. **`useMotionTransition(framerTransition.signInStepSlide)`** — sub-300ms ease-out; never inline durations.
5. **Fixed viewport height** — constant `height` (not `min-height` alone) so `justify-end` + `h-full` panels are stable during `wait`.
6. **Both panels** use `flex h-full w-full flex-col justify-end` — fields align to the **bottom** of the viewport; chip sits above fields inside the taller panel.
7. **Focus after enter** — `setTimeout(..., framerDuration.signInStepSlide * 1000)` on the advanced step; `0` when reduced motion.

Presets (SoT): `src/design-system/foundations/motion-framer.ts` — `signInStepVariants`, `signInStepVariantsReduced`,
`framerTransition.signInStepSlide`. Card shell mount: `framerPresence.signInCard` + `signInCardMount`. Title swap:
`framerPresence.signInTitle` + `mode="wait"`. Alternate block fade: `signInAlternateSection` + `initial={false}`.

---

## Viewport + input details

```tsx
const STEP_VIEWPORT_MIN_H = '5.25rem'; // tune to tallest panel (chip + label + input)

<div
  className="relative flex w-full flex-col justify-end overflow-visible px-0.5"
  style={{ height: STEP_VIEWPORT_MIN_H }}
>
  <AnimatePresence mode="wait" initial={false}>
    {/* one motion.div per step — h-full flex-col justify-end */}
  </AnimatePresence>
</div>
```

- **Inputs:** `focus:ring-inset focus:ring-1 focus:ring-blue-400` — inset ring avoids clip; do **not** use `overflow-hidden` on the viewport.
- **Chip button:** `self-start`, `rounded-full bg-surface-canvas`, truncate email text.
- **Extract** step UI into `*StepPanels.tsx` under `src/components/auth/` (or feature folder); page holds state + submit only.

---

## Page wrapper (sign-in reference)

```tsx
<div className="space-y-2">
  <div className="space-y-1 text-center">{/* eyebrow + SignInTitle */}</div>
  <form className="space-y-4">
    <SignInAuthStepPanels ... />
    {/* remember-me, submit */}
  </form>
</div>
```

---

## Reapply checklist (new flow)

1. Copy `SignInAuthStepPanels` → rename (e.g. `ResetPasswordStepPanels`); add/adjust step keys and fields.
2. If tallest panel height changes, update **one** `STEP_VIEWPORT_MIN_H` constant.
3. Keep header + chrome outside `AnimatePresence`; only the viewport swaps.
4. Bundle **every** step-2-only affordance (back chip, helper line) **inside** that step's panel.
5. Wire presets through `useMotionTransition` / `useMotionPresence`; add new `framerDuration.*` + `signInStep*` clones only if timing must diverge.
6. Alternate methods / OAuth: separate `AnimatePresence initial={false}`, opacity-only — never `height: 0 → auto` on mount.

---

## Anti-patterns (learned from /signin)

| Don't | Why |
|-------|-----|
| Animate chip in its own `AnimatePresence` | Layout collapse / overlap with title on back |
| `absolute bottom-full` on chip | Overlaps static header |
| `mode="sync"` / `popLayout` on fields | Locking / double-image jitter |
| Horizontal `x` slide on fields | Compounds layout shift with chip |
| `overflow-hidden` on viewport | Clips blue focus ring |
| `justify-end` without fixed viewport `height` | `h-full` children don't anchor; chip drifts |
| `blur` / `scale` on card mount | Reads as "pop" on auth surfaces |
| Separate motion per field | Staggered enter/exit jank |

---

## Do / Don't

**Do**
- One panel per step; chip inside advanced panel.
- `mode="wait"` + `initial={false}` + bottom-justified fixed-height viewport.
- `ring-inset` on inputs; `overflow-visible` on viewport.
- Named presets + motion hooks.

**Don't**
- Animate the title row with fields.
- Animate layout (`height`, `margin`) on step change.
- Fork inline motion literals — extend `motion-framer.ts`.

---

Indexed by [`../contextual-display.md`](../contextual-display.md)
