# Tauri native operator and assistant V1 hard checklist

**Status:** integration plan, ready to execute after the active
`codex/v1-outbound` work is committed  
**Linked implementation task:** `codex://threads/01a0b732-2e20-7b83-a0e5-bb96afe61e02`  
**Target:** signed CycleForge Desktop is the primary operator product  
**Local verification origin:** `http://localhost:3050` only  
**Companion plan:** `docs/todo/assistant-conversation-surface-v1-FOUNDATION-PLAN.md`

## Product decision

Operators download and use CycleForge Desktop. They do not need a visible
browser or a locally running Next.js server for daily work.

The desktop application is the main way to interact with CycleForge, but it is
not a direct database client. The native package must never contain a Postgres
DSN, tenant ID, cloud credential, marketplace secret, workflow decision, or
SQL query.

```text
Signed Tauri package
  bundled React operator UI
  narrow Rust commands
  OS keyring
  updater / scanner / print / folder adapters
                  |
                  | authenticated HTTPS
                  v
CycleForge API and command handlers
                  |
                  v
tenant-scoped database, outboxes, workflows, documents, AI providers
```

The browser build remains useful for automated contract, accessibility, and
layout proof. It is a test projection of the same client core, not the shipped
operator experience.

## One source of truth

Native-first does not mean Rust becomes a second business backend. Ownership is
split by responsibility:

| Layer | Owns | Must not own |
|---|---|---|
| PostgreSQL | durable sessions, turns, runs, events, artifacts, workflow state, audit facts | UI state or device secrets |
| CycleForge API | tenancy, permissions, validation, commands, projections, AI orchestration, idempotency | native file dialogs or printer selection |
| Shared contracts | request, response, SSE event, artifact, route, and command schemas | database access or React components |
| Rust/Tauri | device enrollment, keyring, pinned API transport, streaming bridge, filesystem, scanner, printer, updater | tenant selection, SQL, workflow branching, artifact invention |
| Bundled React | navigation, transcript, inline artifacts, composer, optimistic presentation | bearer tokens, raw SQL, tenant IDs, lifecycle authority |
| Browser harness | API/UI parity and regression tests | operator distribution or native capability claims |

Desktop and mobile are projections of the same server contracts. A scan
station may supply more initial context, but it cannot create a different chat,
workflow, export, or database model.

## Current implementation evidence

The linked `codex/v1-outbound` worktree already contains useful foundation:

- `apps/desktop-tauri` with bundled Vite/React assets and an AppImage target;
- a narrow Tauri command allowlist;
- OS-keyring storage for a device bearer token;
- one-time desktop enrollment and pairing endpoints;
- `desktop_devices`, label-ingestion tables, composite tenant foreign keys,
  and forced RLS in `2026-09-18_v1_label_ingestions.sql`;
- a tenant-derived `/api/v1/outbound/work` projection;
- a fixed top header, operational address field, action overlay, and live work
  queue shell;
- Rust compilation proof.

That work is in a separate active worktree and is not yet present in the
production worktree. Integrate committed changes only. Do not copy partially
edited files or merge an active worktree's uncommitted state.

## P0 release blockers found in the native audit

### 1. Production API origin trust

The current Rust command accepts any user-entered HTTPS origin and later sends
the device bearer token to that origin. HTTPS alone does not make an origin
trusted. A malicious or mistaken endpoint could receive the credential.

- [ ] Production builds pin the CycleForge API origin in signed build
  configuration, or validate a remotely supplied origin through a
  cryptographically signed trust document.
- [ ] User-editable origins are disabled in production packages.
- [ ] Development builds accept only `http://localhost:3050` plus explicitly
  named test origins.
- [ ] Redirects are disabled for authenticated native requests, or every
  redirect target is revalidated before the authorization header is sent.
- [ ] TLS errors fail closed. No certificate-ignore switch ships.
- [ ] Rotating the trusted origin requires a signed desktop update or signed
  trust update, not a text field.

**Exit gate:** entering an attacker-controlled HTTPS URL cannot cause a device
or operator credential to appear in that server's request log.

### 2. Device identity is not operator identity

An enrolled device proves which workstation is calling. It does not prove
which staff member is operating it or which permissions that person has.

- [ ] Add a short-lived operator authorization bound to the paired device.
- [ ] Resolve organization from the paired device, never from React input.
- [ ] Resolve staff ID and permissions from the operator authorization, never
  from a request body or display selection.
- [ ] Every assistant turn and warehouse mutation records both `device_id` and
  `actor_staff_id` where applicable.
