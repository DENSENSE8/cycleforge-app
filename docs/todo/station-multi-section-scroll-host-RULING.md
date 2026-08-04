# Ruling — Station multi-section scroll host

**Status: RULED 2026-08-04.** Research is closed. This doc is the terminal artifact §10 of the
Gemini brief asked for — "engineers will pin only what you ratify." The two research docs stay as
provenance; this doc is the one to read for "what do I actually build."

**Inputs:**
- [`station-multi-section-scroll-host-GEMINI-RESEARCH-BRIEFING.md`](./station-multi-section-scroll-host-GEMINI-RESEARCH-BRIEFING.md) — product/UX/CSS research (Gemini Deep Research, 2026-08-04)
- [`station-multi-section-scroll-host-MOTION-FINDINGS.md`](./station-multi-section-scroll-host-MOTION-FINDINGS.md) — Motion API mechanics (validated live against `motion.dev` via the Motion+ MCP, 2026-08-04)

**Pinned into law:**
- `.claude/rules/ui-design-system.md` → **Scroll ownership** section — definite-height CSS
  contract, `layoutScroll` requirement, dual-port ban, `scroll-padding-bottom` refusal + spacer
  technique
- `.claude/rules/display/station-workbench.md` → new **Multi-section scroll host — floor
  ownership (Section Host)** section — idiom, default owner, mechanism, motion, clearance,
  minimum chrome height, focus/a11y, mobile portability

---

## What Gemini got right and is now law, verbatim in spirit

1. **Idiom:** exclusive-disclosure panel system (VS Code Panel/Secondary Side Bar; Shopify POS
   cart-vs-grid) — one floor owner above a persistent bottom action plane.
2. **Default owner:** `procedure`, never a split rest state. Items immersive is transient,
   operator-invoked (Square POS line-item overlay is the right analogy).
3. **Nested-scroll CSS contract:** `min-height: 0` on both the host and the active floor —
   correct, standard, and now the literal code block in `ui-design-system.md`.
4. **Outer port disabled in immersive mode** — confirmed, Slack/Discord precedent.
5. **Sticky is the wrong tool; spacer/padding + `justify-end` is right** — confirmed and
   strengthened (see correction below).
6. **Clearance: named fixed rem, no `ResizeObserver`** — confirmed, matches the house's existing
   leaning; `10rem` stays the shipped constant.
7. **Items-immersive compatible with "deck is hero"** as a transient mode — confirmed.
8. **A11y: keyboard-reachable trigger, no focus steal into the expanded section** — confirmed and
   sharpened (the wedge-focus rule already exists in `instrument-panel.md`; this just extends it).
9. **Mobile: same CSS contract, `100dvh`, no rewrite** — confirmed.
10. **Minimum 56px collapsed chrome, not a bare 40px strip** — confirmed (Spotify/iOS Mail
    precedent), now literal law.

## What was corrected before it went into law

1. **`scroll-padding-bottom` is not merely "fragile" — it has open, unresolved Chromium bugs on
   exactly this combination.** Verified via web search against the Chromium issue tracker:
   [40055750](https://issues.chromium.org/issues/40055750) and
   [365913982](https://issues.chromium.org/issues/365913982) both report `scroll-padding`
   corrupting `scrollIntoView`'s notion of "in view," and a
   [Playwright issue](https://github.com/microsoft/playwright/issues/3105) documents
   `scrollIntoView` failing when the target is covered by a sticky/covering element — the exact
   shape of our dock-occlusion bug. Gemini's answer #5 called this "reliably honored... with a
   severe caveat," which undersells it. **Ruling: the spacer-element technique is load-bearing,
   not a nice-to-have** — `scroll-padding-bottom` is not something the fix should depend on at
   all, even secondarily.
2. **The `layoutScroll` footnote in answer #3 was garbled in transit** (inline code appears to
   have been stripped when pasted — "must be rendered as to prevent projection math corruption"
   has no subject). Restated correctly from the Motion findings doc: the scroll element hosting
   `layout`-animated content must carry Motion's `layoutScroll` prop, full stop — this is also
   independently how a **live, pre-existing bug** on `StationWorkbench.tsx:142` gets fixed (see
   Motion findings doc §1.4), unrelated to whether the Section Host ships.
3. **The proposed 150–200ms motion duration was an unverified guess where the house already has a
   named, battle-tested number for this exact physics class.** `motionRole.push.rail`
   (`motion-crossfade.md`) is defined as a tween on `motionBezier.layout` at **0.24s**, explicitly
   for "a panel that makes room for itself... because a sibling measures against the resulting
   size" — which is precisely the Section Host's job. Minting a fresh duration for the same job
   is the "two spellings, one job" drift `motion-crossfade.md` names as the thing roles exist to
   prevent (*"A role, once adopted, is adopted EVERYWHERE its job occurs... two spellings for one
   job is exactly the 'which of these do I use?' question the role was introduced to close."*).
   **Ruling: reuse `motionRole.push.rail`'s physics; do not add a `motionRole.section.maximize`
   duration.** If, once built, the Section Host's swap genuinely doesn't read right at 0.24s,
   that's a reason to open a *new* motion-role decision with a measured comparison — not to
   silently diverge from an unverified 150–200ms guess that had no repo precedent behind it.

## Not pinned — deferred to implementation

Two items from the brief are geometry/wording calls best made against the real component, not
abstract law:

- **Where does collapsed Procedure chrome sit relative to Items when Items is immersive** (§3.3
  Q2 of the research brief) — above, below, or a thin strip. Gemini's answer didn't resolve this;
  it's a small enough call to leave to the engineer building `StationSectionHost`, informed by the
  ruled default-owner + minimum-chrome-height law above.
- **Exact spacer-element sizing** — tie it to the same clearance rem token
  (`STATION_TERMINAL_PAGER_SCROLL_CLEARANCE`), not a second constant; this is implied by the
  "clearance is one named rem" ruling above but not spelled out as its own line item.

## Independent follow-up (not gated on any of the above)

File separately: `StationWorkbench.tsx:142`'s scroll port is missing `layoutScroll` today, right
now, independent of whether/when the Section Host ships (Motion findings doc §1.4). Small, isolated
fix — do not bundle it into the Section Host PR.
