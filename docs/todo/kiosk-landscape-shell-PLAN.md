# Kiosk landscape shell — implementation plan (post-verification)

> **Replaces** the greenfield Phase 1–4 sequence in the research answer.
> Research briefing: [`kiosk-ipad-native-shell-GEMINI-RESEARCH-BRIEFING.md`](./kiosk-ipad-native-shell-GEMINI-RESEARCH-BRIEFING.md).
> Display contract: [`.claude/rules/display/kiosk-shell.md`](../../.claude/rules/display/kiosk-shell.md).

## Locked decisions

| Decision | Choice |
|---|---|
| Gate | Proven `/kiosk` default; landscape shell on **`/kiosk/v2`** until cutover |
| Attract media MVP | URL paste on `brand.attractMediaUrl` (Blob upload follow-on) |
| Sales catalog | Local projection filtered to **non-`-RS`** via `/api/kiosk/sales/*` |
| Cart SoT | `CounterDraft.retailLines` on kiosk; `salesCartStore` stays staff walk-in |
| Native wrapper | PWA under MDM — no Capacitor |
| Dual-display pairing | Out of v1 |

## Checklist (stabilize → cutover)

### 1. Stabilize (done / verify)

- [x] Restore proven welcome-tile `/kiosk` + `CounterIntakeForm`
- [x] Move shell + attract + idle to `/kiosk/v2`
- [x] Allowlist `GET /api/kiosk/settings` and `/api/kiosk/sales/*` on kiosk host
- [x] Counter pane posts to `/api/kiosk/intake` (`serviceLine` + Idempotency-Key)

### 2. Attract MVP (done / polish later)

- [x] Idle 60s → prompt → attract; reduced-motion; brand/logo fallback
- [ ] Optional: Blob upload UI in Organization settings
- [ ] Optional: `idleTimeoutSeconds` in org settings JSON

### 3. Shell QA path (`/kiosk/v2`)

- [x] Left rail + right pane + bottom dock
- [x] Mode-aware catalog (`repair` vs `sales` apiBasePath)
- [x] Portrait: catalog as top band
- [x] WIP Pickup disabled in dock (`KIOSK_SERVICES`)
- [x] Remove invented `price: '130'` default
- [ ] Critique → improve-ui pass on shell density / thumb zones

### 4. Cutover

- [ ] E2E: welcome tiles on `/kiosk` + shell chrome on `/kiosk/v2` both green (iPad-landscape)
- [ ] Flip `/kiosk` to shell; keep `/kiosk/v2` redirect or delete
- [ ] `npm run verify` green
- [ ] Dual-display pairing (Wave F / PR-12) as a **later** initiative