- [ ] Lock, sign-out, shift change, revocation, and staff deactivation
  invalidate the operator authorization without unpairing the workstation.
- [ ] Device-only access is limited to explicit bootstrap and health
  capabilities. It cannot inherit all staff read or write permissions.

Use an existing strong staff authentication flow or a reviewed PKCE/operator
lease. Do not invent a shared warehouse PIN as a shortcut.

**Exit gate:** two staff members using the same paired desktop receive their
own permissions and audit attribution; a revoked staff session fails while the
device remains paired.

### 3. Production webview security

- [ ] Replace `"csp": null` with a restrictive production Content Security
  Policy.
- [ ] Keep the Tauri capability file deny-by-default. Add only named commands
  and plugins required by the current increment.
- [ ] Disable devtools in release builds unless a separately signed support
  build enables them.
- [ ] Reject arbitrary shell execution, arbitrary HTTP, unrestricted
  filesystem paths, and arbitrary external navigation.
- [ ] Permit external links through one validated HTTPS opener.
- [ ] Prove the built JS bundle contains no token, DSN, secret, organization
  ID, or private API credential.

**Exit gate:** a script injected into the webview cannot read credentials,
change the trusted API origin, invoke undeclared native behavior, or write an
arbitrary file.

## Target repository boundaries

The current workspace includes `apps/*` only and does not have a shared
`packages/` directory. Add a small shared core before copying more logic into
the Tauri client.

```text
apps/
  desktop-tauri/
    src/                    bundled React presentation
    src-tauri/              Rust native boundary
  mobile/                   mobile projection
packages/
  operator-contracts/       Zod/JSON Schema/OpenAPI contracts only
  assistant-client/         event reducer, SSE grammar, artifact/export logic
src/
  app/api/v1/               authenticated server surface
  lib/assistant/            orchestration and persistence
  lib/drizzle/              server-only database model
```

- [ ] Add `packages/*` to `pnpm-workspace.yaml`.
- [ ] Create `@cycleforge/operator-contracts` with no React, Next.js, Node DB,
  DOM, or Tauri imports.
- [ ] Move the assistant session/turn/run/event/artifact schemas into the
  contract package.
- [ ] Move the outbound work request/response contract into the package.
- [ ] Generate checked artifacts for Rust and mobile consumers from the same
  versioned schemas. Generated files are verified in CI and never hand-edited.
- [ ] Create `@cycleforge/assistant-client` for the pure event reducer, replay,
  retry state, artifact validation, CSV serialization, and compatibility
  parsing.
- [ ] Keep database queries and AI provider code in the server application.
- [ ] Do not extract the entire design system during V1. Share only client
  logic and semantic tokens that have a proven second consumer.

**Exit gate:** a contract fixture captured from the server validates in the
Next harness, Tauri client, Rust boundary, and mobile client with the same
schema version.

## Native assistant command surface

The React webview must not receive a bearer token just so it can call the chat
API. Rust owns authenticated network transport and exposes fixed commands.

Target allowlist:

```text
native_capabilities
desktop_auth_status
pair_desktop_device
unlock_desktop_operator
lock_desktop_operator
list_assistant_sessions
load_assistant_session
start_assistant_turn
cancel_assistant_run
retry_assistant_turn
export_assistant_artifact
```

`start_assistant_turn` uses a Tauri channel or equivalent typed IPC stream:

```text
React composer
  -> invoke(start_assistant_turn, request, eventChannel)
  -> Rust sends fixed authenticated HTTPS request
  -> API emits canonical assistant events
  -> Rust validates event envelope and forwards it over the channel
  -> shared reducer paints the transcript
```

- [ ] The command accepts session ID, message, canonical subject/context, and
  a client event ID. It does not accept a URL, organization ID, staff ID, SQL,
  arbitrary headers, or arbitrary filesystem path.
- [ ] Rust loads device and operator credentials from the OS keyring.
- [ ] Rust forwards the canonical event grammar from the assistant foundation
  plan: session, turn, run, step, tool start/end, delta, attachment, error,
  and done.
- [ ] Every streamed event includes stable IDs and server sequence where the
  contract requires it.
- [ ] Cancellation aborts the HTTP stream and lands an honest stopped run on
  the server.
- [ ] Retry links a new run to the same user turn. It does not replace local
  transcript bytes and hope the server agrees.
- [ ] Reconnection reloads durable events before resuming live delivery.
- [ ] A malformed or oversized event terminates safely and is never rendered
  as HTML or an artifact.
