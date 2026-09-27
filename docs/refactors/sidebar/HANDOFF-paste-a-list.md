# HANDOFF — Paste a list: batch identify in ⌘K and in Find

**Paste everything below the rule into a fresh session pointed at
`/home/michaelgarisek/Projects/cycleforge-lanes/prod`.** Written 2026-09-27.

---

You are adding **paste a list** to CycleForge: an operator pastes many
identifiers at once (order numbers, tracking numbers, serials, SKUs, FNSKUs, one
per line), and gets one row per line telling them what each one is and where it
lives. The backend exists and works. It has had no UI since 2026-09-27, when the
old identify pop-up at the top of the sidebar was replaced by the global ⌘K
button.

It lands in two places, sharing one component:

1. **⌘K palette** (`src/components/CommandBar.tsx`): global, any page.
2. **Find** in the contextual sidebar (`src/components/sidebar/contextual/NavFind.tsx`):
   the `F` field under the global search, scoped to the page you are on.

## Read first

1. `AGENTS.md`: probe only `http://localhost:3050`, lane unit `cycleforge-lane@prod`,
   `pnpm verify:fast` before done.
2. `src/lib/identify/schema.ts`: the contract (below).
3. `src/app/api/identify/route.ts`: `POST` body `{ q, context? }`; `GET ?q=&context=&limit=`
   is the same call for probes.
4. Design laws: `node tools/design-mcp/ds.mjs contract "find hotkey search result row"`,
   then read `src/design-system/pinned.json` → `NavFind`, `KeyboardKey` (HOTKEY
   FIRST: glyph → keycap → text), `SearchResultRow` (the one result row: do not fork it).
5. Another session is editing the data table (`src/components/outbound/**`,
   `src/components/unshipped/**`, `src/components/tables/**`). Do not touch those.

## The contract (exists, do not change it)

`POST /api/identify` `{ q: string, context?: '<pageId>' | '<pageId>.<viewId>' }`:

- `q`: one identifier per line. Limits: `IDENTIFY_MAX_LINES` 50,
  `IDENTIFY_MAX_LINE_CHARS` 256, `IDENTIFY_MAX_INPUT_CHARS` 20 000. Past 50 lines the
  response sets `truncated: true`.
- `context`: ranks the caller's scope first, and sets `inContext` on candidates.
  Shipping contexts: `outbound.exceptions`, `outbound.po`, `outbound.pick`,
  `outbound.triage` (To ship), `outbound.shipped`.
- Response (`IdentifyResponseSchema`):
  - `mode`: `'batch'` when there is more than one line.
  - `lines[]`: one per input line:
    - `input`
    - `mode`: `single` (one exact unique hit: open it) · `list` · `none`
    - `tokens`, `filters.brands`, `filters.conditions`
    - `candidates[]`: each has `kind`, `entityId`, `title`, `subtitle?`,
      `brand?`, `matchedOn {field, token}`, `href` (opens the record in its page
      and view), `actions[]`, `stage` (`exception | picking | to_ship | shipped |
      receiving | null`), `inContext`.
  - `truncated`
- Click telemetry: `POST /api/search/opened` `{ query, entityType, entityId }`,
  fire-and-forget (`keepalive`). Every identify call is already logged server-side.

Client fetchers: the two used to live in `src/lib/nav/context/http-client.ts` and were
deleted with the old pop-up. Re-add them there:
- `identify(q, { context, signal })`: POST, parse with `IdentifyResponseSchema`,
  throw `NavHttpError` when not ok.
- `logSearchOpened({ query, entityType, entityId })`: POST, `keepalive`, swallow errors.

## One component: `PasteListResults`

New file `src/components/search/PasteListResults.tsx`. It takes `{ text, context?,
onOpen(line, candidate) }` and runs `identify` through react-query:
- key `['identify', context ?? null, text]`
- debounce 200 ms
- `staleTime` 10 s

Behaviour:

- **Header row.** "`N` lines · `M` found · `K` not found", plus a **Copy results** button.
  Copy puts TSV on the clipboard: input, kind, title, stage, absolute URL.
- **One block per input line:**
  - The input in mono, faint.
  - Then the candidates as `SearchResultRow density="dropdown"`. A `single` line
    shows its one hit lit; a `list` line shows ranked hits, with `inContext` first
    and an "In this view" chip; a `none` line shows "Not found" in amber.
  - A stage chip per candidate from `stage`, reusing the view glyphs in
    `src/components/sidebar/contextual/nav-view-icons.ts`: exception → AlertTriangle,
    picking → PackageSearch, to_ship → Truck, shipped → PackageCheck.
