# Handoff — finish platform Digital Link SoT · unify print encode · E2E landings

> **STATUS 2026-08-02 — A1–A3, B, C, D SHIPPED (uncommitted).** A4/A5 deliberately
> left bare, with the reason encoded in the guard's allowlist rather than in prose.
>
> | Section | State |
> |---|---|
> | **A** encode SoT | **Done.** `encodePrintMatrix` in `src/lib/qr/platform-link.ts` owns `{value, symbology, hri}`. `printReceivingLabel` · `unitLabelCore` · `printAsListedLabel` · `printTicketLabel` are thin adapters. |
> | **A2** unit fork | **Done, and it was two forks, not one.** The workspace preview inlined `qrPayload \|\| serial \|\| sku`; `productLabelCommands.productFieldsFor` *also* dropped `orgSlug`, so raw TSPL/ZPL encoded a GS1 element string while the HTML lane encoded the platform URL. Both now call the SoT. `orgSlug` threaded through Testing — the only unit caller that carries a GTIN (Prebox / multi-SKU / bulk deliberately encode a bare unit id, so they were already correct). |
> | **A3** as-listed | **Folded into the SoT, still bare.** `/m/l/*` is a proxy *rewrite* onto a staff page: minting a URL would put a customer's phone on `/signin`. Ship the landing, then flip the kind — one edit. |
> | **A4/A5** ticket · repair · handling unit · manifest · location | **Bare, allowlisted with a stated reason** in `print-matrix-sot.guard.test.ts` (`BARE_KIND_ALLOWLIST`, shrink-only). |
> | **B** landings | **Done, wider than asked.** One helper — `PublicQrLanding` (`src/components/qr/public-qr-landing.tsx`) — serves `/m/r/[id]`, `/01/[gtin]`, `/01/[gtin]/21/[serial]`, `/414/[gln]/254/[code]` and a new `/qr` catch-all. `resolver.ts`'s `PUBLIC_LANDING_URL` (`… ?? 'https://usavshop.com'`) is **deleted**; `resolvePublic()` now echoes the canonical path. |
> | **C** E2E | **Done, 6/6 green** — `tests/e2e/platform-digital-link.spec.ts`, `--project=qa-desktop`. |
> | **D** docs/comments | **Done** — `Gs1DataMatrix` "no clickable URL" and `labelCommands` "same `R-{id}`" corrected; `docs/edge-rewrites.md` carries the kind→encode table. |
>
> **Verify:** lint · typecheck · route-perm · route-auth · schema · doc-catalog green.
> Unit-tests and knip are red on **another session's** in-flight work only
> (carton-inspector Photos CTA, receiving CustomEvent ratchet 94→96, 9 knip
> findings under `procedure/` + `station/workbench`). None of this lane's 24
> files appear in either offender list; no baseline was raised.
>
> **Known, pre-existing, NOT changed:** `x-tenant-slug` is accepted from the
> client (load-bearing for `global-setup`, lighthouse and photo scripts on
> localhost, where a 2-label host can't carry a slug). The anon interstitial
> therefore trusts it. Exposure is public brand + the tenant's own website URL,
> but if the header is ever hardened, those scripts move first.

**Copy everything below the line into a fresh Claude Code session.**
Repo: `cycleforge-app` · lane: checkout branch (WS-DOGFOOD / `main` worktree).
**Predecessor (partially shipped 2026-08-01):** unbox carton platform Digital Links +
anon interstitial on `/m/r/[id]`. Plan of record lived in Cursor plan
`unbox_gs1_qr_domains_*` (do not re-litigate the product model).

**Related but out of scope:** [`interop-linkage-standards-HANDOFF.md`](./interop-linkage-standards-HANDOFF.md)
(EPCIS / SSCC / Company Prefix projections — zero migrations, vocabulary only).
This lane is **print encode + dual-audience landings + SoT unification**, not
interop projections.

---

You are Claude Code in the Cycle Forge monorepo with **fresh context**.

## Mission

Finish the multi-tenant SaaS Digital Link work so that:

1. **Every printable barcode/matrix** that leaves Unbox (and then every other
   internal label printer) encodes through **one pinned absolute SoT** —
   string + symbology + HRI — on the Cycle Forge platform host
   (`https://{slug}.app.cycleforge.ai/…`).
2. **Phone / frontend scans** of those codes land on a proper dual-audience
   surface: anon → branded interstitial with button to the tenant’s
   `brand.publicLandingUrl`; staff session → internal ops.
3. **E2E on the QA org** proves print minting + anon landing + staff wedge
   still open unbox/ops.

Do **not** invent per-tenant QR domains. Do **not** mint fake SSCC / Company
Prefix keys. Do **not** blind-302 consumers to usavshop.com.

## Product model (locked — do not reopen)

| Audience | Behavior |
|---|---|
| Printed sticker | Absolute HTTPS on `{slug}.app.cycleforge.ai` (+ path for entity) |
| Staff wedge / in-app | `routeScan()` ignores host → internal ops; bare handles still accepted |
| Consumer phone (anon) | Same URL → Cycle Forge **interstitial** (brand + link + Continue button → `publicLandingUrl`) |
| Authed staff on phone | Same URL → existing mobile ops page |

Tenant configures **only** the outbound website (`brand.publicLandingUrl`).
Cycle Forge owns the QR host.

## Already shipped (do not rebuild)

| Piece | Path |
|---|---|
| Platform mint helpers | `src/lib/qr/platform-link.ts` (+ `.test.ts`) |
| Carton encode | `src/lib/print/printReceivingLabel.ts` → `resolveReceivingQrValue` + HRI `R-{id}` |
| Carton print cmds | `src/lib/print/labelCommands.ts` uses `resolveReceivingQrValue` |
| Unbox wiring | `useCartonLabelEditor` / `cartonLabelPayload` / `useUnboxLineController` pass `orgSlug` |
| Unit encode API | `unitLabelCore.buildUnitPayload` — platform `/01/…` when `gtin` + `orgSlug` |
| Anon carton landing | `src/app/m/(shell)/r/[id]/page.tsx` + `PublicQrInterstitial` |
| Public path allowlist | `src/proxy.ts` + `AuthContext` `CLIENT_PUBLIC_PATHS` → `/m/r/\d+` |
| Org setting | `BrandSchema.publicLandingUrl`, profile API, Organization settings UI |
| Docs | `docs/edge-rewrites.md` (SaaS host vs legacy usavshop rewrites) |

Unit tests green for minting: `platform-link.test.ts`, `printReceivingLabel.test.ts`.

## Gaps this session must close

### A — Pin the absolute encode SoT (highest priority)

**Grow `src/lib/qr/platform-link.ts` into the single owner of printable matrix
payloads.** Target API shape (name as you like, keep it one module):

```ts
encodePrintMatrix(kind, args: {
  orgSlug: string | null;
  /* entity ids / gtin / serial / overrides */
}): { value: string; symbology: 'datamatrix' | 'gs1datamatrix'; hri?: string }
```

Hard rules:

- **Compose, don't fork.** `barcode-routing.ts` stays parse / `routeScan` /
  bare-handle grammar / AI string builders. `labelFace.ts` stays **layout
  slots only**. Domain `print*` files become thin adapters that call
  `encodePrintMatrix`.
- **Preview ≡ print.** `workspaceLabelToFace('unit')` in
  `src/lib/print/workspace-label-kinds.ts` currently inlines
  `qrPayload || serial || sku` and **skips** `buildUnitPayload` — that is the
  first concrete bug. Preview and print must call the same encode function.
- **Absolute host when slug known; bare handle fallback when not** (offline /
  missing auth). Never mint `usavshop.com` for new stickers when slug is
  available.
- Add a **guard test** (same shape as other SoT ratchets): every
  `print*Label` / `*PayloadToFace` / `workspaceLabelToFace` matrix value for
  kinds in scope must be produced by `encodePrintMatrix` (or an allowlisted
  escape with a one-line comment). Ratchet DOWN only.

Kinds to fold into the SoT in this order (stop if timeboxed — finish A1–A3 first):

1. **A1** carton (`r`) — already correct; refactor call sites onto SoT
2. **A2** unit (`01` / `u`) — fix workspace preview fork; thread `orgSlug` into
   Testing / Prebox / multi-SKU / bulk print callers that currently omit it
3. **A3** as-listed / line (`l`) — today bare `L-` / `R-` in
   `printAsListedLabel.ts`
4. **A4** ticket / repair / handling unit / manifest — `T-` / `REP-` / `H-` /
   `KIT-…` → platform `/m/…` (or documented keep-bare if no public landing yet)
5. **A5** location — optional; paren AI `(414)(254)` can stay internal; if you
   add URL form, use platform host and stop advertising `QR_BASE_URL` /
   usavshop in bin ConfigSheet UI

### B — Unify dual-audience landings (frontend scans)

Carton interstitial exists. Finish the **same contract** for every path the
new encode SoT mints:

| Path | Staff | Anon |
|---|---|---|
| `/m/r/[id]` | ops (done) | interstitial (done) |
| `/01/[gtin]` (+ `/21/…`) | existing internal resolve | **must become** interstitial (or shared helper), **not** hard 302 to `NEXT_PUBLIC_STOREFRONT_URL` / usavshop |
| `/m/l/[id]`, `/m/u/…`, `/m/h/…`, ticket/repair if minted as URLs | existing ops | interstitial via shared helper |

Extract a shared server helper next to `PublicQrInterstitial`, e.g.
`resolvePublicQrLanding({ slug, scanLabel })` → brand + `getPublicLandingUrl`.
**Do not** leave a second public-resolve path in `src/lib/gs1/resolver.ts`
that still hardcodes usavshop for anon once unit URLs mint on the platform host.

Add `/01/…` (and any new public matrix paths) to `PUBLIC_PATHS` /
`CLIENT_PUBLIC_PATHS` if not already (GS1 paths are already listed — confirm
interstitial renders before AuthContext bounce).

### C — E2E on the QA org (definition of done for landings)

Assert against the **QA org**, not dogfood (`AGENTS.md` / `.claude/rules/verify.md`).

Extend (prefer compose over new files):

1. `tests/e2e/receiving-silent-print.spec.ts` — after unbox Print, assert the
   encoded matrix (or preview face SoT) is
   `https://{qaSlug}.app.cycleforge.ai/m/r/{id}` (or localhost slug-host
   equivalent) and HRI `R-{id}`.
2. `tests/e2e/receiving-note-label-grain.spec.ts` — preview matrix === print
   SoT for carton (and unit if in scope).
3. **New or sibling spec** for anon landing:
   - With a seeded carton id + QA slug host (or request headers / baseURL that
     set tenant slug), `GET /m/r/{id}` **without** staff cookie → interstitial
     copy + Continue href === org `publicLandingUrl` (set via settings API or
     fixture).
   - With staff session → carton ops (RCV- heading / package chrome), not
     interstitial.

Use existing E2E fixtures / global-setup patterns
(`tests/e2e/global-setup.ts`, mobile-photos / receive-to-zoho specs). Prefer
the **e2e-spec-writer** skill if scaffolding a new file.

Manual smoke (if E2E host DNS is awkward locally): document the three scans in
the PR/test plan — phone signed-out, staff wedge, preview≡print.

### D — Display metric pinned absolute (SoT discipline)

“Display metric” here means **what is shown/encoded on the label face**, not
CSS density:

- One function owns `{ value, symbology, hri }` for a kind.
- Previews (`ReceivingPoLabelPreview`, `LabelFacePreview`, workspace kind
  faces) and thermal/HTML/ESC-POS paths all read that function.
- Update stale comments (e.g. `Gs1DataMatrix.tsx` “no clickable URL”;
  `labelCommands` “R-{id} only”).
- Guard test pins the invariant so the next printer cannot fork a twin.

## Read before writing code

- `AGENTS.md` + `.claude/rules/source-of-truth.md` — one module per concern;
  compose → grow SoT → never page-local twin.
- `.claude/rules/pattern-evolution.md` — grow `platform-link.ts`; do not add
  `qr-encode-v2.ts`.
- `.claude/rules/workflow-safety.md` — attach to `:3050`; never start/kill the
  dev server; user owns commits.
- `.claude/rules/verify.md` — `npm run verify` before done; never raise
  ratchet baselines.
- `docs/edge-rewrites.md` — current SaaS vs legacy usavshop contract.
- Existing interstitial: `src/components/qr/PublicQrInterstitial.tsx`,
  `src/app/m/(shell)/r/[id]/page.tsx`.

## Out of scope (hand back, do not expand)

- SSCC minting / GS1 Company Prefix DDL
- EPCIS / EDI / DPP projection work (`interop-linkage-standards-HANDOFF.md`)
- Per-tenant custom QR DNS / edge rewrite provisioning
- Raising knip / DS baselines to paper over unrelated branch noise — if verify
  is red on **unrelated** interop/procedure/photo ratchets, fix only what this
  lane touches or note blockers; do not `knip:baseline` without review

## Done when

- [ ] `encodePrintMatrix` (or renamed) is the only encode path for carton +
      unit (+ as-listed if started); workspace unit preview uses it
- [ ] Guard test fails if a print/preview path bypasses the SoT
- [ ] Anon `/01/…` (and any newly URL-minted kinds) use the shared interstitial
      + org `publicLandingUrl` — no usavshop hard redirect for platform-minted
      codes
- [ ] E2E: print mint host/path + anon interstitial + staff ops (QA org)
- [ ] `npm run verify` green for this lane’s files; DS ratchets did not grow
- [ ] Short note in `docs/agent-log/entries/main.md` + update this HANDOFF
      status at the top when shipping

## Suggested first commits (user manages git — only commit if asked)

1. SoT encode + workspace unit preview fix + guard
2. Shared interstitial for `/01` (+ path allowlists if needed)
3. Thread `orgSlug` through remaining print callers
4. E2E specs

## Smoke checklist (human)

1. Settings → Organization → set Customer website → save.
2. Unbox → Print carton → matrix URL is `{slug}.app.cycleforge.ai/m/r/{id}`,
   HRI `R-{id}`.
3. Signed-out phone / Incognito open that URL → interstitial → Continue lands
   on configured website.
4. Staff wedge scan same sticker → unbox/receiving, not interstitial.
5. Unit label with GTIN (if available) → `/01/…` on same host; anon lands
   interstitial after B ships.
