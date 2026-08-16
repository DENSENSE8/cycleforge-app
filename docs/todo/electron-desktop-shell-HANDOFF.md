# HANDOFF — Cycle Forge desktop shell (Electron)

**Date:** 2026-08-11 · **Lane:** `main` (dogfood) · **State:** working, uncommitted
**Plan:** [`electron-desktop-shell-PLAN.md`](./electron-desktop-shell-PLAN.md) — read §0 (locked verdict) and §2 (the four native capabilities) before changing anything.

**The user owns commits. Nothing here is committed.** Stage only files you touched.

---

## 1. What exists and works

A thin hosted-URL Electron shell. It bundles **no** app code — it points a hardened
`BrowserWindow` at the deployed Next app, so a Vercel deploy reaches every install
with no release.

| Area | Files | State |
|---|---|---|
| Shell | `electron/main.js`, `preload.js`, `entitlements.mac.plist`, `package.json` | works |
| Deploy pickup | `electron/build-watch.js` | works |
| Packaging | `electron-builder.yml`, `electron-builder.mac-intel-legacy.yml` | 4 installers built |
| Dev harness | `scripts/electron-dev.mjs` | attach-only |
| Renderer seam | `src/lib/desktop/desktop-host.ts`, `desktop-download.ts` | works |
| Silent OS print | `src/lib/print/iframePrint.ts` (desktop branch) | works |
| Printer picker | `src/components/settings/PrintPreferences.tsx` | works |
| Download entry | `src/components/sidebar/master-nav/StaffAccountFooter.tsx` | verified in browser |
| Listings embed | `ListingVendorViewPanel.tsx`, `ListingLinksTab.tsx` | needs a bench eyeball |
| Release CI | `.github/workflows/desktop-release.yml` | untested (needs a tag + secrets) |
| Guard | `src/lib/desktop/electron-shell.guard.test.ts` | 26 assertions, green |

**Runtime-verified**, not assumed:

```
[desktop] attaching to http://127.0.0.1:3050
[startup] shown as "Cycle Forge" · app.name="Cycle Forge"
[build-watch] tracking client build 4c2a243c      # matches prod HTML fingerprint
[updater] v0.1.1 — checking GitHub Releases
```

Installers built (in gitignored `desktop-dist/`): Windows x64 **93 MB**, mac arm64
**109 MB**, mac Intel **117 MB**, mac Intel legacy **89 MB**.

---

## 2. Do this next (ordered)

### 2.1 Publish a release — unblocks two 404s at once
The ⋯ menu's "Download desktop app" and `electron-updater` both point at
`github.com/DENSENSE8/cycleforge-app/releases/latest`, which 404s because no
Release exists. Add the secrets in the workflow header, then:

```bash
git tag desktop-v0.1.2 && git push origin desktop-v0.1.2
```

**The Mac signing secrets are not optional.** Squirrel.Mac refuses to apply an
update unless the running app is signed and the update's signature validates — an
unsigned build makes the whole update feed decorative.

### 2.2 Route documents to the `paper`-role printer (N1 gap)
The bridge accepts `deviceName` and Settings now lists real OS devices, but no
call site passes one, so a desktop print goes to the **system default**. Closing it
needs a per-call-site role: a label fallback and a document print both funnel
through `printHtmlInIframe`, so the helper cannot guess. Add `role` at the
document call sites (`printOutboundDocuments`, `printPackBundleFallback`), resolve
`getProfileForRole('paper')?.deviceName`, leave label fallbacks on the default.

### 2.3 Hard reload for the listing banner
The banner's ↻ re-issues `loadURL`, which revalidates rather than bypassing cache.
A true hard reload needs a real IPC (`cf:vendor-view-reload` →
`webContents.reloadIgnoringCache()`). **Wait for the VendorView work to settle** —
see §4.