- **Keyboard:** ↑/↓ moves across all candidates of all lines, Enter opens,
  ⌘/Ctrl+Enter opens in a new tab, Esc closes.
- **Truncated:** show "Only the first 50 lines were checked" when `truncated`.
- **Open:** `logSearchOpened`, then `router.push(candidate.href)`.

## ⌘K: where it plugs in

`CommandBar.tsx` uses cmdk `CommandInput` (`onValueChange={setQuery}`), which is a
single-line `<input>`. **A pasted list loses its newlines** in an `<input>`, so:

- Add an `onPaste` handler on `CommandInput`. If
  `event.clipboardData.getData('text')` contains a newline and has at least 2
  non-empty lines, `preventDefault()`, keep the full text in new state
  `pastedList`, and switch the palette into **list mode**.
- **List mode:**
  - The input shows a chip "`N` lines pasted ×", where × clears it.
  - `CommandList` renders `<PasteListResults text={pastedList} context={currentContext} />`
    in place of the normal groups.
  - `currentContext` comes from the page's `NavContext`
    (`useNavContext(useCurrentNavPath())` in
    `src/components/sidebar/contextual/useNavContext.ts`): use
    `${page.id}.${activeItem.id}` when a view is lit, else `page.id`.
- **Single-line paste and typing** behave as today (`/api/global-search`); do not
  change that path.
- **Discoverability:** add a static palette row "Paste a list… `⌘V`" in the empty
  state. It focuses the input and shows the hint "one per line".
- Mind cmdk's own filtering: render the list-mode results outside cmdk's filter
  (`shouldFilter={false}` on the dialog while in list mode) so every line shows.

## Find: where it plugs in

`NavFind.tsx` `FindWell` is a plain `<input type="search">` that narrows the
on-screen list through the desk store (`useDeskSearch(pathname)`).

- Add an `onPaste` handler with the same multi-line rule. On a multi-line paste,
  do **not** write the text into the desk store (a 30-line string would empty the
  list). Instead open a **popover anchored under the Find well**. Use the existing
  `Popover` primitive from `@/design-system/primitives`, which the old pop-up used,
  placement `bottom-start` and width about `22rem`. Inside it, render
  `<PasteListResults text={pasted} context={`outbound.<viewId>`} />`.
- The well shows a chip "`N` lines" with ×; Esc or × closes the popover and
  restores the well.
- A single-line paste stays today's behaviour (it filters the list).

## Do not

- Do not add a third search surface: only ⌘K and Find get list mode.
- Do not fork `SearchResultRow`.
- Do not write pasted multi-line text into the desk store or any URL param.
- Do not change the identify contract. If a field is missing, add it to
  `src/lib/identify/schema.ts` with an `identify.test.ts` case.

## Acceptance (run all, report evidence)

1. **Global list mode.** On `:3050`, press ⌘K and paste 5 lines: a real order
   number, a real tracking number (take one from `/shipping/shipped`), a SKU, a
   serial, and `ZZZ-NOT-REAL`. You get 5 blocks, the last one "Not found", and the
   header reads `5 lines · 4 found · 1 not found`. Enter on a hit opens its `href`,
   and a `POST /api/search/opened` fires (check the request log).
2. **Find list mode.** Paste the same 5 lines into Find (press `F` first) on
   `/shipping/orders`. The popover opens, the list is **not** emptied, and hits in
   the To ship view carry "In this view" and sort first.
3. **Single-line unchanged.** One tracking number typed into ⌘K still uses
   `/api/global-search` exactly as before; one order number typed into Find still
   filters the list.
4. **Limit.** Paste 60 lines: the "Only the first 50 lines were checked" note
   shows.
5. **Copy results.** It yields TSV with 5 rows.
6. **Checks.** `npx tsc --noEmit -p . ; echo exit=$?`, `pnpm verify:fast`, a
   screenshot of each surface, and `node tools/design-mcp/ds.mjs contract "paste a
   list"` returns the law you add.
7. **Pin the law.** Add a `PasteListResults` entry to `src/design-system/pinned.json`:
   `useWhen` "paste a list, batch identify, many order numbers, bulk lookup";
   `doNot` covers no third surface and no desk-store writes; `law` names the two
   mount points and the `onPaste` rule. Validate the JSON.
