# Handoff — Org dropdown chrome + staff photo avatars (GCS)

**For:** implementing agent (Cursor / Claude Code)
**From:** Cycle Forge engineering
**Date:** 2026-08-01
**Status:** SHIPPED 2026-08-01 — §2 (org circle + always-dropdown) and §3 (staff photo → GCS → avatar SoT) are implemented, migration applied. Remaining: authed browser smoke (§6) — an agent has no session and must not enter credentials.
**Lane:** current checkout — no ad-hoc branch. Attach to `:3050`. User owns commits.
**Product frame:** Cycle Forge multi-tenant reseller-ops SaaS. USAV is dogfood only.

**Paste for a new session:**

```
Read docs/todo/staff-org-avatar-photo-HANDOFF.md and execute §2 → §5 in order.

Finish the MasterNav identity chrome:
1) Org top control MUST be an explicit dropdown trigger with a CIRCLE mark
   matching StaffAccountFooter (not a rounded square).
2) Staff can upload a personal photo to GCS; that photo becomes the avatar
   everywhere staff identity is shown (spine footer, serial journey, timelines,
   sign-in, admin) — falling back to staff-color initials when no photo.

Compose from existing SoTs — never invent a second photo upload waist or a
page-local avatar. Attach to :3050; never start/restart/kill the dev server.
User owns commits. npm run verify before done.
```

**Lineage (read when blocked, do not re-open closed decisions):**

| Doc / file | Role |
|---|---|
| `.claude/rules/source-of-truth.md` (Org / workspace switch · Staff account) | Spine chrome law (shipped) |
| `.claude/rules/display/workbench.md` (spine top / staff footer) | Display law |
| `src/components/sidebar/master-nav/OrgWorkspaceControl.tsx` | Org top — **needs circle + always-dropdown** |
| `src/components/sidebar/master-nav/StaffAccountFooter.tsx` | Staff footer — circle initials SoT for mark geometry |
| `src/lib/identity/switch-org.ts` + `use-switch-org.ts` | Switch path (confirm → POST → hard reload) |
| `src/lib/photos/service.ts` → `uploadPhoto` | **Only** photo upload waist |
| `src/lib/photos/storage/gcs-adapter.ts` + `path-builder.ts` | GCS adapter / object keys |
| `src/utils/staff-colors.ts` + `StaffColorsProvider` | Color fallback SoT |
| `src/design-system/components/StaffBadge.tsx` (`staffInitials`) | Initials SoT — delete forked `initials()` twins |
| `src/lib/timeline/types.ts` (`TimelineItem.actor` is string-only today) | Journey/timeline actor shape |

---

## 0. One-sentence goal

Make the MasterNav **org control a circle + dropdown** (parity with the staff footer mark), and ship **per-staff profile photos on GCS** that replace initials everywhere staff identity is shown — including the serial journey and event timelines — with initials+color as the fallback.

---

## 1. What already shipped (do not re-litigate)

```text
MasterNav spine
┌─────────────────────────────────┐
│ OrgWorkspaceControl (top band)  │  ← EXISTS; needs visual + dropdown finish
├─────────────────────────────────┤
│ TOP PIN · drills · body         │
├─────────────────────────────────┤
│ TechRailSearchBar               │
│ Admin · Settings                │
│ StaffAccountFooter              │  ← circle initials + more + sign-out
└─────────────────────────────────┘

GlobalHeader (desktop): Quick Access icons only — NO staff avatar
Mobile: compact account avatar still in GlobalHeaderActions
```

- Switch path is shared: `useSwitchOrg` / `requestSwitchOrg` (Settings cards compose from it).
- Desktop avatar was removed from `GlobalHeaderActions`; phone history / feedback live in staff “more”.
- Guards: `src/components/layout/header-mode.guard.test.ts` asserts org top + staff footer + no desktop avatar.

**Do not** put Quick Access pins or kiosk back into the staff menu. **Do not** remount a “name of now” page label in the top band.

---

## 2. Finish A — Org top: circle mark + real dropdown

### Locked UX

| Rule | Detail |
|---|---|
| Mark geometry | **Circle** — same family as `StaffAccountFooter` avatar (`rounded-full`, ring, initials). Today’s org mark is `rounded-md` square — **wrong**. |
| Size | Match footer mark density in the 40px band: use **`h-7 w-7`** (same as footer) or document one shared token if both must stay in lockstep. Prefer extracting a shared `IdentityMark` primitive (circle + image-or-initials) rather than twinning classes. |
| Control | **Always a dropdown trigger** — even for single-org accounts. Single-org menu shows current workspace only (+ link to Settings → Organization). Multi-org lists others and switches via `useSwitchOrg`. |
| Chevron | Always visible on the trigger (`aria-expanded`, `aria-haspopup="listbox"`). |
| Menu | Keep `AnchoredLayer` `placement="bottom-start"`. Current row + switchable others. Hard reload on switch unchanged. |

### Files to change

