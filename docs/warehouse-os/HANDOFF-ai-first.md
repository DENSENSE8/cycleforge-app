# HANDOFF — the AI-first, keyboard-only upgrade

**Paste everything below the rule into a fresh session pointed at this worktree.**
Written 2026-08-22 after auditing what already exists. Read
[`LAWS.md`](LAWS.md) before proposing anything.

---

You are rebuilding Cycle Forge around **one persistent text field and an assistant**.
Everything else is inline. There are no pages to navigate to.

## The thesis, in one line

**Language is the on-ramp. The keybind is the destination.**

An operator scanning 300 cartons a shift cannot type a sentence per action — so
"no learnable UI" cannot mean "no keys". It means **nothing has to be learned
before it can be used**: you type what you want in plain words, and the interface
tells you the key that does it faster next time. The suggestion row above the
entry field is that teacher. After a week the operator is on keys and never sees
it. That is the whole design, and every decision below serves it.

## Non-goals — do not build these

- **No navigation.** No new routes, no page transitions, no menus of destinations.
- **No modal dialogs.** Everything lands inline or in the right panel.
- **No second text input, ever.** One field, mounted, never unmounted.
- **No new AI provider layer** — see §1. It exists.
- **No new wedge detector** — see §1. It exists and its tests pass.
- **No tests that `readFileSync` a source file and regex-assert it** (**X1**).
- **Do not treat the browser as the target.** This is a **native application**
  (T30). See §4.

---

## 1 · What already exists — audited, do not rebuild

Roughly 70% of the hard infrastructure is in the tree. Rebuilding any of it is
the single most likely way to waste this effort.

| You will want | It already is | State |
|---|---|---|
| scanner-vs-human input | `src/lib/keyboard/wedge-scan-machine.ts` — 50ms inter-key, 80ms idle flush, min length 3, Enter/Tab terminator | **9/9 + 5/5 tests pass** |
| scan detection *inside* a text field | `src/lib/keyboard/find-field-scan.ts` — never preventDefaults, only claims a machine-fast burst that decodes to a printed handle | built, **0 adopters** |
| customer's own local model | `src/lib/ai/org-provider.ts` — BYOK chain `ai_gateway → openai → anthropic → ollama/self-hosted`, then the platform default | built |
| cloud fallback when local dies | `src/lib/ai/failover.ts` — *"the half of local-first that makes the inversion safe"*; demotes on 5xx/401/403/429, never mid-stream | built |
| provider up/down state | `src/lib/ai/provider-health.ts` | built |
| the assistant acting on the app | `src/lib/assistant/agent-loop.ts` + `tools/` (read · write · domain-read · session · photo) | built |
| tool calls that open UI | `workspace-tools.ts` → `runWorkspaceTool`, `isUiToolName` | built |
| AI writes that need a human | `agent_mutations` + `agent_mutation_affects` + `trust-stats.ts` — kind → trust class → apply or queue | built |
| seeding / focusing the composer | `assistant/composer-seed-store.ts`, `composer-focus-store.ts` | built |
| the feedback row above the entry | `src/lib/scan-feedback/visual.ts` — CustomEvent bus, band flash + line pulse | built |
| per-staff settings that follow the person | `staff_preferences.prefs.workspace` (Zod contract) | built |
| keybinds that a barcode cannot fire | `src/lib/keybindings/registry.ts` — `wedgeReachability()` **refuses** at registration | built |
| pinging another operator | `getInboxChannelName(orgId, staffId)` + `publish.ts` | built, **0 subscribers** |
| threads on any entity | `entity_threads` (7 entity types incl. `RECEIVING_LINE`) + `thread_messages` (`visibility: internal\|public`) | built |
| **the native shell** | `electron/` — 697-line `main.js`, sandboxed `preload.js`, `vendor-view.js`, mac entitlements, electron-builder for mac (incl. Intel legacy) + Windows NSIS | **P0–P4 executed** |
| the one renderer↔native seam | `src/lib/desktop/desktop-host.ts` — `isDesktopHost`, `printHtml`, `listPrinters`, `openExternal`, **`setDesktopKeybindings`**, vendor-view | built, **polarity backwards** (T30) |
| files | `nas-agent-client.ts`, `nas-photos.ts` — but server-side, over the network | **no preload filesystem capability exists** |
| offline | `src/lib/offline/write-queue.ts` — IndexedDB + idempotency keys | built, browser-shaped |

**Two of these are built and unadopted** — `find-field-scan.ts` and the inbox
channel. They are the cheapest wins in the repo and both are on your path.

---

## 2 · The one correction — paste is not a speed problem

The brief proposed discriminating scanner from human by *speed*, treating paste
as "fast but human" and detecting the paste chord. **That is the wrong model and
it makes the job harder than it is.**

