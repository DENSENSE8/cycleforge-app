# Omni-Command Composer

The ONE field on the Warehouse OS default screen (`AssistantFeed`, inside the
sunken well). It replaces the plain textarea with a Lexical editor that speaks
the operator's grammar: identifiers chip, actions run, prose talks to the
assistant — and a scanner gun lands in the same field with the same outcomes.
"One field" is the law (HANDOFF-ai-centre): no second search input, no second
composer, ⌘K stays the launcher's.

## Trigger vocabulary

| Trigger | Domain | Behaviour |
|---|---|---|
| `#` | orders | typeahead over the org's orders (`/api/global-search`, entityType `order`) |
| `@` | users | **reserved** — classified, empty results, no directory yet |
| `/` | actions | typeahead over `src/lib/composer/actions.ts` — the SAME destinations the launcher opens (T11/R2: one index, two mouths) |
| *(bare)* | orders | an identifier-shaped token (has a digit or a dash) is the scanner path — no sigil required |

A bare word without a digit or dash (`hello`) is prose, never a lookup.

## Pattern routing — one orders table

eBay (`/^\d{2}-\d+-\d+$/`) and Amazon (`/^\d{3}-\d+-\d+$/`) shapes are
recognised via the `src/utils/order-platform.ts` SoT and drive the chip's
platform label. Routing filters/boosts the lookup — it never fans out to
per-marketplace tables. Lexical's `useBasicTypeaheadTriggerMatch` is
deliberately NOT used: its punctuation class includes `-`, which would kill
every marketplace id at the first dash. The trigger match is a custom regex
over the trailing token.

## Deterministic auto-commit

A chip appears only when the token is a **complete identifier that resolves to
exactly one row**. Completeness is decided by the exact resolver
(`commitIdentifierFind` → `resolveSearchOrder` → `GET
/api/orders/lookup/:token`), where `order_id` is unique per org — so "complete
and unique" and "exact lookup hit" are the same statement. A still-open prefix
(`04-`, `QA-TEST-`) never chips: grammar short-circuits a trailing `-`, and a
prefix can never exact-resolve. The typeahead may show prefix matches; only
selection commits them.

The domain half is `src/lib/composer/` — `grammar.ts` (classification, shapes),
`actions.ts` (the `/` registry), `resolve.ts` (`shouldAutoCommit`,
`resolveAutoCommitHit` with an injectable resolver) — DB-free and covered by
`composer.test.ts` (`npx tsx --test`).

## Contextual hydration

Committing a chip is an OS event, not a navigation. `useShell.onComposerCommit`:

- **order** — paints a feed summary line (order # · title · platform), opens
  the orders tile (`openTile('orders')` → left-rail row + narration), and
  additionally dispatches `dispatchOpenShippedDetails(order, 'queue')` for any
  mounted listener. The resolve seeds the TanStack search-order cache
  (`commitIdentifierFind`), so whatever reads that key next paints warm.
- **action** — runs the launcher-equivalent destination (session/table tile or
  tool panel).
- **miss** — the feed narrates `No order matched "…"` (Enter-committed only;
  passive typing just shows an empty typeahead).
- **prose** — `sendToAssistant`.

## Display

- Chips render inline in the editor (`.occ-chip`: platform label + id), as a
  Lexical `DecoratorNode` (`EntityChipNode`).
- The typeahead is an attached listbox of the same control: rendered inline
  under `.occ-root` inside `.feed-entry`, absolutely positioned above the
  field — never a floating instrument portalled to `document.body` (I6).
- Instant mount, zero geometry animation (M1). Colour transitions only.
- The composer never unmounts: the well is permanent, so it stays visible
  through rail/tool-panel/tile state.

## Enter

1. Typeahead open → Enter selects the highlighted hit (the composer's own
   HIGH-priority handler bails while the menu is open).
2. Shift+Enter → newline.
3. Content is a single identifier-shaped token → commit it: exact hit chips
   and hydrates; miss clears the token and narrates.
4. Otherwise → the prose goes to the feed (`sendToAssistant`) and the field
   clears.

## Hardware wedge

`useFindFieldScan` attaches to the contenteditable (its ref is `HTMLElement`
now). Characters are never prevented; a claimed burst's terminator is stopped
before Lexical's Enter, the typed-in suffix is stripped from the editor, and
the token goes through the same commit: unique complete scan → chip + feed +
tile; miss → the token lands as plain text so the typeahead can see it. An
unclaimed burst (a token `decodedHandle` doesn't know) still commits through
the Enter path's identifier arm — same outcome, no raw-digit chat line.

## Serving

This lane runs on the worktree dev server at `:3051` (operator-owned — never
start/kill it). `scripts/electron-dev.mjs` probes `:3051` first, then `:3050`;
`pnpm desktop:dev:os` pins the desktop shell to `:3051`.

## Tests

- Unit (DB-free): `npx tsx --test src/lib/composer/composer.test.ts`
- E2E (real QA-org data, no mocked lookups):
  `PW_BASE_URL=http://127.0.0.1:3051 npx playwright test tests/e2e/omni-command-composer.spec.ts --project=qa-desktop`
  Fixtures come from `QA_FIXTURE_ORDERS` (`src/lib/tenancy/qa-org.ts`); pks are
  resolved through `/api/orders/lookup/:orderId` at runtime, never hardcoded.