### 2.4 Renderer-side chunk-error recovery (build-watch gap)
`build-watch` only reloads when the OS reports the operator idle 5 min, so someone
working continuously across a deploy can still hit a stale chunk. The fix is a
chunk-load-error handler in the renderer — but that is **app-wide** (it changes
every browser tab too), so it is a product decision, not a shell change.

---

## 3. Traps that cost real time — do not rediscover these

- **`electron/package.json` is authoritative for version**, not the repo root
  (`directories.app: electron`). Verified empirically: setting it to `0.9.9` built
  a `0.9.9` app while root stayed `0.1.1`. The build log's
  `appPackageFile=<root>/package.json` line is **misleading**.
- **Never point electron-builder at the root manifest.** Its `dependencies` are the
  whole Next tree, so the first build was an **851 MB** `.app` shipping `pg`,
  `googleapis` and the AI SDKs to bench PCs. `files` negations only got it to
  437 MB — they filter the copy, they do not change what gets *resolved*. The
  two-manifest layout is what fixes it (→ 109 MB).
- **The packaged app and `pnpm desktop:dev` share a `userData` path**, so whichever
  starts second exits **silently with code 0** via `requestSingleInstanceLock`.
  This looks exactly like a crash. Quit one before launching the other.
- **`pnpm-workspace.yaml` `allowBuilds` must list `electron`** or the postinstall
  is skipped and the Chromium binary never downloads.
- **Windows NSIS builds on macOS with no Wine** — electron-builder ships its own
  toolchain. Docker is not needed.
- **Legacy Electron 22 has no global `fetch` and no `WebContentsView`.** Both are
  feature-detected; keep it that way or the oldest bench throws.
- **Never start/restart/kill the dev server** (`.claude/rules/workflow-safety.md`).
  `scripts/electron-dev.mjs` attaches to `:3050` and exits if nothing answers.

---

## 4. Concurrent-session collision — read before editing

Another session shipped **N5 VendorView** into the same tree and rewrote the plan
doc's §0 to supersede the vendor-embed hard ban. Shared files:

`electron/main.js` · `electron/vendor-view.js` · `electron/preload.js` ·
`src/lib/desktop/desktop-host.ts` · `src/components/desktop/**` ·
`src/components/receiving/workspace/line-edit/**`

The shell guard was **relaxed** to match: it no longer asserts "no
`WebContentsView`" (that would pin a retired rule) but still pins `webviewTag:
false`, the sandbox posture, the narrow preload, and the legacy-target rules.

**At handoff time these were red and are NOT this lane's work** — verify before
inheriting them:

- `npx tsc --noEmit` → 1 error in `ItemPhotoCaptureStrip.tsx` (**untracked**, theirs)
- unit tests → 1 failure, `PoLineCaptureRow stamps data-active-step from a prop`
  (their own new guard, against their own untracked refactor)
- DS ratchet total moved 1433 → 1435; no ratchet exceeds baseline and this lane's
  diff contains no ratcheted patterns, but attribution was not provable
- A dev-only hydration error on `/` — ruled out as this lane's (still reproduced
  with the download row disabled); console names the cause, *"the module factory is
  not available"* = Turbopack HMR staleness. A dev-server restart clears it, which
  is the **user's** to do.

---

## 5. Verify

```bash
npm run verify                 # full gate
pnpm dev                       # user's terminal, :3050 — NEVER start this yourself
pnpm desktop:dev               # attaches to it
pnpm desktop:deps && pnpm desktop:dist:mac -- -c.mac.notarize=false
```

Guard: `node --test --require ./scripts/register-server-only-shim.cjs --import tsx 'src/lib/desktop/*.test.ts'`

**Do not raise a ratchet baseline or a knip baseline to go green.**

---

## 6. Explicitly not done

- Signing / notarization (owner credentials)
- A published GitHub Release
- Bench eyeball of the Listings banner (desktop-shell only; not visible in a browser)
- Icons — every build logs `default Electron icon is used`
- Windows code signing (SmartScreen will warn)