There are three input paths and they have three *different event signatures*:

| path | what the DOM actually emits |
|---|---|
| **scanner** | N `keydown`, sub-50ms gaps, then Enter or Tab |
| **paste** | exactly **one** `paste` (ClipboardEvent) — **zero per-character keydowns**; also `beforeinput` with `inputType: "insertFromPaste"` |
| **human typing** | N `keydown`, gaps > 50ms |

You never compare paste's speed to a scanner's, because paste **never produces
keystrokes at all**. And do not watch for the chord: `Ctrl+V`, `Cmd+V`,
`Shift+Insert`, middle-click, right-click → Paste, and the touch paste callout
are six paths that all converge on the same `paste` event. Binding the chord
misses four of them.

**Measured:** the tree currently has **zero** handling of `paste`, `onPaste`,
`clipboardData` or `insertFromPaste`. So the gap is real — the fix is one
listener, not a heuristic.

```
onPaste     → source: 'paste'    (a human moved data in; treat as typed, never as a scan)
wedgeReduce → source: 'scanner'  (already implemented)
otherwise   → source: 'human'
```

Stamp `source` on the resulting event and carry it into `ops_events.payload`, so
the session record says *how* each value arrived. That is the durable half of
the requirement — "identify where the input came from and continue the session."

> **The native pivot does not invalidate any of this.** An Electron renderer
> **is** Chromium, so `paste`, `keydown` and `beforeinput` behave identically.
> Raw HID (N1 below) arrives from the **main process over IPC** as an
> *additional* source — it does not replace the DOM path, because a scanner
> configured in keyboard-wedge mode still speaks keystrokes. Native upgrades
> `source: 'scanner'` from an inference to a fact; it does not delete the
> inference.

---

## 3 · Order of work — two tracks

The pivot (**T30**) splits this into a **native track** and a **renderer track**.
They are genuinely independent: an Electron renderer is Chromium, so every
renderer phase runs unchanged in a plain browser during development and does not
wait on code signing, entitlements, or an HID driver.

**Run them in parallel. They converge once, at N1 → R1.**

```
NATIVE   N0 shell inversion ─► N1 raw HID ─┐
                             └─► N2 files  │
                             └─► N3 model  │
                                           ▼
RENDER   R1 input truth ◄──────────────────┘
         └─► R2 composer ─► R3 suggestions ─► R4 collapse + Ctrl+I
         └─► R5 onboarding   R6 settings      R7 the ping
```

---

### NATIVE TRACK

#### N0 — the shell becomes the product *(blocks N1–N3, nothing else)*
1. **Invert `src/lib/desktop/desktop-host.ts`.** It is written so *"a caller
   writes the capability check once and gets the browser path for free."* That
   polarity is backwards under T30. Rework the one module — and keep the rule it
   exists to enforce: **feature code never sniffs `window.cycleForgeDesktop`.**
   That rule is what stops the inversion from scattering into 200 call sites.
2. **Add a scoped filesystem capability to the preload.** It currently exposes
   only `printHtml`, `listPrinters`, `openExternal`, `setKeybindings` and
   vendor-view. Scoped paths and named operations — **never blanket `fs`**, and
   never a generic `invoke` channel. `sandbox: false` and `nodeIntegration` stay
   banned; a sandboxed preload can still use `ipcRenderer`.
3. **Decide what the web build still is.** Under **T31** the answer is: the GS1
   resolvers (`/01`, `/414`, `/l`, `/p`, `/s`, `/q`) and nothing else. Scope this
   explicitly now, or someone deletes them in six months and every printed
   sticker dies.
4. P5–P6 of `electron-desktop-shell-PLAN.md` (signing / release) need owner
   credentials and are not yours to complete.

**Done when:** the app boots as an installed binary, a scoped file write
round-trips from the renderer, and the resolver routes still serve in a plain
browser.

#### N1 — the scanner as a device *(converges into R1)*
5. Read the scanner over **raw HID** in the main process; hand values to the
   renderer over IPC stamped `source: 'scanner'`.
6. **Keep `wedge-scan-machine.ts` as the fallback.** A scanner in keyboard-wedge
   mode still speaks keystrokes, and not every bench will be re-provisioned.
   Native makes `'scanner'` a fact where HID is available and an inference where
   it is not — one contract, two levels of confidence.
7. **Global hotkeys.** `setKeybindings` already exists on the preload. Every
   registered chord still passes `wedgeReachability()` — a global bare-key
   binding is worse than a focused one, not better.

#### N2 — files
8. Direct NAS writes from the local process. Note `nas-agent-client.ts` reaches
   the NAS **from the server** today; a local process does not need that hop.
