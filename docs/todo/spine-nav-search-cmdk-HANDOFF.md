# Handoff — spine identity chrome, ⌘K arbitration, nav search, spine typography

**For:** next agent (Claude Code / Cursor / Codex)
**From:** Cycle Forge engineering
**Date:** 2026-08-02
**Status:** shipped + browser-verified, typography wave included
**Lane:** `main` checkout — no ad-hoc branch. Attach to `:3050`. **User owns commits.**
**Product frame:** Cycle Forge multi-tenant reseller-ops SaaS. USAV is dogfood only.

**Paste for a new session:**

```
Read docs/todo/spine-nav-search-cmdk-HANDOFF.md. §1–§5 are DONE and verified —
do not re-open them. Continue from §6 (open items).

Attach to :3050; never start/restart/kill the dev server. User owns commits.
npm run verify before done — §7 lists which red gates are other sessions'.
```

**Lineage (read when blocked; do not re-litigate closed decisions):**

| Doc / file | Role |
|---|---|
| `.claude/rules/source-of-truth.md` → *Identity mark*, *Staff profile photo*, *Nav search*, *⌘K has exactly one owner* | The four laws this session added |
| `.claude/rules/display/workbench.md` → spine top / staff footer / section drills | Display law |
| `src/lib/nav/nav-search.ts` + `nav-destinations.ts` | The one nav matcher + the flat destination list |
| `src/components/identity/` | `IdentityMark` (circle) + `StaffAvatar` (photo → colour+initials) |
| `src/components/layout/cmdk-owner.guard.test.ts` | ⌘K single-owner + no-false-hints guard |
| `docs/todo/staff-org-avatar-photo-HANDOFF.md` | The avatar/org brief this session executed |

---

## 0. One-sentence state

The MasterNav spine now has one circular identity family (org + staff), staff
profile photos on GCS behind the photos waist, a single-owner ⌘K that works from
inside text fields, and a nav search that returns **destinations** instead of
categories — all guarded and browser-verified on `:3050`.

---

## 1. DONE — spine identity chrome + staff photos

Executed from `staff-org-avatar-photo-HANDOFF.md` (that doc's acceptance
checklists are ticked; read it for the detail).

- **Org top control** is an always-mounted dropdown (single-org included) wearing
  the shared circular `IdentityMark` at the same `sm` density as the staff footer.
- **`staff.avatar_photo_id`** (`2026-08-01e_staff_avatar_photo.sql`, **applied**)
  → `photos(id)` `ON DELETE SET NULL`; `STAFF` joined the `photo_entity_links`
  discriminator with its parent-delete trigger in the same migration.
- **`POST`/`DELETE /api/staff/[id]/avatar`** — self OR `admin.manage_staff`,
  composes `uploadPhoto()`, audits, deletes the replaced photo.
- **`StaffAvatar` is the only avatar primitive.** Six forked local `initials()`
  deleted. Wired: spine footer, Quick Access chip, sign-in picker + both PIN pads,
  admin `StaffEditCard`, ops `LiveFeedCard`, `EventTimeline` actor.
- **`TimelineItem.actorStaffId`** (additive) + passthrough in the inventory / SAL /
  audit / ops adapters; the journey + order-timeline SQL select the staff id.

**Not done:** the authenticated upload smoke (§6.1).

## 2. DONE — ⌘K arbitration

Three claimants shipped at once; ⌘K now has **exactly one owner**.

