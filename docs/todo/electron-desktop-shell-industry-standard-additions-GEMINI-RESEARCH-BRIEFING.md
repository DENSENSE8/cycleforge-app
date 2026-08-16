# GEMINI RESEARCH BRIEFING — Cycle Forge desktop shell: what industry-standard Electron practice is worth adding next

**Date:** 2026-08-11 · **For:** Gemini (deep research) · **Author:** Claude Code (main/dogfood lane)
**Parent plan:** [`electron-desktop-shell-PLAN.md`](./electron-desktop-shell-PLAN.md) → §0 locked verdict · §2 N1–N5
**Handoff:** [`electron-desktop-shell-HANDOFF.md`](./electron-desktop-shell-HANDOFF.md)
**Prior ruling:** [`electron-vendor-webview-displays-delete-keep-GEMINI-RESEARCH-BRIEFING.md`](./electron-vendor-webview-displays-delete-keep-GEMINI-RESEARCH-BRIEFING.md)
**Binding rules:** `AGENTS.md` · `.claude/rules/source-of-truth.md` → Station desktop VendorView · `.claude/rules/workflow-safety.md` (dev server is ATTACH-only) · `.claude/rules/build-gotchas.md` (bundle altitude)

---

## 0. The one question

We built a **thin, hardened, hosted-URL Electron shell** for warehouse **station PCs**. It ships no
app code — it points a locked-down `BrowserWindow` at the deployed Next app — and it closes exactly
five native gaps a browser cannot (N1–N5: silent OS print, printer enumeration, unfocused scan
hotkey, versioned auto-updating host, partitioned vendor console). It is already above the security
bar most Electron apps clear.

> **What, from the industry-standard Electron toolkit, would most benefit THIS
> deployment — a fleet of mostly-unattended warehouse bench PCs running a
> hosted-URL shell — and in what order? Which candidates are genuinely worth
> the code and lifecycle cost, and which are cargo-cult additions we should
> refuse?**

The thesis this briefing wants tested: **the shell is feature-hardened but
operations-thin.** The gaps that matter for a *fleet of unattended stations* are
not new capabilities — they are the operations layer that makes a fleet
*survivable*: crash visibility, crash recovery, update *application* (not just
download), boot-into-app, binary tamper hardening, and distribution trust. We
believe those outrank every "cool native feature." Confirm, refute, or re-rank.

---

## 1. Immovable constraints — do NOT re-litigate these

These are settled (PLAN §0). A recommendation that violates one is out of scope, however standard it
is elsewhere.

| Constraint | Why it is locked |
|---|---|
| **Browser stays primary.** The shell is an *optional* station-PC host, never the product's distribution. A tenant who never installs it loses only N1–N5. | `saas-commercialization-plan.md` §0. |
| **Thin hosted-URL wrapper.** One `BrowserWindow` → deployed origin. **No** bundled Next build, **no** business logic, **no** app code in the installer. A deploy reaches every install for free; shipping app code never ships an installer. | Pinning app version to installer version is the failure this avoids. |
| **Earn native.** Nothing gets an IPC channel unless it maps to a named capability (N1–N5). **No generic `invoke` / `executeJavaScript` macro channel.** | A macro channel is a DOM-scrape backdoor. |
| **Renderer seam is ONE module** — `src/lib/desktop/desktop-host.ts`. Feature code never sniffs `window.cycleForgeDesktop`. Everything is null/empty-safe in a browser. | Prevents per-call-site capability drift. |
| **Don't fork the print or scan SoT.** Thermal printers stay on WebUSB/Web Serial (`browserPrint.ts`); OS printers go through the single `printHtmlInIframe` seam. Scans stay decoded by `routeScan` / `src/lib/scan-hotkey/` only — the shell **focuses a window, it never reads a barcode**. | Two print stacks / two scan engines is the anti-pattern. |
| **`sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`, `webviewTag: false`.** | Guard-pinned (`electron-shell.guard.test.ts`, 26 assertions). |
| **Vendor embeds = partitioned `WebContentsView` only** (N5), REST facades for CF-owned mutations, `<webview>` tag banned. Zoho/marketplace stay deep-link until a later port. | PLAN §0 + `source-of-truth.md` → Station desktop VendorView. |
| **Tauri is a separate decision, not in scope.** | PLAN §6 non-goals. |
| **No local HTTP sidecar, no file-path printing.** (Both were legacy; both deleted.) | Attack surface with no consumer. |

