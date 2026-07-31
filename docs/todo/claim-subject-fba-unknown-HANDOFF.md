# Handoff — Claim subject still “Unknown - Return” after FBA classify

**Status:** OPEN — dogfood still shows `Unknown - Return // Return // TRK#…` after FBA select.  
**Lane:** `main` (this checkout). Stay on it — no branch, no worktree, never `git stash`.  
**Commits:** user manages. Stage only files you touch.  
**Dev server:** already on `:3050` — attach, never start/restart/kill.  
**Verify:** `npm run verify` green before done.  
**E2E org:** QA org only (never dogfood tenant assertions).

---

## 0. Bug (still reproducing)

Claim modal **SUBJECT** after classify Type=Return + Platform=FBA (or door “FBA Return”):

```text
Unknown - Return // Return // TRK#…
```

Expected (either is fine):

```text
FBA Return // Return // TRK#…
# or
FBA - Return // Return // TRK#…
```

Header in latest dogfood shot may say **Unfound** — carton may have no PO; that is OK. Platform segment must still be **FBA**, never **Unknown**.

---

## 1. What already landed (do not redo)

| Change | File(s) |
|---|---|
| Subject identity helper (no bare `Return // Return`) | [`src/lib/zendesk-claim-subject-identity.ts`](../../src/lib/zendesk-claim-subject-identity.ts) + unit tests |
| Template reads `is_return` / `return_platform` + org catalog labels | [`src/lib/zendesk-claim-template.ts`](../../src/lib/zendesk-claim-template.ts) |
| Type pill also PATCHes `is_return` | [`useReceivingType.ts`](../../src/components/receiving/workspace/line-edit/hooks/useReceivingType.ts) |
| Preview refetches on `receiving-package-updated` | [`useClaimTemplate.ts`](../../src/components/receiving/workspace/claim/hooks/useClaimTemplate.ts) |
| PATCH allowlist now imports SoT platforms (**includes `fba`**) | [`src/app/api/receiving/[id]/route.ts`](../../src/app/api/receiving/[id]/route.ts) |
| Guard: allowlist must stay SoT-derived | [`source-platform-allowlist.guard.test.ts`](../../src/app/api/receiving/source-platform-allowlist.guard.test.ts) |
| Platform save checks `res.ok`; on Return also stamps `return_platform` | [`useSourcePlatform.ts`](../../src/components/receiving/workspace/line-edit/hooks/useSourcePlatform.ts) + [`return-platform-for-source.ts`](../../src/lib/receiving/return-platform-for-source.ts) |

Unit math is green. **Persistence / live subject refresh is still wrong in the UI.**

---

## 2. Likely remaining root causes (investigate in order)

1. **PATCH still failing for this carton** — Network tab: `PATCH /api/receiving/:id` with `{ source_platform: "fba" }` → status? body error? DB CHECK constraint? catalog slug mismatch (`FBA` vs `fba`)?
2. **Optimistic pill vs DB** — UI shows FBA from `setSourcePlatform` while DB still null → preview reads DB → `Unknown`. Confirm with `GET /api/receiving/:id` after select.
3. **Event / refetch race** — `receiving-package-updated` fires but preview aborts, or `subjectTouched` blocks overwrite (controlled input firing `onChange`?).
4. **Wrong surface** — classify on a surface that does **not** call the updated `savePlatform(..., { isReturn })` (search all `savePlatform(` / `source_platform:` writers).
5. **Template SQL / view** — `receiving_carton.source_platform` not the column PATCH writes (legacy `receiving` vs view).
6. **Claim opened before classify** — subject seeded as Unknown; after FBA save, refetch must replace it. If still Unknown, refetch never got `source_platform`.

**Do not** “fix” by hardcoding `FBA` in the modal. Fix the write path + prove subject from `/api/receiving/zendesk-claim/preview`.

---

## 3. Acceptance criteria