9. Bulk import/export, label templates, photo capture straight to disk.
10. **Offline becomes a state, not a queue.** `src/lib/offline/write-queue.ts` is
    IndexedDB-shaped; a native app has a real local store and a real sync
    boundary. Keep the idempotency-key contract — it is what makes replay safe.

#### N3 — the model on the box
11. Ollama local, with `org-provider.ts`'s BYOK chain already resolving it and
    `failover.ts` already carrying the cloud fallback for a cold or down box.
    **Build neither.** Wire the local endpoint and surface the demotion to the
    operator: *"local model unavailable — running on cloud."*

---

### RENDERER TRACK

#### R1 — the input truth layer
12. Add a `paste` listener that stamps `source: 'paste'` and short-circuits the
    wedge machine for that value. §2 has the reasoning; it survives the pivot.
13. **Adopt `find-field-scan.ts`.** The missing piece is the React adapter it
    names, `src/hooks/useFindFieldScan.ts`, which does not exist. Three
    `readFileSync` guards in `find-field-scan.test.ts` are **red** against that
    missing file — delete those three (**X1**), keep the eight behaviour tests.
14. Every value reaching the field resolves to one `{ value, source }`, whether
    it came from HID, the wedge, a paste or a human. **Nothing downstream
    guesses.**

**Done when:** four paths — HID, wedge burst, paste, hand-typing — produce the
correct `source`, proven by a test. Until N1 lands, three of the four.

#### R2 — the mounted composer
15. One field, docked to the **bottom of the screen**, never unmounted, never
    moved by content above it. Verify by expanding every collapsible section and
    asserting the dock's `y` is unchanged.
16. **Mode picker bottom-left**, collapsed to the active mode, expands *upward*.
    Modes: `note · label · talk · ticket · ask · send`.
17. **The action button morphs with the mode** — "Create ticket", "Print label",
    "Send to seller" — never a generic "Send".
18. **The destination is always named in words** (**I4**).
19. Mode chords carry ⌘/Ctrl/⌥. **Never Shift+Tab** — `Tab` is a scanner
    terminator and a wedge types capitals *with* Shift. `wedgeReachability()`
    already refuses this class; the composer refuses it the same way, by name.

#### R3 — the suggestion row
20. One line **above** the field, on the `scan-feedback/visual.ts` CustomEvent
    bus. It says what you seem to be doing and the key that does it faster —
    *"Sounds like damage — `⌥4` opens a ticket."*
21. Never steals focus, never contains an input (**I6**), never animates
    geometry (**M1**).

#### R4 — collapse, the right panel, and `Ctrl+I`
22. Sessions render as **collapsible line items** with a **collapse-all** at the
    top: context, items, label, thread, ticket. Collapsed, the session is one
    line and the assistant is front and centre.
23. Detail goes to the **right panel**, never a dialog.
24. Keep the left rail (pages + recents) — the mouse and triage path. It does not
    compete with the keyboard path.
25. **`Ctrl+I`** opens the inline info panel: what the last tool call changed,
    read from `agent_mutations` (`payload`, `reasoning`, `agent_mutation_affects`).

#### R5 — onboarding and identity
26. First run asks for **a name and an icon**, nothing else. The icon is the
    assistant's face everywhere, per staff, per org, in `prefs.workspace`.
27. **D7 still holds:** seed no workspace defaults. The icon is identity, not
    arrangement.

#### R6 — settings as questions
28. Settings become **tool calls** — "make the rows tighter" resolves to a
    `prefs.workspace` write, which is an `agent_mutation`, so it is visible under
    `Ctrl+I` and revertable.
29. Keep a rendered settings surface too. A query-only settings screen is
    unusable for someone who does not know what is configurable, and **U5**
    already rules settings is a tile.

#### R7 — the ping *(cheapest win in the repo, and independent of everything)*
30. Subscribe to `getInboxChannelName(orgId, staffId)`. The publishers are live
    and publishing into silence; `publishInboxItem`'s docblock says the receiver
    was deleted and the leg deliberately left working.

---

## 4 · Hard constraints

- **T28 · Reads are free, WRITES ARE GATED.** *Ruled 2026-08-22.* Tool-calling
  may query anything; a write goes through `agent_mutations` with its
  `mutation_kind` trust class, which decides apply-now vs. queue-for-review. The
  AI does not silently adjust inventory. This is not a brake bolted on — it is
  self-correcting: `getMutationTrustStats` reads acceptance rate, and that rate
  is the input to widening a kind's trust class, so the model **earns** autonomy
  from evidence. Approving a queued proposal keeps `actor_kind: 'agent'`
  (**T13**) or the signal is destroyed. Already built: `assistant/mutations/`,
  `trust-stats.ts`.