- [`OrgWorkspaceControl.tsx`](../../src/components/sidebar/master-nav/OrgWorkspaceControl.tsx) — circle mark; always mount menu trigger; single-org still opens a slim menu (current only).
- Optional extract: `src/components/identity/IdentityMark.tsx` (or under `design-system`) — `variant: 'org' | 'staff'`, `size: 'sm' | 'md'`, `src?: string | null`, `initials`, `colorHex`.
- Update `header-mode.guard.test.ts` if it asserts square/rounded-md or single-org display-only.

### Acceptance (A) — DONE

- [x] Org mark is a circle visually matching the staff footer mark — both compose
      `IdentityMark` at the same `sm` density (`src/components/identity/`).
- [x] Clicking the org row **always** opens a dropdown (single- and multi-org);
      the single-org menu names the workspace + links `admin.view`-gated
      Settings → Organization.
- [x] Multi-org switch still confirms + hard-reloads to `/dashboard` (`useSwitchOrg`
      untouched).
- [x] Guard green — `header-mode.guard.test.ts` grew two tests: *spine identity
      marks are ONE circular primitive* and *OrgWorkspaceControl is ALWAYS a
      dropdown trigger*.

---

## 3. Finish B — Staff profile photo → GCS → avatar SoT

### Product

Operators upload **one personal photo per staff profile**. That photo is the avatar in:

1. MasterNav `StaffAccountFooter` (and mobile account chip)
2. Serial journey / `EventTimeline` actor chips
3. Inventory / receiving event rows that show an actor
4. Sign-in staff picker / PIN chrome
5. Admin staff identity cards / schedule pills
6. Any future `staffAvatar` grid cell

**Fallback:** staff-color circle + `staffInitials(name)` when no photo (or load fails).

### Schema (greenfield — nothing exists today)

`staff` has **no** avatar column. Add one (migration + Drizzle), preferred shape:

```text
staff.avatar_photo_id  integer  NULL  REFERENCES photos(id)  ON DELETE SET NULL
```

- Store a **photo id** (platform locator), not a raw GCS URL — content is always served through `/api/photos/[id]/content` (signed/streamed). Same pattern as receiving evidence.
- Org-scoped: photo row carries `organization_id`; staff row is already tenant-scoped.
- Optional later: crop/focus metadata in `staff_preferences.prefs` — **not** required for v1.

Also extend auth envelope / `/api/staff` payloads so clients receive `avatarPhotoId` (or resolved content URL) without N+1.

### Photos platform (compose — do not fork)

| Concern | SoT |
|---|---|
| Upload | `uploadPhoto()` in `src/lib/photos/service.ts` via `POST /api/photos/upload` |
| GCS | `gcs-adapter.ts` · bucket env `PHOTOS_GCS_BUCKET` |
| Paths | `path-builder.ts` — add a staff prefix, e.g. `{orgId}/staff/{staffId}/avatar/{uuid}` |
| Entity type | Add **`STAFF`** to `PHOTO_ENTITY_TYPES` in `src/lib/photos/types.ts` (+ DB check/constraint migration if the enum/check lives in SQL) |
| Link | `photo_entity_links` with `entity_type = 'STAFF'`, `entity_id = staff.id`, `link_role = 'primary'` |
| Serve | Existing `/api/photos/[id]/content` |

**New route (thin):** e.g. `POST /api/staff/me/avatar` (self) and/or `POST /api/staff/[id]/avatar` (admin) — validate image, call `uploadPhoto`, set `staff.avatar_photo_id`, audit. Permission: self = authenticated staff; admin = existing staff manage perm. Follow `.claude/skills/new-route/SKILL.md` + `audit-route-auth:emit`.

**Settings UI:** upload/replace/remove on Settings → staff profile / Appearance (or Identity card in admin). Use existing file-input + photo thumb patterns; no third upload waist.

### Shared avatar component (SoT)

Create **one** client component, e.g. `StaffAvatar`:

```ts
StaffAvatar({
  staffId: number;
  name?: string | null;
  avatarPhotoId?: number | null;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
})
```

- Photo → `<img src={/api/photos/${id}/content}>` (or a small resolver hook) inside `rounded-full`.
- No photo / error → `getStaffColorHex({ id: staffId })` + `staffInitials(name)`.
- **Delete** forked local `initials()` / ad-hoc circles in `StaffAccountFooter`, `QuickAccessPopover`, sign-in, etc. — compose `StaffAvatar`.

Org mark for Finish A can share the circle shell (`IdentityMark`) but org does **not** use staff photos (org initials / future org brand logo is a separate lane — out of scope unless trivial).

### Timeline / serial journey (actor must carry staff id)

Today `TimelineItem.actor` is a **string name only** (`src/lib/timeline/types.ts`). Photos cannot resolve from a name.

**Grow the SoT (do not fork page-local maps):**

```ts
// additive — keep `actor` string for copy; add:
actorStaffId?: number | null;
```

- Adapters that already join `actor_staff_id` (e.g. serial-units timeline) must **pass it through**.
- `EventTimeline` / serial journey row: render `StaffAvatar` beside the actor name when `actorStaffId` is present.
- Inventory `EventRow` and similar: same — prefer staff id from the API; if only a name exists, keep text-only (no guess-by-name).

