# Pattern evolution — compose → grow the SoT → compound

The one composition discipline. Summarized in root [`AGENTS.md`](../../AGENTS.md); this file holds the
detail and rationale.

House rules name **which pattern family** to use; they do not freeze primitives forever.
**"Compose, don't invent" means don't invent *beside* the SoT — not "never improve the SoT."**

The user prompt is a **floor, not a ceiling**: on any UI / styling / layout / component / motion touch,
scan siblings + `@/design-system/**` + golden pages for a stronger *house* pattern before implementing.

A genuinely different job / region contract earns a **new sibling that composes the shared primitive** —
that is growth (Always), not a fork. The fork ban targets duplicating a primitive for the **same** job;
it never blocks serving a new one. When jobs differ, add the sibling and share the primitive underneath.

## Always

1. **Compose first** from the named registry / SoT when it fits.
2. **Grow the SoT** when it is wrong or weaker than a stronger sibling — especially single-consumer /
   low-blast-radius primitives (one strip, one page).
3. **Promote, then compose** — improve the registry so the *next* caller inherits the better pattern.
4. Pair every hard "don't" with a concrete "do" (prefer / extend / import X) — bare prohibition lists
   cause conservative half-fixes.
5. **Read/work pairs share the read model + atoms only.** Carton **read** (`/carton`) vs Unbox
   **work**: never require shared layout panels or identity cards. A new assembly for the read job is
   correct. Anti-pattern name: **lobotomized work chrome** (work panels with edits stripped).
   Photos on the read surface use the gallery viewer SoT (`usePhotoGallery` + `PhotoViewerPortal`) —
   never a second page-local photo UI. Work escape = one quiet `openInUnboxHref` control; never
   repeated `"Open in Unbox"` marketing CTAs on findings. Recipe: `display/carton-read.md`.
6. **Recommend even when you only implement the asked slice** — a short note:

   ```markdown
   ### Compound opportunities
   - Do now (in scope / low blast radius): …
   - Promote to DS next (2+ call sites): …
   - Deferred (ask first / multi-page): …
   ```

## Ask first

- Public API changes to a shared primitive used by **many** call sites.
- Migrations, security, tenant scoping, status-machine / audit / search waists.
- Introducing a **second** visual or domain language without merging or deleting the old one.
- Expanding beyond the asked surface solely to migrate other call sites (recommend first).

## Never

- Fork a **page-local** parallel primitive (`function SectionCard`, second KPI shell, new search
  engine, raw status `UPDATE`) — compose the shared one and grow it instead. *(A genuinely different
  job may add a **new sibling that composes the same primitive** — that's growth, not a fork.)*
- Leave **two shapes for the same job** after a polish pass when unifying the single-consumer SoT is
  free — unify them. *(Two shapes for two genuinely **different** jobs / region contracts is correct —
  don't collapse them just to satisfy this line.)*
- Encode a net-new architecture **only** in prose before it exists in code — build the better SoT,
  then document it.
- Import a **foreign aesthetic** that fights Kinetic Ledger tokens / region contracts. "Better" =
  stronger *within* Cycle Forge's DS family, not a different product.

## After a correction or a paid miss

Fix the **SoT / registry primitive** over a page-local patch; capture a **general** principle (not just
the incident) in the right `.claude/rules/` file; prune redundant always-on prose.

Hard correctness (tenant GUC, `transition()`, secrets, search waist) stays restrictive via SoT +
hooks/tests; **taste and composition** stay recipes with an evolution path.

## Documentation shape

Decision tables beat architecture essays. Progressive disclosure: root = map + hard laws;
`.claude/rules/` = load when the task touches that domain; skills = multi-step playbooks.

Full scan/recommend method: [`ui-design-system.md`](ui-design-system.md) + the `improve-ui` skill.