- [ ] The GEX45 local-provider path remains server-owned. The desktop package
  never opens SSH, stores model credentials, or contacts GEX45 directly.

**Exit gate:** with JavaScript network access disabled, the native transcript
still streams a QA answer through Rust, including `Worked Ns · M steps` and an
inline validated artifact.

## Native conversation surface

The desktop application implements the same conversation anatomy defined by
the assistant foundation plan:

- fixed application header;
- compact Orders, Shipping, Inventory, Repairs, and future prompt actions;
- one chronological transcript;
- `Worked Ns · M steps` progress disclosure;
- inline table/report/timeline/record attachments;
- icon-only Copy and Retry controls with accessible labels;
- sticky composer;
- history in a popover or overlay, not a persistent left rail;
- large artifacts in a temporary inspector, not an always-open right pane.

The operational address field and command interface may navigate to a session
or seed context:

```text
order:875
sku:TECH-00875
shipment:12345
session:oc-...
```

- [ ] Exact address parsing lives in a shared registry. The React component
  does not hard-code entity-specific regexes.
- [ ] Scanner input and typed addresses resolve through the same server-backed
  identity command.
- [ ] The action overlay opens above content and causes zero layout shift.
- [ ] The fixed header never changes height across queue, station, assistant,
  and artifact views.
- [ ] Desktop routes have stable internal route IDs and corresponding mobile
  deep links where the operation is mobile-capable.
- [ ] No persistent SaaS sidebar is mounted in the native operator shell.

**Exit gate:** the same QA session opened through `session:<id>` and through
history renders identical turns, steps, attachments, and permissions.

## Native export ownership

An inline artifact remains the source of export data. Native file saving is a
platform adapter, not a second reporting engine.

- [ ] `export_assistant_artifact` accepts an artifact ID and desired supported
  format only.
- [ ] The API reauthorizes organization, operator, session, and artifact.
- [ ] Export bytes are derived from the persisted validated artifact payload.
- [ ] Rust opens a native save dialog with a sanitized suggested filename.
- [ ] The capability is restricted to a user-selected file or approved export
  directory.
- [ ] CSV formula injection, quoting, newline, Unicode, null, and stable-column
  rules are covered by shared serializer tests.
- [ ] Export audit records artifact ID, format, staff, device, time, and byte
  count without copying the whole file into another database table.
- [ ] A second organization cannot export an artifact by exact ID.

**Exit gate:** the native-saved CSV byte-for-byte matches the browser harness
export for the same artifact fixture.

## Offline and failure behavior

V1 chat does not pretend to work offline. Read-only cached context may be shown
with its age, but no invented answer or successful mutation is allowed.

- [ ] Loss of connectivity ends the live run visibly and permits a deliberate
  retry.
- [ ] A composed but unsent prompt remains local until sent or discarded.
- [ ] Mutations that support offline retry carry a UUID client event ID and use
  a durable native outbox.
- [ ] Server commands are idempotent on organization plus client event ID.
- [ ] Restarting during a queued mutation does not duplicate it.
- [ ] Chat deltas are not treated as durable until the server reload endpoint
  returns the completed or stopped turn.
- [ ] Cached work and attachments display `last synchronized` and cannot be
  mistaken for current server state.

**Exit gate:** killing the application during a retry and reopening it produces
one server mutation, one audit fact, and one visible result.

## Packaging, signing, and updates

- [ ] Rename outbound-specific native identity only through an explicit
  migration if the app is becoming the full CycleForge operator application.
  Decide the final product name, bundle identifier, keyring service, and config
  directory before the first external install.
- [ ] Produce AppImage first, matching the linked task's current target.
- [ ] Configure a signed Tauri updater with a separately protected signing key.
- [ ] Publish update metadata and package hashes over trusted HTTPS.
- [ ] Verify update signature before installation.
- [ ] Support rollback to the prior signed package when startup health fails.
- [ ] Persist database and device compatibility requirements in a release
  manifest.
- [ ] Block an app version below the API's minimum supported contract version
  with an actionable update screen.
- [ ] Generate an SBOM and run Rust/JavaScript dependency audits in release CI.

**Exit gate:** an installed QA AppImage updates to the next signed version,
retains device enrollment, requires operator reauthorization according to
policy, and rejects an altered update package.

## Integration sequence into the production worktree

### Increment 0: finish and inventory the linked worktree

- [ ] Let the active `codex/v1-outbound` task reach a committed, green state.
- [ ] Record its commit list and compare it with the production branch.
- [ ] Separate native shell, server contract, auth, schema, and documentation
  commits where practical.