- **T30 · NATIVE IS THE PRODUCT.** *Ruled 2026-08-22 — an explicit pivot,
  taken after the browser-first case was put and rejected. `T29` is struck.*
  The application is installed and owns the filesystem, the input stack and the
  model. Concretely, for this upgrade:
    - **Input.** Raw **HID** reads the scanner as a *device*. The wedge timing
      heuristic in `wedge-scan-machine.ts` becomes the **fallback**, not the
      mechanism — keep it, because a scanner in keyboard-wedge mode is still a
      scanner, but stop treating inference as the primary path. The `source`
      stamp in §2 stays; native just makes `'scanner'` a fact rather than a
      guess. **Global hotkeys** work unfocused; `setKeybindings` is already on
      the preload.
    - **Files.** Real paths. Direct NAS writes, bulk import/export, label
      templates, photo capture straight to disk. Note `nas-agent-client.ts`
      currently reaches the NAS *from the server* — a local process does not
      need that round trip.
    - **Model.** Ollama on the same box. Pairs with the BYOK chain
      `org-provider.ts` already resolves; `failover.ts` still carries the
      cloud fallback when the local box is cold or down.
    - **Offline** is a first-class state, not an IndexedDB queue draining on
      reconnect (`src/lib/offline/write-queue.ts`).
  **The seam is inverted, not extended.** `src/lib/desktop/desktop-host.ts` is
  built so *"a caller writes the capability check once and gets the browser path
  for free"* — that polarity is now backwards. Rework that one module; do not
  scatter `window.cycleForgeDesktop` checks through feature code, which is the
  rule the module exists to enforce and the one thing that must survive the
  inversion. The preload today exposes only `printHtml`, `listPrinters`,
  `openExternal`, `setKeybindings` and the vendor-view calls — **there is no
  filesystem capability yet**. Add it scoped, never blanket `fs`.
- **T31 · The GS1 resolvers stay on the public web.** `/01`, `/414`, `/l`, `/p`,
  `/s`, `/q` remain small read-only pages with no operator features in them.
  This is a requirement the pivot **carries**, not an objection to it: those URLs
  are printed on stickers on boxes already in the world, a phone camera hands
  them to whatever browser the OS picks, and there is no install prompt in that
  path. **Scope them out of the native migration explicitly** — a sticker that
  resolves to nothing is a destroyed physical asset, and AGENTS.md already lists
  these paths as never-delete.
- **`orgId` comes from `ctx.organizationId`, never the request body.** Writes go
  through `withTenantTransaction`.
- **Nothing animates geometry** (**M1**). Colour and opacity only, 80ms. This is
  WMS software on a bench beside a scanner.
- **Expand → code → contract.** A nullable `ADD COLUMN` ships early; the reverse
  never does.
- **Never start, restart, or kill a dev server.** The operator owns `:3050`. A
  broken dev server is a report, not a repair.
- **Never create a branch.** Verify `git branch --show-current`.
- **Never `git add -A`, never `git stash`, never commit unless asked.**

## 5 · How to verify

Numerically, never by looking — the browser pane stops compositing when hidden,
so screenshots time out and measurement is better anyway. Assert:

- the dock's `y` is unchanged after every section is expanded;
- three input paths yield three `source` values;
- a bare-key or Shift-modified mode chord is **refused**, with the reason named;
- 0 elements with a geometry property in `transitionProperty`;
- the destination string changes with every mode.

Renderer phases verify in a plain browser — the renderer is Chromium, so this
costs nothing and is faster than driving a packaged binary. **Native phases must
be verified in the built app**, not in the dev browser: `isDesktopHost` is false
there, so a browser-only run proves nothing about N0–N3.

## 6 · Fight the brief

The operator has asked, repeatedly, to be argued with. Both premises that were
open when this was written have since been ruled — do not reopen either without
being asked:

1. **"Completely language, no learnable UI"** — resolved as *language is the
   on-ramp, the keybind is the destination*. Do not let it collapse into "type a
   sentence to receive a carton".
2. **"The entire database would be tool calling"** — **ruled (T28).** Reads yes,
   writes gated. The trust class is what makes an AI-first warehouse app
   shippable, and it widens on measured acceptance rather than on assertion.
3. **Native vs. browser** — **ruled (T30), reversing T29.** The product is an
   installed application that owns files, input and the model. The browser-first
   case was put and rejected; this is a pivot, not a misunderstanding. Do not
   re-open it. The single carve-out is **T31**, the sticker resolvers.

What is still genuinely open is in [`LAWS.md`](LAWS.md) § *Open — not yet law*.
Read that before assuming something is settled.