**Deployment reality (design for this, not a generic desktop app):** the fleet is
**unattended Windows bench PCs** (plus a few legacy Intel Macs) that **stay open
for days**, are shared across shifts, sit on a warehouse LAN, and have **nobody
watching the screen** most of the time. A crashed bench is a bench nobody
notices until an operator walks up to a white window. Optimise for *survivability
of an unwatched fleet*, not for a single power user's laptop.

---

## 2. What already exists (rule on the DELTA, not the whole)

So the research does not re-recommend what is shipped. Every row below is in the code today.

### 2.1 Security posture (strong)
- `sandbox: true` · `contextIsolation: true` · `nodeIntegration: false` · `webviewTag: false` on the main window and the hidden print window and the vendor view.
- **Narrow `contextBridge` preload** — one global (`cycleForgeDesktop`), named capabilities only; no `require`, no fs, no generic `invoke`.
- **Origin allowlist** (suffix-based for `{slug}.app.cycleforge.ai` tenants) enforced on both `will-navigate` and `setWindowOpenHandler`; everything else → `shell.openExternal` (deep links land in the operator's real signed-in browser).
- **`setPermissionRequestHandler`** — deny-by-default; only `clipboard-read`, `clipboard-sanitized-write`, `media`, `serial`, `hid`, `usb` (the last three are the WebUSB/Web Serial thermal path).
- **`web-contents-created` → `will-attach-webview` deny** (defence in depth over `webviewTag: false`).
- **`page-title-updated` prevented** so the tenant's `{page} · {org}` title never overwrites the product chrome ("Cycle Forge").
- **N5 VendorView** — `WebContentsView` + `session.fromPartition('persist:<vendor>')`; **per-partition host allowlist is the security boundary** (Main-side `PARTITION_HOST_SUFFIXES`); dismiss chords scoped to the view's own focus (`before-input-event`), never `globalShortcut`; anchored vs takeover modes; Main drops the view on host `did-navigate` / `render-process-gone` (a native view has no DOM parent to clean it up).

### 2.2 Native capabilities (N1–N5)
- **N1** silent print of fully-formed HTML to a *named* printer via a hidden `BrowserWindow` + `webContents.print({ silent, deviceName })`; renders from a `data:` URL (HTML never touches disk); neutralises the embedded `window.print()`; 30 s hard-timeout so a stuck page cannot leak a hidden window. *(Known gap: no call site passes `deviceName` yet — HANDOFF §2.2.)*
- **N2** `getPrintersAsync()` → Settings lists real OS device names.
- **N3** `globalShortcut('Insert')` **only while unfocused** → raise window + replay a trusted key via `sendInputEvent`; the in-page store owns the scan once focused. Shell adds zero scan vocabulary.
- **N4** `electron-updater` against GitHub Releases; dmg (install) + zip (update feed); disabled on legacy Electron < 23 by *runtime* major so the oldest bench can't brick itself.
- **N5** partitioned vendor console (Zendesk dogfood; eBay Listings port).

### 2.3 Fleet-quality touches already present (better than the average wrapper)
- **`build-watch.js`** — polls the start URL, hashes the `/_next/static/chunks/*.js` set (content-hash fingerprint), and `reloadIgnoringCache()`s **only when the OS reports the operator idle ≥ 5 min** (`powerMonitor.getSystemIdleTime`) and no VendorView is open. Solves the "station open for days serves a stale bundle, then 404s a rotated chunk mid-scan" problem. This is a genuinely non-obvious, correct piece of fleet engineering.
- **`requestSingleInstanceLock()`** (+ `second-instance` re-focus) so two shells don't fight over the scan hotkey.
- **`backgroundThrottling: false`** — a throttled bench misses a scan.
- **Persistent 256 MB disk cache** (and *not* clearing it on launch — a legacy bug they explicitly avoid).
- **`did-fail-load` → offline fallback page** with Retry.
- **Two-manifest layout** (`electron/package.json` for shell deps only) — the fix for the 851 MB `.app` that shipped `pg`/`googleapis`.
- **Hardened-runtime entitlements + notarization config**; **CI release workflow** (macOS arm64/Intel/legacy + Windows, signing-secret plumbing); **native title bar on both platforms** (deliberate — a `hiddenInset` bar would collide with the app's own top-left nav cluster).
- **Guard tests** pin the security bans as code.

---

## 3. The candidate surface — grouped, with the browser/current limit stated

Each candidate: **what it is**, **what breaks without it on an unwatched fleet**, **rough cost**, and
**industry precedent**. Grouped by whether it is (A) fleet-survival, (B) binary/supply-chain
hardening, (C) station-UX polish, (D) distribution/trust, (E) probably-refuse. Our proposed ranking
is §4; this section is the raw material for Gemini to re-order and pressure-test.

### A. Fleet-survival operations (our thesis: this tier is the real gap)

**A1 — Main-renderer crash recovery.** `main.js` handles `did-fail-load` (offline
page) but has **no `render-process-gone` / `unresponsive` handler on the main
window** (the vendor view has one, the main window does not). A renderer crash on
an unwatched bench = a dead/white window that stays dead until a human reloads.
Standard fix: `webContents.on('render-process-gone', …)` → log + `reload()` (with
a crash-loop backstop so a reproducibly-crashing page doesn't spin), and
`webContents.on('unresponsive', …)` → offer/auto reload. *Cost: ~30 lines,
low risk. Precedent: universal in production Electron (VS Code, Slack, Discord
all auto-recover a dead renderer).*

**A2 — Crash *visibility* (telemetry).** There is **no `crashReporter` and no
Sentry**. A fleet of unwatched PCs with zero crash telemetry means every crash is
invisible to ops — you learn about it when a warehouse calls. Options:
(i) Electron's built-in `crashReporter` → a minidump collector, or
(ii) `@sentry/electron` (main + renderer). This is arguably the single highest-
leverage *operational* addition: it turns "a bench is down and nobody knows" into
a dashboard row. **Tension to resolve:** Cycle Forge is privacy-conscious and the
shell deliberately reports nothing home; a crash reporter is the first
outbound-telemetry channel and needs an explicit product/privacy decision (what
is captured, where it goes, tenant opt-out). *Cost: a day + an endpoint/DSN +
a policy call. Precedent: every serious desktop app.*

**A3 — Update *application*, not just download.** `autoUpdater` checks **once**,
3 s after ready, with `autoInstallOnAppQuit: true` — but a station that **never
quits never applies a downloaded update.** So N4 downloads updates the fleet then
runs for weeks. Standard fixes, both of which *reuse the idle logic build-watch
already computes*: (i) **periodic `checkForUpdates`** on an interval (e.g. every
few hours), and (ii) **apply during the same idle window build-watch uses** —
`powerMonitor.getSystemIdleTime() ≥ threshold` → `quitAndInstall()` (or a nightly
scheduled relaunch). Note the ordering trap: a *native* update (new Electron/
shell) and a *web* update (new chunks) are different — build-watch handles web,
the updater handles native, and both should apply in the same "nobody's mid-
carton" window. *Cost: small, mostly reuse. Precedent: every kiosk/fleet
updater.*

**A4 — Auto-launch at login / boot-into-app.** No `app.setLoginItemSettings`
(macOS/Windows) / no MDM run-key. A rebooted bench PC (power blip, Windows
update, IT reboot) comes back to a **desktop**, not the app — until someone
double-clicks it. For a station whose *whole point* is "always be on the app,"
this is a real availability gap. *Cost: tiny (`setLoginItemSettings({ openAtLogin
})`), or IT-managed via MDM/GPO. Decision: shell-managed vs IT-managed.
Precedent: standard for kiosk/POS/station apps.*

**A5 — Watchdog / relaunch-on-hard-crash.** If the *main* process dies (not just
the renderer — A1 covers that), nothing brings the app back. Options: OS-level
auto-restart (Windows service wrapper / launchd `KeepAlive`), or a lightweight
supervisor. Overlaps with A4 (login item + a crash gets you most of the way).
*Decision: is A1 + A4 enough, or is a true supervisor warranted?*

### B. Binary / supply-chain hardening (cheap, high-signal, industry baseline)

**B1 — `@electron/fuses`.** The shell flips **no fuses.** Electron's own
recommended baseline flips: `RunAsNode` off, `EnableNodeCliInspectArguments` off,
`EnableNodeOptionsEnvironmentVariable` off, `OnlyLoadAppFromAsar` on,
`EnableCookieEncryption` on, and `EnableEmbeddedAsarIntegrityValidation` on. These
close local-privilege / tamper vectors (e.g. `ELECTRON_RUN_AS_NODE` turning the
signed binary into a generic Node runtime). *Cost: an `afterPack` hook / builder
integration, low. Precedent: Electron docs list this as the security checklist
baseline; adopted by mainstream apps.*

**B2 — ASAR integrity.** No `asarIntegrity` in the builder config and no
integrity fuse. On macOS/Windows, electron-builder + the integrity fuse can make
the app refuse a tampered `app.asar`. For a shared warehouse PC where anyone can
touch the install dir, this is meaningful. *Cost: low (pairs with B1). Precedent:
default-on in recent electron-builder + Electron.*

**B3 — `setPermissionCheckHandler` (companion to the existing request handler).**
Only `setPermissionRequestHandler` is set; some permission *checks* are
synchronous and go through `setPermissionCheckHandler`. Mirroring the same
allowlist closes a gap where a check-path permission is granted by default. *Cost:
~10 lines. Precedent: Electron security checklist recommends both.*

**B4 — Entitlement tightening (macOS).** `entitlements.mac.plist` includes
`com.apple.security.cs.disable-library-validation` and
`allow-unsigned-executable-memory`. These are the *conventional* Electron
entitlements, but `disable-library-validation` weakens code-signing guarantees; if
the shell loads no third-party native libraries beyond Electron's, dropping it is
a hardening win. *Decision: verify nothing (e.g. a native print/USB module)
needs it, then drop. Low-priority, low-effort.*

**B5 — Response-header / CSP posture.** The shell enforces navigation allowlisting
but does not add a `Content-Security-Policy` via `onHeadersReceived`. **This is
probably correctly owned server-side** (the hosted app serves its own CSP), so the
question is only whether the shell should *assert* a floor CSP as defence-in-depth
for the `data:`/`file:` edges, or leave it to the origin. *Likely: leave to the
origin; confirm.*

### C. Station / kiosk UX & availability polish

**C1 — Prevent display sleep during a shift.** No `powerSaveBlocker`. A bench that
dims or sleeps mid-shift (OS power policy) is an operator waking a screen instead
of scanning. `powerSaveBlocker.start('prevent-display-sleep')` (scoped to shift
hours, or always) is a classic station requirement. *Cost: tiny. Decision:
always-on vs a shell toggle vs leave to OS power policy (IT may already pin
this).*

**C2 — Window-state persistence.** Window size/position resets to
1600×1000-centred each launch (no `electron-window-state` / persisted bounds).
Minor for a maximised kiosk; nice for a windowed bench. *Cost: tiny. Priority:
low.*

**C3 — Zoom persistence.** Operator zoom (`Ctrl +/-`, in the View menu) isn't
persisted per-install. Some benches at odd viewing distances want a pinned zoom.
*Cost: tiny. Priority: low.*

**C4 — Kiosk lockdown (decision, not a default).** Should a shared bench PC be
harder to escape — `kiosk: true`, suppress `Cmd/Alt+F4`/`Cmd+Q`, hide the menu,
block `Ctrl+Shift+I`? This trades operator freedom for lock-down and depends
entirely on whether these are single-purpose kiosks or shared PCs people also use
for email. *Explicitly a product decision; we want a framework for deciding, not a
default.*

**C5 — Deep-link protocol handler (`cycleforge://`).** No
`setAsDefaultProtocolClient` / `open-url` / second-instance-argv URL routing. A
`cycleforge://carton/123` link (from an email, a thrown task, another app) could
focus the station shell and navigate it to a record. Plausibly valuable given the
app already has "throw a task to a bench" (`ThrowTaskHost`), but it needs a real
consumer before it earns the channel (per the earn-native rule). *Decision: is
there a consumer today, or is this speculative?*

**C6 — Native OS notifications for background alerts.** The app has its own
in-app inbox/toast system; a native `Notification` (when the window is unfocused/
minimised) could surface a thrown task or an urgent exception to a bench whose
operator stepped away. This must not become a second notification SoT — it would
be a thin bridge that mirrors an *existing* in-app signal, only when unfocused.
*Decision: earn it with a named signal, or leave to the web layer's realtime.*

### D. Distribution & trust

**D1 — Windows code signing.** HANDOFF §6: Windows builds are **unsigned** →
SmartScreen warns, and IT-managed rollout stalls. For a Windows-majority warehouse
fleet this is close to *mandatory*, not polish. Options: standard OV cert (needs
reputation to build) vs EV cert (immediate SmartScreen trust) vs Azure Trusted
Signing. *Cost: a cert + CI wiring (the workflow already has `WIN_CSC_*`
placeholders). Priority: high for real rollout.*

**D2 — App icons.** Every build logs `default Electron icon is used`. Trivial, but
it's the difference between "a real product" and "someone's side project" on a
taskbar. *Cost: trivial. Priority: high-visibility, low-effort.*

**D3 — Fleet-friendly Windows packaging.** NSIS today is `perMachine: false`,
`allowToChangeInstallationDirectory: true` — a *per-user*, interactive install.
For IT-managed benches you often want **per-machine + silent** install, or an
**MSI**, or a **winget** manifest for scripted rollout. *Decision: is rollout
IT-managed (→ MSI/winget/silent NSIS) or hand-installed (→ current NSIS is fine)?*

**D4 — Update channels / staged rollout.** `electron-updater` pulls from GitHub
Releases with no channel split (`latest` only). A `beta`/`stable` channel or a
staged rollout would let a shell change be proven on one bench before the fleet.
*Cost: moderate. Priority: only once the fleet is more than a handful of PCs.*

### E. Considered and probably REFUSE (respect the bans / browser-first)

- **Local offline store (SQLite/Realm).** The app is browser-first and online; the
  offline queue already lives in the web layer (connection-health + durable queue,
  `.claude/rules/display/station.md` §8). A native offline DB forks that. **Refuse.**
- **Native menus/tray as a second nav.** The app owns its nav (MasterNav spine).
  A tray/menu duplicating it is a second nav SoT. **Refuse** (a minimal tray for
  "quit/reload/open-logs" is a *different, tiny* thing — see F below).
- **A generic `invoke`/`executeJavaScript` bridge for vendor form-fill or "just
  one macro."** Banned by §0. **Refuse.**
- **Bundling the Next build into the installer** (pins app version). **Refuse.**
- **Screen/keystroke capture, activity monitoring.** Surveillance-shaped; not our
  product. **Refuse.**
- **Tauri migration.** Out of scope (separate decision). **Refuse here.**

### F. Small support/diagnostics niceties (bundle into whatever tier)
- **"Open logs folder" + "Copy diagnostics"** in the menu/Settings→About (the app
  already surfaces `versions`). Turns a support call into a paste. *Trivial.*
- **A minimal tray icon** for quit/reload/open-logs on a chrome-less kiosk. *Small;
  only if C4 kiosk-lockdown lands.*

---

## 4. Our proposed ranking (pressure-test this)

Scored for **this** deployment (unattended Windows-majority fleet, hosted-URL
shell). Benefit = availability/operability of an unwatched fleet. This is the
answer we *expect* to be roughly right — tell us where it's wrong.

| Rank | Candidate | Benefit (fleet) | Effort | Risk | Tier |
|---|---|---|---|---|---|
| 1 | **A1** main-renderer crash recovery | ★★★★★ | S | Low | **Do now** |
| 2 | **A3** apply updates on idle + periodic check | ★★★★★ | S–M | Low | **Do now** |
| 3 | **D1** Windows code signing | ★★★★★ | M (cert) | Low | **Do now (rollout-blocking)** |
| 4 | **B1 + B2** fuses + asar integrity | ★★★★ | S | Low | **Do now** |
| 5 | **A2** crash telemetry (crashReporter/Sentry) | ★★★★★ | M | **Med (privacy decision)** | **Decide, then do** |
| 6 | **A4** auto-launch at login | ★★★★ | S | Low | **Do (or confirm IT owns it)** |
| 7 | **D2** app icons | ★★★ (visibility) | XS | None | **Do now (freebie)** |
| 8 | **B3** `setPermissionCheckHandler` | ★★★ | XS | None | **Do now (freebie)** |
| 9 | **C1** `powerSaveBlocker` | ★★★ | XS | Low | **Do (or confirm IT power policy)** |
| 10 | **D3** silent/per-machine/MSI packaging | ★★★★ *if IT-managed* | M | Low | **Decide by rollout model** |
| 11 | **C5** deep-link protocol · **C6** native notifications | ★★★ | M | Low | **Earn with a consumer** |
| 12 | **A5** main-process watchdog · **B4** entitlement trim · **C2/C3** window/zoom state · **D4** channels · **F** diagnostics | ★★ | S–M | Low | **Backlog** |

**The shape of our claim:** ranks 1–4 (+ the two freebies 7–8) are *unambiguous
wins* — cheap, low-risk, and they fix real fleet-survival holes. Rank 5 (crash
telemetry) is the highest-*benefit* item but carries a privacy/product decision
that outranks the code. Everything below rank 6 is real but earns its place by a
rollout fact (D1/D3), an OS-policy fact (A4/C1), or a product consumer (C5/C6).

---

## 5. Falsifiable principles we want tested

1. **"Operations beats features for an unwatched fleet."** For a bench PC nobody
   is watching, crash-recovery + update-application + crash-visibility outrank any
   new native capability. → *Is this the right lens, or are we under-valuing a
   specific capability (e.g. native notifications) for this domain?*
2. **"Reuse the idle window, don't invent one."** build-watch already computes
   "nobody is mid-carton" (`getSystemIdleTime`). Native-update apply (A3), web
   reload (existing), and any disruptive maintenance should share that one
   gate. → *Agree, or should native updates apply on a different signal (e.g.
   nightly cron) to avoid a mid-shift Electron swap?*
3. **"Fuses + asar integrity are baseline, not advanced."** They are cheap and
   the Electron project itself lists them as the security floor. → *Confirm
   they're worth it for a shell that only ever loads first-party allowlisted
   origins, or argue the threat model doesn't justify them here.*
4. **"Windows signing is rollout-blocking, not polish."** → *Confirm; and
   recommend OV vs EV vs Azure Trusted Signing given a small-business fleet.*
5. **"Earn-native still governs the shiny stuff."** Deep-link protocol, native
   notifications, tray — each needs a *named consumer* before it gets an IPC
   channel, exactly like N1–N5. → *Is there a consumer today (ThrowTaskHost?
   urgent exceptions?) strong enough to pull C5/C6 up?*
6. **"Telemetry is the first thing that breaks browser-first neutrality."** The
   shell reports nothing home by design. A crash reporter is the first outbound
   channel and needs an explicit boundary (what/where/opt-out). → *What is the
   right minimal, privacy-respecting crash-telemetry design for a multi-tenant
   station host? (self-hosted collector vs Sentry SaaS; PII scrubbing; per-tenant
   opt-out.)*

---

## 6. Concrete deliverable we want from Gemini

1. **A re-ranked table** (accept/adjust §4) with a one-line justification per
   change, scored for *this* deployment — not a generic Electron app.
2. **A crisp "do-now vs decide-first vs backlog vs refuse" partition**, with the
   *decision* each "decide-first" item hinges on (rollout model, IT ownership,
   privacy policy, existence of a consumer).
3. **For the top ~4 do-now items**, the industry-standard *implementation shape*
   (API + the one gotcha) so an agent can execute without re-researching — e.g.
   the crash-recovery loop-guard, the `@electron/fuses` builder hook, the
   idle-apply update flow that coexists with build-watch, the Windows signing
   options.
4. **Anything we MISSED** — a standard practice for unattended Electron fleets
   that isn't in §3 at all (e.g. GPU-crash handling, `child-process-gone`,
   certificate-pinning for the update feed, disk-space guards, log rotation,
   remote config/kill-switch, health heartbeat).
5. **A refutation pass on §5** — call out any falsifiable principle that is wrong
   for a warehouse-station Electron fleet.

---

## 7. Non-goals / do-not-suggest (saves a round-trip)

- Anything violating §1 (browser-first, thin shell, earn-native, no macro
  channel, no forking print/scan SoT, sandbox posture).
- Bundling app code; local business logic; a second nav/notification/print/scan/
  offline SoT.
- Tauri; a Chromium-flag "performance" laundry list; a generic plugin system.
- Re-recommending anything already shipped in §2 (allowlist, partitioned
  WebContentsView, build-watch, single-instance lock, notarization config, the
  two-manifest layout, the existing permission-request handler).
- Raising DS/knip ratchet baselines to land any of this.

---

## Appendix — file evidence (so claims are checkable)

| Claim | File · line |
|---|---|
| No `render-process-gone`/`unresponsive` on the main window | `electron/main.js` — handlers are `did-fail-load` (464), `focus/blur/closed` (471–477); vendor view has its own at `electron/vendor-view.js:161` |
| Updater checks once, applies on quit only | `electron/main.js:591` (`autoInstallOnAppQuit = true`), `:620` (single `setTimeout` → `checkForUpdates`); no `setInterval` |
| No fuses / asar integrity / crashReporter / Sentry / login-item / powerSaveBlocker / window-state / `setPermissionCheckHandler` / protocol handler | absent across `electron/**` (grepped 2026-08-11) |
| Only `setPermissionRequestHandler` | `electron/main.js:459` |
| Windows unsigned; icons default | HANDOFF §6; no `icon:` key in either `electron-builder*.yml` |
| build-watch idle gate (reuse target for A3) | `electron/build-watch.js:80` (`safeToReload`), `:42` (`IDLE_SECONDS_BEFORE_RELOAD = 300`) |
| NSIS is per-user interactive | `electron-builder.yml:78` (`oneClick: false`, `perMachine: false`) |
| CI already has `WIN_CSC_*` placeholders | `.github/workflows/desktop-release.yml:114` |

---

*Register in the doc catalog before `npm run verify`: `node scripts/portfolio-sot-sync.mjs`
(a.k.a. `pnpm portfolio:sot`) — the catalog is machine-generated; do not hand-edit it.*