- [ ] After Platform=FBA + Type=Return (or door FBA Return), claim SUBJECT identity segment is `FBA Return` or `FBA - Return` — **never** `Unknown`.
- [ ] `PATCH /api/receiving/:id` with `source_platform: "fba"` returns **200** and GET carton shows `source_platform: "fba"`.
- [ ] Changing classify while claim Ticket step is open updates SUBJECT without manual Reset (unless operator edited subject).
- [ ] Playwright E2E on **QA org** asserts subject contains `FBA` after classify (see §5).
- [ ] `npm run verify` green. No ratchet baseline bumps.

---

## 4. How to debug (fast)

```bash
# 1) Confirm allowlist + unit identity
pnpm exec tsx --test \
  src/lib/zendesk-claim-subject-identity.test.ts \
  src/app/api/receiving/source-platform-allowlist.guard.test.ts

# 2) In browser on :3050 — Unfound/return carton → File claim → Ticket step
#    Classify Platform=FBA, Type=Return. Watch Network:
#    - PATCH /api/receiving/<id>  body + status
#    - POST /api/receiving/zendesk-claim/preview  → response.subject

# 3) If PATCH 400: fix allowlist / DB constraint / slug.
#    If PATCH 200 but preview subject Unknown: template SQL / wrong id / cache.
#    If preview OK but input Unknown: subjectTouched / controlled input / link-flow overwrite.
```

Key builders:

- Subject identity: `resolveClaimSubjectIdentity` in `zendesk-claim-subject-identity.ts`
- Server assembly: `buildReceivingClaimTemplate` in `zendesk-claim-template.ts`
- Preview route: `src/app/api/receiving/zendesk-claim/preview/route.ts`

---

## 5. Playwright (required)

Extend or add beside [`tests/e2e/zendesk-claim.spec.ts`](../../tests/e2e/zendesk-claim.spec.ts).

**Intent:** QA-org carton → open File a claim → set classify to FBA + Return (or pick a fixture already FBA return) → on Ticket step assert `#claim-subject` (or `getByLabel` / test id) matches `/FBA/i` and does **not** match `/Unknown/i`.

Patterns to follow in existing E2E:

- Use QA org auth / fixtures already used by `zendesk-claim.spec.ts` and receiving E2E.
- Prefer intercepting `POST **/api/receiving/zendesk-claim/preview` and asserting `body.subject` **and** the visible input — both must agree.
- Optionally stub or drive `PATCH **/api/receiving/*` and assert request body includes `source_platform: 'fba'`.
- Do **not** assert against dogfood PO numbers from screenshots (`TRK#260075437` etc.).

Run (adjust to repo’s usual E2E invocation):

```bash
# attach to existing :3050 — do not start a second dev server
npx playwright test tests/e2e/zendesk-claim.spec.ts --project=chromium
# or whatever script package.json uses for receiving/zendesk E2E
```

If no stable QA carton with editable classify exists, create the minimal API-seeded fixture the other receiving specs use — do not skip the assertion.

---

## 6. Out of scope

- Renaming claim-type pills / new claim types.
- Deduping `FBA Return // Return` (classify vs issue — intentional).
- Print-label format changes.
- Editing this handoff’s sibling plan file for sport.

---

## 7. Paste prompt for Claude Code

```text
Fix claim SUBJECT still showing "Unknown - Return // Return // TRK#…" after FBA classify.

Read docs/todo/claim-subject-fba-unknown-HANDOFF.md end-to-end. Stay on this checkout’s branch; never stash; never start/kill the dev server on :3050; user owns commits.

Already implemented (don’t redo): subject identity helper, is_return on type pill, preview refetch on receiving-package-updated, PATCH allowlist from source-platform SoT, return_platform sync on platform save. Bug still reproduces in UI — find why source_platform=fba isn’t reaching buildReceivingClaimTemplate / preview (PATCH failure, wrong table, refetch blocked, or surface not calling savePlatform).

Acceptance: after FBA + Return classify, subject identity is "FBA Return" or "FBA - Return", never "Unknown". Prove with Network (PATCH 200 + preview.subject) and add/extend Playwright in tests/e2e/zendesk-claim.spec.ts on the QA org asserting #claim-subject / preview subject matches /FBA/i and not /Unknown/i. npm run verify green before done.
```
