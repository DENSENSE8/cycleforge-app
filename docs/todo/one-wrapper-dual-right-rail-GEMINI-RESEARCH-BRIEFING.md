# Research briefing — One right-edge wrapper, and a second rail beside it for side-by-side record work

**For:** Gemini Pro (deep research)
**From:** Cycle Forge engineering
**Date:** 2026-08-19
**Subject:** For a dense B2B **reseller / warehouse-ops SaaS** on ~1440–1920px desktops, what is the **2024–2026 industry-standard** way to (A) collapse several right-edge panel hosts into **one wrapper an operator learns once**, and (B) let a second panel open **beside** the first — two record panes side by side — for comparing and editing two listings at the same time? When is side-by-side the right answer versus a center split, tabs, or a detached window?
**Status:** OPEN — no house decision. This brief exists to produce one.

**Hard framing rule for your answer:** Compare and contrast **only against industry standards** — named products, published design-system docs, WMS / marketplace-seller / IDE / DAM practice, citable HCI research. **Do not** cite, defend, or reconcile against this product's internal design constitution, region contracts, "source of truth" files, AGENTS rules, or house naming. §2 is **empirical current state** an engineer measured, not law you must preserve. Your output will be used to **rewrite** those house rules; treating them as constraints defeats the brief.

**Two deliverables, kept separate.** The simplification (A) and the side-by-side capability (B) are related but not the same question, and a good answer may adopt one and reject the other.

---

## 0. Method — read before answering

### 0.1 Your job (five deliverables)

1. **Industry pattern survey (2024–2026).** How do mature products expose a right-edge detail/inspector panel when the app has *several different kinds* of right-edge content (record detail, reference/tool column, AI assistant, bulk-selection actions)? One host or several? Name products, cite primary sources, state the dominant pattern and when minority patterns win.
2. **Side-by-side taxonomy.** For "operator needs two records visible at once," classify the shipped industry mechanisms and score each for a 1440px desk: second right pane · center split · tabbed rail · detached/second window · full-screen compare view · overlay diff. For each: what task shape it serves, what it costs in width, how state and focus are managed, and its known failure modes.
3. **Candidate architectures scored** (§4) against this product shape. Pick one default with defended switching conditions.
4. **Width arithmetic verdict.** Using §2.3's measured constants, state plainly at which viewport widths each candidate is honest, and what a product should do *below* that width. A recommendation that does not fit 1440 must say so and name the fallback.
5. **Principles pack (industry language only).** Named design principles this product should adopt — each with a one-sentence rule, the layer that owns it, and an acceptance criterion an engineer can verify in a browser. Write them to stand alone; they will replace prior internal wording.

### 0.2 What this brief is NOT

- Not a visual skin or brand exercise.
- Not "merge everything for DRY" — §2.4 records a prior decision that separation won on real evidence; your job is to test it against industry, not to assume either way.
- Not mobile/RF handheld layout (out of scope; the phone is a separate shell).
- Not a build estimate.
- Not about what goes *inside* a panel (index→leaf navigation, fact rows) — that is settled elsewhere. Focus on **hosts, count, placement, and width**.

### 0.3 The operator, stated concretely

Small reseller ops (1–15 people). A staffer sits at a ~1440px laptop or ~1920px desk monitor. Their day is a dense queue table or a scan bench; they open a record to read or edit it. The **specific unmet need driving this brief**: comparing two marketplace listings — reading one while editing the other — e.g. matching a new intake against an existing listing, or reconciling two near-duplicate SKUs.

---

## 1. The two questions

### Q1 — One wrapper

Today several distinct right-edge experiences exist with different shells, dismiss gestures, keyboard chords, and width memory. The ask: **one wrapper**, so an operator learns a single right-edge grammar (open, resize, park, close) regardless of what is inside it.

**What we need from you:** does industry converge on one host with content variance, or on separate hosts per job? What is the evidence? Where a product unified, what did it have to give up (per-context keyboard, per-context persistence, differing modality)? Where a product kept them separate, what tells the user which is which?

### Q2 — A second rail beside the first

The ask: when a staffer opens a second record while one is already open, the two panels sit **side by side** — "like a dual desktop display" — rather than the second replacing the first.