Batch the highest-value surfaces in v1:

1. `StaffAccountFooter` + mobile account chip  
2. `SerialJourneySection` / `EventTimeline`  
3. Sign-in staff picker  
4. Admin `IdentityCard`  

Secondary (same PR or immediate follow-up): inventory pulse `EventRow`, ops `LiveFeedCard`, receiving “by {staff}” stamps.

### Acceptance (B) — DONE (except the authed smoke)

- [x] `2026-08-01e_staff_avatar_photo.sql` adds `staff.avatar_photo_id`
      (BIGINT → `photos(id)` ON DELETE SET NULL + partial index) and extends
      `chk_photo_entity_links_entity_type` with `STAFF` + the matching
      `trg_delete_photos_on_staff_delete`. **Applied**; Drizzle modelled
      (`avatarPhotoId`; FK stays SQL-only — `photos` already references `staff`,
      so the reverse would make both table consts circular initializers).
- [x] `STAFF` in `PHOTO_ENTITY_TYPES`, `UPLOAD_PERM_BY_ENTITY` (`admin.manage_staff`),
      the `stages.ts` write matrix (`staff_avatar` is the ONLY legal photo_type),
      and the path builder (`{org}/staff/{staffId}/avatar/{photoId}.jpg`).
- [x] `POST`/`DELETE /api/staff/[id]/avatar` — self OR `admin.manage_staff`,
      composes `uploadPhoto()`, audits `staff.avatar.set` / `.clear`, deletes the
      replaced photo, invalidates the staff caches. Settings → Appearance ▸
      **Your photo** (`StaffPhotoCard`) is the UI.
- [x] `StaffAvatar` / `IdentityMark` are the only avatar primitives. Five forked
      local `initials()` deleted (`StaffAccountFooter`, `StaffPickerList`,
      `StaffPinPad`, `SetPinPad`, `StaffSigningIn`, `QuickAccessPopover`).
      Wired: spine footer, Quick Access chip, sign-in picker + PIN chrome,
      admin `StaffEditCard`, ops `LiveFeedCard`, `EventTimeline` actor.
- [x] `TimelineItem.actorStaffId` (additive) + passthrough in the inventory /
      SAL / audit / ops adapters, and the journey + order-timeline SQL now select
      the staff id. `EventTimeline` renders an `xs` mark beside the actor name.
- [x] No photo (or a 404 on the content route) → staff-colour initials.
- [x] `npm run verify`: Lint · Typecheck · Route-permission drift · Route-auth
      enforce · Schema drift · Doc catalog all green; the two remaining ✗ gates
      (5 `sidebar-navigation.ts` nav tests + 8 `procedure/*` knip types) are
      **another session's in-flight work in the shared tree**, not this change.
- [ ] **Authed browser smoke still open** — see §6. Public surface verified on
      `:3050`: `/signin` 200, `/api/auth/staff-picker` 200 (returns
      `avatar_photo_id`), anonymous `/api/photos/1/content` → 401 (the
      current-staff-avatar branch correctly does not open the door for a
      non-avatar photo), `DELETE /api/staff/1/avatar` without a session → 401.

---

## 4. Explicit non-goals

- Org **brand logo** upload (tenant branding already has settings fields — separate from staff photo).
- Changing org switch hard-reload contract.
- Putting staff avatar back in the desktop GlobalHeader.
- Building a second CDN/image pipeline outside `photos` platform.
- Guessing avatars from display name when `actorStaffId` is missing.

---

## 5. Execution order

1. **A — Org circle + always-dropdown** (small, UI-only; unblocks visual parity).  
2. **Shared `IdentityMark` / `StaffAvatar` shell** (initials-only first, wire footer + org).  
3. **Migration + photo entity `STAFF` + upload route + Settings UI.**  
4. **Auth/staff payload includes `avatarPhotoId`; StaffAvatar loads content URL.**  
5. **Timeline actorStaffId plumb + SerialJourney / EventTimeline.**  
6. **Sweep remaining initials twins; update SoT/display one-liners; verify.**

---

## 6. Verify / smoke

```bash
npm run verify
# :3050 — needs a signed-in session (an agent has none and must not enter credentials)
# 1. Org circle + dropdown opens on a single-org account too
# 2. Settings → Appearance ▸ Your photo → upload → spine footer flips immediately
# 3. Open a serial journey / order timeline event by that staffer → avatar beside the name
# 4. Sign out → the sign-in picker shows the face (anonymous current-avatar branch)
# 5. Remove → initials return everywhere
```

**One decision worth reviewing:** step 4 required a narrow anonymous branch in
`/api/photos/[id]/content` — a photo is served without a session ONLY when it is
the **current** `avatar_photo_id` of an active staffer in the tenant the request's
host resolves to. That is exactly the set `/api/auth/staff-picker` already
discloses publicly (name + role + colour), and a superseded avatar stops being
readable the moment it stops being current. If staff faces should NOT be visible
pre-auth, delete `resolveCurrentStaffAvatarOrg` and the sign-in surfaces fall back
to initials with no other change.

Never start/restart/kill the dev server. User owns commits.
