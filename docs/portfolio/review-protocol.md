# Portfolio review protocol — tunnel + human checkmarks

> **Purpose:** A repeatable way for a human to verify work on **usav-dev** (or
> local + tunnel) and record approval in the portfolio SoT — without overloading
> the forge `TicketStatus` enum (`pending | in-progress | deployed`).

**SoT catalog:** [INDEX.md](./INDEX.md) · **Hub:** [README.md](./README.md)

---

## 1. When to use this

| Situation | Use protocol? |
|-----------|----------------|
| Agent finished a wave; code on a worktree or main | Yes |
| You only edited docs | Optional (doc-only row) |
| Continuous dogfood on stations/shipping | Informal; no INDEX required |
| Promote parked surface back to nav | **Required** |

---

## 2. Preconditions

1. Workstream row exists in [INDEX.md](./INDEX.md) §2.  
2. If topic work: worktree attached in §1 + `dev-worktrees.json`.  
3. Switcher starts that tree with **`dev:tunnel`** (port **3000** so Cloudflare route matches).  
4. Public URL: `https://` + `CLOUDFLARE_DEV_TUNNEL_HOST` (default `usav-dev.michaelgarisek.com`).  
5. Related `<TicketStatus />` in `master-plan.mdx` is `in-progress` (or create `WS-*-HR*` ticket).

---

## 3. Human walk (usav-dev)

Open the tunnel URL signed in as dogfood staff. For the workstream under review:

### 3.1 Universal checks

- [ ] Correct **surface** loads (not a blank error / wrong org)
- [ ] If surface is **parked**: stand-in is clear (“Work in progress”) + CTAs work  
- [ ] If surface is **unlocked** (topic tree): real UI mounts; no crash on first paint
- [ ] Primary happy path works (scan / click / save as relevant)
- [ ] No tenant bleed (wrong org data)
- [ ] Mobile or narrow width not unusable (if surface is used on phone)

### 3.2 Workstream-specific

Copy any extra checks from the long-form plan’s Accept criteria into the review log note.

### 3.3 Feedback

If something fails:

1. Set INDEX **Review** = `changes`  
2. Note in § Human review log (date, who, what)  
3. Optionally file `/api/user-issues` or GitHub issue  
4. Leave ticket `in-progress` — do **not** mark `deployed`

---

## 4. Record approval

In [INDEX.md](./INDEX.md):

1. Workstream **Review** → `approved`  
2. Append **Human review log** row: date, reviewer, result, tunnel URL, one-line note  
3. Phase → `P5-promote` (if merge still needed) or `P6-done` (if already on dogfood)

Then code path:

1. Merge worktree branch → `main` (if not already)  
2. Keep or lift nav park intentionally  
3. Automated VERIFY / forge path  
4. Only then set related MDX tickets to `deployed`

---

## 5. Checkmark map (what lives where)

| Checkmark style | Where | Who flips it |
|-----------------|-------|--------------|
| Markdown `- [ ]` walk list | This protocol (per session) | Human during walk |
| INDEX **Review** cell | INDEX.md | Human after walk |
| INDEX **Phase** | INDEX.md | Human or agent (with honesty) |
| `<TicketStatus />` | master-plan.mdx / `/forge` | Agent after VERIFY; human only if no agent |
| ops_plans task | DB bridge from MDX | Automatic via bridge |

---

## 6. Long-term operating model

```
Plan doc (messy details)
    ↓ indexed by
Portfolio INDEX (this SoT)
    ↓ executed as
master-plan.mdx tickets  →  worktree build  →  dev:tunnel
    ↓ verified on
usav-dev human walk  →  INDEX approved
    ↓ promoted
main dogfood allowlist  →  TicketStatus deployed
```

**Principles:**

1. **One catalog** — INDEX, not 30 competing README statuses.  
2. **Two statuses** — agent forge vs human review never share one enum.  
3. **One tunnel** — switcher puts active tree on :3000 + `dev:tunnel`.  
4. **Park until promote** — unfinished product stays off nav even after merge.  
5. **Delete noise** — when a plan is done, drop long-form or archive; INDEX goes `P6-done`.

---

## 7. Session template (paste into notes)

```
Workstream: WS-____
Date:
Reviewer:
Tree: main | glass | studio | other:____
URL: https://usav-dev.…
Result: approved | changes
Notes:
- 
Follow-ups:
- 
INDEX updated: yes / no
MDX ticket ids touched:
- 
```
