# HANDOFF — finish the `/api/v1` consolidation (written 2026-09-26)

The design-system session handed this off mid-flight. The code is written but **unverified**
(typecheck was interrupted), so it was pulled out of the live tree. Nothing below is on
`:3050` or in `prod/worktree-2026-09-11` yet.

## Where the code is

Branch `wip/v1-api-consolidation` (pushed) = the stash commit. Tracked edits are its tree;
the two NEW files live in its untracked parent (`^3`). Bring them into the prod tree without
switching branches:

```bash
git fetch origin wip/v1-api-consolidation
W=origin/wip/v1-api-consolidation
git checkout $W -- src/app/api/v1 src/lib/label-ingestions/contracts.ts \
  src/lib/label-ingestions/contracts.test.ts src/lib/auth/v1-session-contract.ts \
  src/lib/picking/picking-v1-contract.ts src/lib/auth/withAuth.ts src/proxy.ts \
  scripts/generate-v1-openapi.ts scripts/verify-v1-openapi.ts \
  src/components/mobile/orders/useOrderHub.ts
git checkout $W^3 -- src/lib/api/v1-route.ts src/lib/api/v1-openapi.ts
git rm -r -q src/app/api/picking          # item 1
```

`:3050` hot-reloads this tree — typecheck before you let it sit there.

## The five items (all written, none verified)

1. **Delete three orphan routes** `src/app/api/picking/session/[id]/{confirm-pick,short-pick,complete}`.
   No caller anywhere; the phone confirms / shorts / completes over the realtime WMS channel
   (`execute({ name: 'pick.confirm' | 'pick.short' })`, `completeSession` flag). That channel
   becomes its own v1 face later.
2. **One transport kit** `src/lib/api/v1-route.ts`: `v1Data`, `v1Error`, `v1DomainError`
   (domain 400/404/409 → INVALID_REQUEST/NOT_FOUND/CONFLICT), `readV1Json`, `readV1Query`,
   `v1PathId`. All 13 v1 handlers use it (picking ×6, session, reminders, outbound/work,
   label-ingestions ×4). Replaces `v1SessionError`, `pickingV1Error(+FromStatus)`,
   `safeLabelApiError`. Each family KEEPS its own code list — the kit is transport only.
   Edge-safe (type-only imports), so the proxy uses it.
3. **Bug fix — published `Error.code` enum.** It listed only label-ingestion codes, so picking
   (`NOT_FOUND`, `CONFLICT`) and sign-in (`INVALID_CREDENTIALS`…) errors were off-spec and a
   generated Swift client would fail to decode them. Now base ∪ session ∪ label codes.
4. **One error shape on v1.** `withAuth` (`refuse(...)`: 401/403/STEPUP/402/FEATURE_GATED/500)
   and the proxy's 401 answer `/api/v1/*` as `{ error: { code, message } }`; web routes keep
   their legacy bodies byte-for-byte. v1 500s carry `requestId` only (no stack).
5. **One OpenAPI root** `src/lib/api/v1-openapi.ts` (`buildV1OpenApi`); label-ingestions now
   exports only its paths/components/codes. Generate/verify scripts and `contracts.test.ts`
   repointed (the no-org/staff/device-input test now guards the whole document).
   `labelIngestionIdSchema` removed (replaced by `v1PathId`). `useOrderHub`'s
   `/api/v1/outbound/work` read moved onto `v1Request` + `outboundWorkPageSchema`
   (its `/api/orders/lookup` leg untouched).

## Verify, then commit (by name) and push

```bash
node scripts/typecheck.mjs
npx tsx scripts/generate-v1-openapi.ts && npx tsx scripts/verify-v1-openapi.ts
node --test --require ./scripts/register-server-only-shim.cjs --import tsx \
  src/lib/label-ingestions/{contracts,native-adapters,ledger-view}.test.ts \
  src/lib/picking/*.test.ts src/lib/auth/*.test.ts src/lib/identity/*.test.ts \
  src/lib/outbound/*.test.ts src/lib/reminders/*.test.ts
pnpm -s audit-route-auth:emit && npx tsx scripts/audit-route-auth.ts --check   # 3 routes removed
pnpm verify:fast
```

Smoke on `:3050` with a throwaway **bearer** (`createSession({ credential: 'bearer', deviceLabel: '… (throwaway)' })`,
revoke after): no auth → v1 401 **envelope**; bad body → 400 envelope; `/api/v1/session`
GET 200; picking board/next/release parse against the contract; `/api/v1/outbound/work`,
`/api/v1/reminders`, `/api/v1/label-ingestions` 200; a web route still answers the legacy
`{"error":"UNAUTHENTICATED"}`. Load `/m/pick`, `/m/pick/unassigned` and an order hub
(`/m/orders/<id>`) in Playwright (iPhone UA, throwaway cookie) — no API 4xx/5xx.
`/m/pick` claims the next pick on load (reuses an open session); release anything it opens.

Then update `docs/openapi/phone-endpoint-map.md` (orphans gone; envelope unified) and the
Phase 2.2 block of `docs/HANDOFF-next-session.md`. Regenerate
`docs/tenancy/route-scoping-audit.generated.md` if its generator still exists (it was stale).

## Not in scope — owner decides

- `/m/pick` (directed) and `/m/pick/[orderId]` (order picker) are two live pickers; merging
  them is a product call.
- Next v1 families, in order (`docs/openapi/phone-endpoint-map.md`): `/m/work` onto
  `outbound/work`, tasks + daily checks, scan, the phone shell, the WMS command channel.
- Pick-screen edge-to-edge UI: `docs/design-system/HANDOFF-pick-edge-to-edge.md` (now folds
  into the device-split design work).

## Paste-ready prompt

```text
CycleForge prod lane, dogfood speed mode. Read AGENTS.md and docs/HANDOFF-v1-api-consolidation.md
only. Finish the /api/v1 consolidation: bring the code in from origin/wip/v1-api-consolidation
exactly as the handoff shows, typecheck, run the listed tests and verify:fast, smoke on :3050
with a throwaway bearer + cookie (revoke after, release any pick you open), commit your own
files by name, push (--no-verify fine; say what is red), update the two docs, then delete the
wip branch (local + origin). Do not touch design-system files — another session owns them.
```