- [ ] Rebase or merge without overwriting unrelated production worktree
  changes.
- [ ] Resolve `package.json`, lockfile, Drizzle schema, permission registry,
  audit vocabulary, and OpenAPI conflicts deliberately.
- [ ] Do not transfer uncommitted files from the active worktree.

**Proof:** production contains the intended committed files, and `git diff`
against those commits contains no accidental unrelated changes.

### Increment 1: land the read-only native spine

- [ ] Land bundled Tauri assets, AppImage configuration, native command
  allowlist, outbound projection, and enrollment schema.
- [ ] Apply only the exact assistant/native migration after checking migration
  order.
- [ ] Replace the fixture with live QA data after successful pairing.
- [ ] Keep every unimplemented native capability visibly false.

**Proof:** fresh AppImage install, pair, load tenant-scoped QA work, restart,
and load again without a browser or local Next server.

### Increment 2: harden origin and dual-principal authentication

- [ ] Complete all three P0 blocks above.
- [ ] Add revocation, last-seen, app-version, and permission-denial evidence.
- [ ] Require operator authorization for assistant and protected work data.

**Proof:** malicious-origin, stolen-token, revoked-device, revoked-staff,
cross-tenant, and permission-denial tests pass.

### Increment 3: extract and generate shared contracts

- [ ] Add shared package boundaries.
- [ ] Generate client/Rust/mobile contract artifacts.
- [ ] Move the event reducer and artifact/export logic into the pure client
  package.

**Proof:** one fixture matrix passes in all consumers; drift fails CI.

### Increment 4: connect the native assistant stream

- [ ] Add the fixed Rust commands and streaming channel.
- [ ] Mount the railless native conversation surface.
- [ ] Connect durable session history, retries, cancellation, inline artifacts,
  and native export.

**Proof:** live QA and GEX45 demonstrations pass with JS network access denied.

### Increment 5: add native hardware adapters

- [ ] Scanner events enter the shared identification kernel.
- [ ] Folder watch emits byte-hashed, idempotent ingestion commands.
- [ ] Named printing consumes server-owned documents and records print jobs.
- [ ] Each adapter reports capability and health; unavailable hardware degrades
  honestly.

**Proof:** disconnect, duplicate scan/file, printer failure, and restart cases
produce no duplicate business mutation.

### Increment 6: sign, update, and make desktop the operator door

- [ ] Ship the signed updater and production CSP.
- [ ] Change staff-facing download and onboarding to the native package.
- [ ] Keep the web application as control plane and verification surface where
  required, not a competing daily operator UI.
- [ ] Add clear unsupported-platform and minimum-version handling.

**Proof:** a newly provisioned workstation can install, enroll, update, sign in,
perform a complete workflow, export evidence, restart, and resume.

## Verifiable command matrix

The exact script names may be introduced by the implementation, but the final
root scripts must expose these stable capabilities:

```bash
pnpm desktop:contracts:check
pnpm desktop:security:test
pnpm desktop:rust:fmt
pnpm desktop:rust:clippy
pnpm desktop:rust:test
pnpm desktop:web:test
pnpm desktop:native:e2e
pnpm desktop:bundle:appimage
pnpm desktop:package:verify
pnpm desktop:update:e2e
pnpm verify:fast
```

Required meaning:

| Command | Must prove |
|---|---|
| `desktop:contracts:check` | generated types match canonical schemas |
| `desktop:security:test` | origin pinning, IPC allowlist, token isolation, dual principal, cross-tenant denial |
| `desktop:rust:fmt` | Rust format is clean |
| `desktop:rust:clippy` | no denied Rust lints |
| `desktop:rust:test` | URL, keyring, request, event, cancellation, and file-path boundaries |
| `desktop:web:test` | reducer, routes, transcript, attachments, accessibility, export serialization |
| `desktop:native:e2e` | installed native window executes the QA workflow |
| `desktop:bundle:appimage` | reproducible release bundle is produced |
| `desktop:package:verify` | signature, hash, CSP, capabilities, bundle-secret scan, SBOM |
| `desktop:update:e2e` | signed update and tamper rejection |

## Native QA acceptance journey

Use the QA organization and a packaged application, not only Vite dev mode.

1. Install the AppImage on a clean test profile.
2. Confirm no database DSN, organization selector, or arbitrary API origin is
   present.
3. Enroll the device with a one-time code.
4. Sign in or unlock as a QA staff member with `assistant.chat` and the required
   warehouse permissions.
