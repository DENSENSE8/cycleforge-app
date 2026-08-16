---
name: add-guard
description: Pick the right enforcement layer when asked to "add a guard" or lock an invariant. Use before writing any new *.guard.test.ts or source-text assert. Forbids readFileSync + regex on .tsx. Decision ladder — depcruise, ESLint AST, TS construction, DOM tests.
user-invocable: true
argument-hint: "<invariant> (e.g. \"no IconButton in entity-context\", \"carton bar full-height cells\")"
---

# Guard authoring — decision ladder

When asked to enforce an invariant or "add a guard", pick the tier. **Raw string
regex on `.tsx` source (`readFileSync` + `assert.match` / `doesNotMatch`) is
forbidden.** That is the 271-guard stall: false greens (alias, `<button className="h-7">`),
false reds (`split('testid')`, `border-l-0`).

Read this skill, then edit the named SoT file. Do not add a law to `AGENTS.md`.

---

### Tier 1 — Import and module boundaries

**When:** A module must not import another (deprecated primitive, feature must
not touch internals, layer wall).

**Tool:** `.dependency-cruiser.cjs` (`forbidden` array).

**Pattern:**

```js
{
  name: 'no-iconbutton-in-station-context',
  severity: 'error',
  comment: 'Carton strips use StationContextIconCell / StationContextClaimCell (h-full). IconButton is a fixed box.',
  from: { path: '^src/components/station/entity-context/' },
  to: { path: 'IconButton' },
}
```

Barrel imports (`@/design-system/primitives`) may not resolve to the file path.
Pair Tier 1 with Tier 2 `no-restricted-imports` `importNames` when the ban is a
named export from a barrel.

---

### Tier 2 — Syntax and prop bans

**When:** Ban a JSX tag, a prop, or an import name. AST, not text.

**Tool:** `eslint.config.mjs` (flat config). Scoped `files` glob. Use
`no-restricted-imports` for named imports. Use `no-restricted-syntax` only
inside the **existing** `src/**/*.{ts,tsx}` block — a second
`no-restricted-syntax` on overlapping files **replaces** the first.

**Pattern (import name, scoped):**

```js
{
  files: ['src/components/station/entity-context/**/*.{ts,tsx}'],
  languageOptions: {
    parser: tsParser,
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
  rules: {
    'no-restricted-imports': ['error', {
      paths: [
        {
          name: '@/design-system/primitives',
          importNames: ['IconButton'],
          message: 'Use StationContextIconCell / StationContextClaimCell (h-full). Not IconButton.',
        },
        {
          name: '@/design-system/primitives/IconButton',
          message: 'Use StationContextIconCell / StationContextClaimCell (h-full). Not IconButton.',
        },
      ],
    }],
  },
}
```

---

### Tier 3 — Geometry and layout (by construction)

**When:** A row must not wrap, cells must share height, slots must align.

**Tool:** TypeScript props + a cell that owns the class. Do not expose open
`className` / `children` that can break the strip.

**Pattern:** `StationContextIconCell` / `StationContextClaimCell` in
`src/components/station/entity-context/StationContextActionCell.tsx`.
Callers pass `ariaLabel` / `onClick` / `testId`. Height lives on
`STATION_CONTEXT_ACTION_CELL_CLASS` / `STATION_CONTEXT_CLAIM_CHROME_CLASS`.

Do not rewrite public station APIs into an `actions[]` bag unless the user
asks. Constrain the **internal** face.

---

### Tier 4 — Behavior, state, DOM

**When:** A click updates status, `aria-pressed` flips, a label is visible.

**Tool:** Mount the tree. Prefer `@testing-library/react` **if it is a
dependency**. This repo may not have it — do not add it as a side effect of
a guard. If RTL is missing, use an existing mounted test runner, or stop at
Tiers 1–3.

**Pattern (only when RTL is installed):**

```ts
import { render, screen } from '@testing-library/react';
import { CartonContextCard } from './CartonContextCard';

it('claim is a full-height button', () => {
  render(/* minimal wired card */);
  const claim = screen.getByTestId('carton-context-claim');
  expect(claim.tagName).toBe('BUTTON');
  expect(claim.className.split(/\s+/)).toContain('h-full');
});
```

Assert the rendered node. Never `readFileSync` the `.tsx`.

---

### Prompt shape

> Add a guard so `IconButton` is never used in `src/components/station/entity-context/*`
> and carton-bar actions stay full-height. Follow the Guard Authoring Policy.

Tier 1 and/or 2 for the import. Tier 3 for the cell. No new `*.guard.test.ts`
that reads source text.