**What we need from you:** is a second *right-edge* pane the industry answer to side-by-side record work, or do mature products solve this in the center, in tabs, or in a second window? Under what conditions does each win? Be specific about **editing** two records simultaneously versus **reading** two.

---

## 2. Empirical current state (measured, not law)

### 2.1 The frame

A desktop route is up to four columns, left to right:

| Column | Role | Behaviour |
|---|---|---|
| App navigator spine | Global nav | Operator toggle; pushes |
| Context rail | Route-scoped list / recents / scan bar | Resizable, parks to a 32px icon strip |
| Center | The work — dense table, or scan bench | Elastic, but floored |
| Right edge | Record detail **or** reference tools **or** assistant | Resizable, parks to a 32px icon strip |

All columns **push** (in-flow); nothing floats over the work. Gutters between columns are `0`.

### 2.2 Two right-edge hosts exist today

1. **A desk inspector host** — one occupant at a time, chosen by priority (a picked record outranks the ambient assistant). Non-modal: no scrim, no focus trap, siblings stay clickable.
2. **A scan-station tool column** — mounted by the bench itself, exclusive within that station, with its own park/restore, its own visit history, and its own keyboard chord.

They share presentational primitives (an index→leaf stage, tokens) but not the shell, dismiss chord, or persistence.

### 2.3 Measured width constants (the load-bearing numbers)

| Constant | Value |
|---|---|
| Desk center floor | **784px** |
| Scan-bench center lock | **720px** |
| Inter-column gutter | **0px** |
| Right panel: min · default · max-pad | **360 · 420 · 960** |
| Station tool column: min · default | **280 · 420** |
| Context rail: min · default · max-pad | **300 · 360 · 760** |
| Derived: min frame for one right panel + center floor | **1144px** |

**Arithmetic the answer must confront.** At the operator's common 1440px viewport:

- One right panel at min, no left rail: `784 + 360 = 1144` ✓ (296px spare)
- **Two** right panels at min, no left rail: `784 + 360 + 360 = 1504` ✗ **exceeds 1440**
- Two right panels at min, left rail at min: `300 + 784 + 360 + 360 = 1804` ✗
- Two right panels at min, no left rail, at 1920: `1504` ✓ (416px spare)
- Two panels at *default* 420 on 1440: center would be `1440 − 840 = 600` — **184px under the floor**

So on the primary desk width, a second right rail **does not fit** without either dropping below the center floor, forcing the left rail closed, or shrinking both panels to a width where a two-column record body stops working. Say plainly which of those trades industry considers acceptable, and whether the center floor itself is the thing that should move.

### 2.4 A prior decision this brief may overturn

A 2026-08 internal review asked whether the two right-edge hosts should merge and concluded **separate hosts, thin shared waist** — sharing tokens and presentational stages but never the shell, dismiss chords, or history stacks. Stated reasons: a scan bench and a desk table have different keyboard ownership; a floor operator's muscle memory must not change because the content did; and one host with `mode=` flags accumulates branches nobody tests.

**Treat that as evidence, not authority.** If industry practice says a single host with content variance is correct and the keyboard concern is solvable, say so and show how the products that did it handle per-context input.

### 2.5 Side-by-side already exists — in the center

The product already ships a **center split** for comparison: a URL-addressable layout param opens 2 or 4 panes *in the center column*, each owning its own query, on both the orders queue and the receiving history table. There is also a **parent→child drill** (a linked two-pane view where the left pane drives the right).

This matters: the unmet need in §0.3 may already have a home, and the request for a second *right rail* may be a request for the center split to be reachable from the record panel — or for center-split panes to become **editable**, which is the part that is genuinely missing. Test that hypothesis explicitly.

### 2.6 Adjacent facts

- A **desktop shell** (Electron) exists in the codebase, so a genuinely detached second window is technically available, not hypothetical.
- Panels are **non-modal** by default: opening a record does not block the table behind it.
- Both side columns **park to a 32px icon strip** rather than disappearing, so "closed" still shows what is behind it.
- The app is multi-tenant SaaS sold to other resellers — a layout that only works on the founder's monitor is not shippable.

---

## 3. Questions to answer directly

**On simplification (Q1)**