5. Load outbound work and prove the organization is derived from the device.
6. Open Chat from the fixed action overlay.
7. Select Orders, edit the seeded prompt, and send it.
8. Observe ordered work steps and a complete GEX45-backed answer.
9. Collapse the progress disclosure to `Worked Ns · M steps`.
10. Inspect an inline table attachment.
11. Save its CSV with the native dialog and verify bytes.
12. Copy and retry using icon-only controls and keyboard navigation.
13. Restart the application and resume the same session from history.
14. Lock the operator, sign in as a lower-permission user, and prove protected
    history and actions are denied.
15. Revoke the desktop and prove the next request fails without leaking data.
16. Repeat exact-ID access with a second QA organization and prove isolation.
17. Install a valid signed update and reject a tampered update.

Capture package hash, app version, contract version, device public ID, staff ID,
session ID, run ID, artifact ID, export hash, API response status, and test trace.
Do not capture raw pairing codes, device tokens, operator tokens, or model
credentials.

## Browser and performance verification after native-first

The rule that local app requests use `http://localhost:3050` still governs the
server verification harness. It does not mean an operator launches Chrome.

- Browser tests validate the shared reducer, server API, responsive rendering,
  accessibility, and Lighthouse characteristics.
- Native E2E validates keyring, IPC, WebKit, packaged assets, scanner, files,
  printing, updater, restart, and OS integration.
- A browser pass cannot substitute for native E2E.
- A native pass cannot substitute for tenancy, API, and contract tests.
- Lighthouse 95 remains a useful React payload and accessibility signal, but
  startup time, memory, dropped frames, package size, and native crash-free
  rate are added release metrics.

Native performance targets for the agreed QA fixture:

- first usable window under 2.5 seconds on the reference workstation;
- command overlay response under 100 ms;
- composer input never blocked by network work;
- first progress event visible before first model prose;
- transcript maintains smooth interaction at 500 turns with bounded rendering;
- no permanent side panes loaded when absent;
- no native command holds the main UI thread during network or file work.

## Marketable completion checklist

CycleForge Desktop may be called the primary operator application only when:

- [ ] the app installs from a signed package and updates from a signed channel;
- [ ] production API origin trust is pinned and redirect-safe;
- [ ] device credentials remain in the OS keyring and never enter React;
- [ ] staff identity and permissions are distinct from device identity;
- [ ] the database is reachable only through tenant-scoped server APIs;
- [ ] the operator shell has the fixed header, operational address field, and
  overlay action list with no persistent left sidebar;
- [ ] the assistant uses one chronological transcript with inline exports and
  a sticky composer;
- [ ] desktop and mobile consume the same versioned contracts;
- [ ] retries and offline-capable mutations are idempotent;
- [ ] scanner, folder, print, and export adapters are narrow and audited;
- [ ] refresh/restart/session resume preserve durable state;
- [ ] QA cross-tenant, permission, revocation, failure, and update tests pass;
- [ ] all scoped migrations are applied and recorded;
- [ ] `pnpm verify:fast`, full cross-cutting eval, native E2E, package security,
  and update verification are green.

## Explicitly rejected architectures

- Shipping a database DSN or querying Postgres from Tauri.
- Letting React read the device or operator bearer token.
- Sending credentials to an arbitrary user-configured HTTPS origin.
- Treating device enrollment as staff authorization.
- Reimplementing workflow transitions in Rust or React.
- Maintaining separate desktop and browser chat contracts.
- Loading the hosted Next operator UI inside Tauri as the production product.
- Calling a Vite fixture a live warehouse client.
- Claiming native readiness from browser automation alone.
- Auto-publishing AI-generated workflows or procedures.

## First executable native integration slice

After the linked task is committed, the highest-ROI slice is:

1. integrate the committed Tauri shell and read-only outbound projection into
   the production worktree;
2. pin the production API origin and block credential-bearing redirects;
3. add operator authorization beside device enrollment;
4. establish the shared contract package and generated contract check;
5. implement one Rust-streamed assistant turn with cancellation;
6. render the answer, work steps, and one inline table attachment;
7. save that attachment through a restricted native dialog;
8. package an AppImage and run the complete QA journey;
9. apply only the exact required migrations and verify the migration ledger;
10. run repository, contract, security, native, browser-harness, and package
    gates.

That slice turns the desktop shell from a presentation and read projection into
the first secure, attributable, end-to-end operator workflow without creating a
second backend or weakening the conversation foundation.