| Was | Now |
|---|---|
| `CommandBar` bound it | **still the owner** |
| `useQuickAccessHotkey` bound it, `hotkey: 'cmdk'` **defaulted on** → one press opened palette *and* Quick Access, both `preventDefault` | module + setting + Settings toggle **deleted**; a stored `hotkey` is stripped on read |
| `GlobalHeaderSearch` bound nothing but rendered `label="Search (⌘K)"` | claim removed — plus 4 more false hints (`QuickAccessButton`, `AiChatConversation`'s visible footer, 2 docblocks) |

**A suppressor is allowed and is the opposite of a claimant.** `usePhotoGallery`
swallows the chord so the lightbox focus trap holds — allowlisted, and asserted
to really be a suppressor (`stopPropagation`, no action).

## 3. DONE — ⌘K was unreachable from text fields

Separate defect, found by pressing the key rather than by reading the code.

```js
const editable = tag === 'INPUT' || tag === 'TEXTAREA' || ... ;
if (editable && !open) return;   // ← ⌘K dead in every input
```

Standing a hotkey down while typing is right for a **bare key** (the user is
producing that character) and wrong for a **modifier chord** — nobody types ⌘K,
so there is nothing to yield to. The bail killed the palette exactly when an
operator was mid-task in a field. The old code half-knew this: `&& !open`
already carved out the palette's own input.

Removed; `e.key.toLowerCase()` so Caps Lock still resolves. Guarded.

> **Sequencing note for the reader:** §2 made §3 visible. Before the retirement,
> ⌘K-in-a-field opened the *Quick Access* menu via the duplicate binding, so
> something happened. Two bugs stacked.

## 4. DONE — nav search returns destinations, not categories

**The defect:** the spine filter matched pages *and* mode labels, but
`renderRoot` only ever rendered **section drill buttons**. Typing `incoming`
returned `Inbound ›` — a category that does not contain the typed word.
(`Incoming` is a *mode* of the page labelled `Inbound`, so it could never render.)

**The model — tree at rest, FLAT while searching.** Categories answer "what
exists"; search answers "take me to what I named". Filtering the category
*buttons* served neither.

- **One matcher**: `nav-search.ts` — exact → prefix → word-prefix → substring →
  subsequence, multi-token AND, highlight offsets. The ⌘K palette and the spine
  both compose it; the two divergent `includes()` matchers are **deleted**.
- **A mode is a destination** — `nav-destinations.ts` flattens pages *and* modes.
- Parent rides as row metadata (section for a page, page for a mode), suppressed
  when it would repeat the label.
- ↓/↑/Enter from the box; empty state names the query back.
- Keyword hits (href, section) never highlight and rank below any label match of
  the same tier — a row that floats up with nothing marked is unexplainable.

**Two bugs the tests caught before ship:** `otherPages` is misnamed upstream (it
is the *full* list), so spreading `activePage` duplicated every destination under
identical keys — two rows lit per cursor step. And `Inbound` inside section
Inbound rendered `Inbound / INBOUND`.

---

## 5. DONE — typography

Two changes, both requested 2026-08-02.

### 5a. Size bump (the spine has no size hierarchy)

Every destination in the spine is `role-caption` = **12px**; pages and modes
differ only by weight. 12px is below every peer (VS Code 13, Linear 13,
Notion 14, Slack 15, Vercel 14).

| Row | Was | Now |
|---|---|---|
| Org band | `role-body` 14 | unchanged |
| Section drills + L1 page rows | `role-caption` 12 | **`role-body` 14** |
| L2 mode rows | `role-caption` 12 | unchanged — now genuinely secondary |
| Counts | `role-micro` 10 | unchanged |

One size for "a destination" across the whole spine. Row height 28 → 32px.
Stays density-aware, so `--cf-density` and the Settings text-size control still
scale it. SoT: `source-of-truth.md` → *MasterNav spine type ladder*;
guard: `main-nav-groups.guard.test.ts`.

### 5b. Sans cut → Inter (Google Fonts)

**This reverses a standing house law, deliberately and at the user's direction.**
`kinetic-ledger.md` bans "a second visual language", and `families.ts` had no
spare slot on purpose. The readability complaint was real, so the ruling changed
rather than being worked around.

**Inter**, chosen because this UI lives at 12–14px and Inter was drawn for
screen UI at exactly that size (larger x-height, more open apertures) — the
readability win compounds with 5a rather than duplicating it.

Done as an **SoT swap, not a fork** — `fonts.ts` + `families.ts` + `globals.css`
(mirrored byte-for-byte) + `tailwind.config.ts` fallbacks + `layout.tsx` + the
typography guard + the rules prose in `ui-design-system.md`, `kinetic-ledger.md`
and `source-of-truth.md`. There is still exactly one sans face; it is a
different one. **A fourth slot (a display/heading face) is still banned** — that
is what the old "one macro-family" rule was actually protecting.

**Kept as IBM Plex, deliberately:**

- **Condensed** — Inter ships no condensed cut on Google Fonts, and that cut is
  load-bearing: `text-role-eyebrow` / `-micro` bind it so 10–11px chrome fits a
  grid column. Swapping in a normal-width face would widen every eyebrow and
  wrap grid headers — a layout regression dressed as a font change.
- **Mono** — identifiers must be retypable and must never ligate; Plex Mono is
  tuned for that and Inter has no monospace sibling.

**The var was renamed `--font-ibm-plex-sans` → `--font-cf-sans`.** A var named
after a foundry it no longer holds is the same class of defect as a tooltip
advertising a shortcut it does not own.

**Trap worth knowing:** Inter is a VARIABLE font. Requesting it without an
explicit `weight: ['400','500','600']` ships the whole 100–900 axis, which makes
a stray `font-bold` render at a real 700 and silently defeats the 600 cap.
Guarded (`typography-tokens.guard.test.ts` → *the sans cut loads no weight above
the 600 cap*).

**Measured after the swap:** `--font-cf-sans` resolves to Inter, body computes to
Inter, spine section rows compute to **14px** (were 12), **zero** truncated
labels in the 240px spine, and `/dashboard` has no horizontal overflow
(scrollWidth === clientWidth at 1440).

---

## 6. Open items

1. **Authenticated avatar smoke** — upload a photo in Settings → Appearance ▸
   Your photo, confirm the spine footer flips, then find a timeline event by that
   staffer. An agent has no session and must not enter credentials.
2. **Palette does not fire CRUD actions** — it jumps to pages + entities only.
   The old `workbench.md` cmd-K gap note was rewritten to say this.
3. **`dispatchGlobalSearchFocus` has zero callers.** Two listeners
   (`GlobalHeaderSearch`, `SearchSidebarPanel`) wait for an event nobody sends.
   Either wire "re-click Search" to it or delete the module. Left alone: it is
   adjacent to another session's search work.
4. **Condensed + mono are still IBM Plex** after 5b (§5b explains why). If the
   mixed-superfamily look ever grates, the replacement for condensed must be
   genuinely narrow — Inter Tight is only slightly tighter and would wrap grid
   headers. Measure eyebrow widths before swapping.
5. **Spine filter vs ⌘K overlap.** Now that spine search flattens and ranks, it
   and the palette take the same input and return the same set — the spine
   version just in a narrower window that requires the spine open. Deleting the
   spine field is a legitimate future simplification; do not do it in the same
   change, and re-ask after living with both.

---

## 7. Verify

```bash
npm run verify
npx playwright test tests/e2e/cmdk-palette.spec.ts \
  tests/e2e/sidebar-nav-search.spec.ts \
  tests/e2e/sidebar-open-close.spec.ts --project=desktop
```

**Coverage added this session:** 47 unit (nav matcher + the LIVE registry),
6 ⌘K source-guard, 22 E2E (6 ⌘K · 9 spine search · 7 open/close).

**Red gates that are NOT this work** (other sessions in the shared tree — report,
do not inherit):

- knip: `procedure/*` types, `StationAmbientWash`, `interop/*` (GS1/EPCIS wave)
- `carton-inspector.guard` — *the Photos CTA is the primary entry*
- `receiving-events.guard` — raw CustomEvent ratchet 94 → 96
- route-permission drift when the `interop` wave adds routes → **they** emit it

**Do not** run `npm run audit-route-auth -- --emit` to clear that drift while the
interop routes are mid-flight; it sweeps another session's work into your diff.