1. Do mature products expose **one** right-edge host or several? Give the split with citations. What predicts which way a product goes — content diversity, input model, or team structure?
2. When a single host serves several content kinds, how does the user know what they are looking at, and how is per-content state (width, scroll, history, keyboard) kept from leaking between them?
3. Is "one wrapper" primarily a **code** simplification or a **user-facing** one? Where products unified the shell but kept distinct interaction contracts, was that a success?
4. What is the industry norm for right-panel **dismiss** grammar when the panel pushes rather than floats: close, park to a strip, or both? Does a parked strip earn its permanent width?

**On side-by-side (Q2)**

5. What do mature products actually ship for "two records at once"? Enumerate with citations across at least: IDEs / editor groups, design tools, DAMs / photo tools, marketplace seller consoles, PIM / catalog tools, helpdesks, EMRs (a genuinely comparison-heavy domain), and spreadsheet apps.
6. Is a **second right-edge pane** a recognised pattern at all, or do products that need side-by-side move the split into the primary work area? If the latter, why — is it width, focus management, or something else?
7. For **editing** two records simultaneously: what are the documented hazards (ambiguous focus target, save-to-wrong-record, dirty-state confusion, undo scope)? How do shipping products mitigate — explicit active-pane affordance, per-pane save, locking one pane read-only?
8. When is a **detached window** the right answer instead of a second pane? What do multi-window products do about state sync, and what breaks?
9. **Cardinality:** should a second pane be capped at 2, or generalised to N? What do products that allow N do to stop operators from destroying their own layout?
10. Below the width where two panes fit, what is the correct degradation — refuse, auto-close the left rail, shrink both panes, switch to tabs, or offer a full-screen compare view?

**On both**

11. Is there a coherent design in which the *same* wrapper serves one panel or two, so simplification and side-by-side are one feature rather than two? Or does side-by-side inherently require a second concept (a "group", a "workspace"), and is that concept worth its cost?
12. What does research say about **panel proliferation** in dense ops tools — at what point does configurability start costing throughput? Cite studies or documented product reversals, not opinion.
13. What should be **URL-addressable**? If two panes are open, is that state shareable/reloadable, and what do products that made it shareable gain?

---

## 4. Candidate architectures (score all)

| ID | Candidate | One-line |
|---|---|---|
| **A1** | **One host, one occupant** (status quo, unified shell) | Merge the shells; still exactly one right panel at a time; content varies |
| **A2** | **One host, N occupants side by side** | Same wrapper; opening a second record splits the right edge into two panes |
| **A3** | **One host + center split for compare** | Right edge stays single; comparing two records uses the existing center split, made editable |
| **A4** | **One host + detachable window** | Right edge stays single; a pane can pop out to a second window / second monitor |
| **A5** | **One host, tabbed** | Second record opens as a tab in the same panel; one visible at a time, cheap switching |
| **A6** | **Keep two hosts** (reject Q1) | Scan tool column and desk inspector stay separate; solve side-by-side only in the center |

Score each on: operator learnability · width honesty at 1440 and 1920 · editing safety with two dirty records · keyboard/focus clarity · implementation and test surface · degradation below min width · multi-tenant defensibility (works on a customer's monitor, not just ours).

State a **default** and the conditions under which you would switch.

---

## 5. Output shape

1. **Executive answer** — one paragraph per deliverable in §0.1, decision first.
2. **Pattern survey table** — product · pattern · citation · what it tells us.
3. **Side-by-side taxonomy table** — mechanism · task shape it serves · width cost · focus model · failure modes · verdict for this product.
4. **Candidate scorecard** — A1–A6 against §4's criteria, with a named winner.
5. **Width verdict** — explicit px arithmetic, per viewport class, with the degradation rule.
6. **Principles pack** — 6–12 named principles, each with rule · owning layer · browser-verifiable acceptance criterion.
7. **Anti-patterns** — the specific mistakes a team makes implementing your winner, each with the symptom an engineer would see.
8. **Open questions** — what you could not resolve from public evidence, and what experiment would resolve it.

**Evidence standard:** prefer primary sources (design-system docs, product changelogs, published research) over blog summaries. Where you infer from a screenshot or a product you cannot cite, label it inference. Where the honest answer is "industry has no dominant pattern here," say that rather than manufacturing one — that answer is directly useful, because it tells us to optimise for reversibility instead of conformity.
