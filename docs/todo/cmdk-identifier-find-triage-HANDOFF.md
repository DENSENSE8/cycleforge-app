# Handoff — ⌘K identifier find mode: triage + paint metrics

**Copy everything below the line into a fresh Claude Code / Cursor session.**
Repo: `cycleforge-app` · stay on the checkout's branch · attach to the user's
dev server on **`:3050`** (never start/restart/kill it).
**Do not edit this handoff file** as part of the implementation.

**Companion triage UI (open in the browser):**
[`cmdk-identifier-find-triage.html`](./cmdk-identifier-find-triage.html)
— full dogfood checklist (smoke set + orders + tracking + serials + carton/PO
+ nav controls). Tick Find mode / rows / route per token; capture FCP · LCP ·
DCL · load via the Console probe; export CSV/JSON when done.

---

You are an agent in the Cycle Forge monorepo with **fresh context**.

## Mission

Verify **⌘K identifier find mode** end-to-end on the dogfood tenant (org 1),
then fix any display or routing regressions you find. Use the HTML triage file
as the operator runbook and metrics log — do not invent a second checklist.

## What already shipped (do not re-build)

- Query shape forks the palette in [`CommandBar.tsx`](../../src/components/CommandBar.tsx):
  - **Words / empty** → nav mode (spine + child pages + optional search)
  - **`looksLikeIdentifier(q)`** → find mode (nav hidden; `SearchResultRow` triage;
    See-all / Enter → `commitIdentifierFind`)
- Shared commit SoT: [`src/lib/search/commit-identifier-find.ts`](../../src/lib/search/commit-identifier-find.ts)
  (`resolveSearchOrder` → cache seed → `/search?sel=order:{id}` or stay on miss).
  Header find ([`GlobalFindCombobox`](../../src/components/search/GlobalFindCombobox.tsx))
  uses the same helper.
- Guards: `cmdk-identifier-find.guard.test.ts`, `cmdk-owner.guard.test.ts`
  (⌘K still sole owner — **never** advertise ⌘K on `GlobalHeaderSearch`).
- E2E seed: `tests/e2e/cmdk-palette.spec.ts` (identifier → Find group, no Child pages).

## Dogfood org

- UUID: `00000000-0000-0000-0000-000000000001` (USAV dogfood / org 1)
- App: `http://localhost:3050` (user's running server)

## Live identifiers (queried 2026-08-07)

Paste these into ⌘K. Expected: find mode (no spine titles), triage rows, correct commit.

### Order numbers → resolve / order feedback
| Token | Notes |
|---|---|
| `04-15010-43987` | eBay · pk `9764` → expect `/search?sel=order:9764` |
| `25-14974-12795` | eBay · pk `9763` |
| `112-0967880-0063458` | Amazon · pk `9762` |
| `24-14988-37590` | eBay · pk `9760` |

### Tracking (order-linked) → resolve to order feedback
| Token | Expect |
|---|---|
| `1Z2CR6440313394349` | ORDER hit / resolve → `/search?sel=order:8708` |
| `382953491540` | ORDER hit / resolve → `/search?sel=order:8745` |

### Tracking (carton / inbound)
| Token | Carton pk |
|---|---|
| `1ZY228K59091544852` | `51134` |
| `1Z97659574638386` | `51132` |
| `9434608106245425179772` | `50610` |

### Serials → unit triage (not nav titles)
| Token |
|---|
| `070022z60891065ae` |
| `055436943440841ae` |
| `051353921430379as` |
| `256806-1319` |

### Carton / PO
| Kind | Token |
|---|---|
| Carton pk | `51134`, `51132`, `51107` |
| PO | `113-3321199-5857825` |
| PO | `8212977846788387` |

**Smoke order:** `04-15010-43987` → `1Z2CR6440313394349` → `070022z60891065ae` → `1ZY228K59091544852`.

## Pass criteria (per selection)

1. **Find mode chrome** — typing the token shows a **Find** group; spine section
   headings / **Child pages** are absent.
2. **Rows** — hits render via `SearchResultRow` (dropdown density), not bare nav
   `CmdRow` page titles.
3. **See-all / Enter** — for order/tracking identifiers that resolve: navigates to
   `/search?sel=order:{id}` (not `/shipping/orders?search=…`, not blank `/search?q=`).
4. **Miss** — palette stays open; no gray `/search?q=` shell.
5. **Word control** — typing `receiving` (or similar) still shows spine nav
   (regression check that find mode does not stick).
6. **Paint** — record FCP / LCP / DCL / load for the **destination** page after
   commit (HTML harness). Flag LCP > 4s on warm cache as a follow-up, not a
   block, unless the surface fails to paint primary content (feedback shell /
   carton / unit).

## Triage harness

Open locally (file:// is fine):

```text
docs/todo/cmdk-identifier-find-triage.html
```

Workflow baked into the HTML:

1. Set base URL (`http://localhost:3050`).
2. For each case: **Open ⌘K path** (instructions) or **Open direct URL**
   (feedback / browse deep link).
3. On the destination tab, paste the **metrics probe** (Copy probe button) into
   DevTools → Console. It `postMessage`s back to the harness when opened via
   the harness, and always copies JSON to the clipboard.
4. Mark display pass/fail + notes; export CSV when done.

## Out of scope

- Header find hotkey / “Search (⌘K)” microcopy on the header icon
- Removing word-query search from CommandBar (Phase 7 consolidation)
- Changing `looksLikeIdentifier` unless a live token falsely stays in nav mode

## Done when

- HTML triage log is filled for the smoke set (or defects filed with token +
  expected vs actual URL + paint JSON).
- Any routing/display bugs found are fixed; `npm run verify` green.
- Do **not** raise knip / DS ratchet baselines to pass.
