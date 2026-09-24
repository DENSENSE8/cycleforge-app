# Prompt — iPhone Air QA outbound slice (MacBook/Xcode only)

You own only the native Apple app on the MacBook. Do not SSH-build Xcode, and
do not edit Android, Tauri, or server code.

## Workspace and source control

- Work on the MacBook in `~/Projects/cycleforge-ios`.
- Back up Mac changes with `Scripts/backup-to-avion.sh`; it is **Mac → avion
  only**. Never rsync avion back over the Mac checkout.
- Do not commit unless the owner asks.

## Goal

A signed-in QA Sandbox operator can create one safe outbound test order, see
the server-projected order in the native queue, open its triage detail, and
attempt safe `PICK`/`QC` acknowledgement. This is a thin client of server
truth—not a fixture system on the phone.

## Server contracts already available

- `GET /api/developer/qa/capabilities` → `{ success, allowed, reason,
  environment, permissions }`. The QA control is visible only when
  `allowed === true`; never hardcode or send an organization id.
- `POST /api/orders/add` with staff cookie, `orders.create`, and a UUID sent as
  both `Idempotency-Key` and `idempotencyKey`. Required body fields are
  `orderId`, `productTitle`, `accountSource`; optional current fields include
  `sku`, canonical `condition`, `quantity`, `saleAmount`, `currency`,
  `isUrgent`, and tracking fields.
- `POST /api/orders/{id}/acknowledge` body `{ route: "PICK" | "QC" }`.
  A `409 NOT_READY` with `missing: ["pairing", "label"]` is a named refusal,
  not success.
- `GET /api/v1/outbound/work` is the canonical queue/triage projection.

Do not make local orders, derive lifecycle state, buy a label, or add parcel,
allocation, tote, packing, or scan-out behavior in this slice.

## Read first

- `docs/handoff/HANDOFF-swiftui-app.md`
- `App/Sources/AppRootView.swift`, `App/Sources/AppModel.swift`
- `Sources/CycleForgeClient/OrdersScreen.swift`
- `Sources/CycleForgeClient/ToShipQueueStore.swift`, `ToShipFeed.swift`
- `Sources/CycleForgeClient/CycleForgeAPI.swift`, `CycleForgeRequests.swift`
- `Sources/CycleForgeClient/IndustrialShell.swift`

## Implement

1. In `OrdersScreen`, show `QA TEST ORDER` only after the capability read says
   it is allowed. Reserve no empty chrome for any other user.
2. Open a full-screen `QATestOrderFlow` using the existing industrial
   primitives: square corners, hairline rules, uppercase labels and 48 pt
   controls. Show persistent copy: `QA SANDBOX — test order; no label or
   postage.`
3. Provide editable defaults for unique `QA-TEST-IOS-…` order ID, source,
   title, SKU, canonical condition, quantity, urgency and optional sale amount
   / currency. No tracking default: the absent label is part of the test.
4. Keep HTTP in a `QATestOrderStore` injected with `CycleForgeAPI`, never in a
   SwiftUI view. Submit is single-flight and retries reuse the same UUID.
5. On create success, refresh `ToShipQueueStore`, show the server identity and
   provide `OPEN TRIAGE` using the existing `OutboundWorkStore` projection.
6. Render server facts only: order/source/title/SKU, paired/unpaired state,
   label state, next action and acknowledgement result. Render `NOT_READY`
   missing gates plainly. Refresh after a successful acknowledgement.

## Tests and local build

Add request, store and accessibility tests for capability false/true,
idempotency retry, successful create, visible `NOT_READY` refusal and
successful acknowledgement refresh. Test that the button is absent by default.

```bash
cd ~/Projects/cycleforge-ios
ruby App/project.rb
swift test
xcodebuild test -scheme CycleForgeMobile-Package \
  -destination 'platform=iOS Simulator,name=iPhone Air,OS=latest' \
  -derivedDataPath build/DDpkg
xcodebuild test -project App/CycleForgeFloorApp.xcodeproj \
  -scheme CycleForgeFloorApp \
  -destination 'platform=iOS Simulator,name=iPhone Air,OS=latest' \
  -derivedDataPath build/DDsim
```

Install on the physical Air only after those tests pass. Use its existing
`CFServerBaseURL` launch/profile configuration; do not change a server origin
in source. If Xcode reports device assertion 4016, ask the owner to unlock and
keep the phone awake.
