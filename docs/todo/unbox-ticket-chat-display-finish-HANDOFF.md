# Handoff — finish the station Ticket **chat Displays** surface (composer gutter + bubble rows)

**Status:** done · **Lane:** main (dogfood) · **Opened:** 2026-08-08 · **Finished:** 2026-08-08
**Owner of the ruling:** product (user). This handoff carries a **deliberate SoT reversal** — read the "SoT reversal" section before touching code.

---

## The surface

The right-edge **Ticket** Displays leaf on scan stations (Unbox golden; Testing peer). Path:

```
StationDisplaysPushStack (leaf: ticket)
  └─ TicketDisplayHost                       src/components/receiving/workspace/line-edit/TicketDisplayHost.tsx
       └─ [linked ticket] SupportTicketDetail  src/components/support/zendesk/chat/SupportTicketDetail.tsx
            ├─ MergedRecordStream  (the chat ROWS)   src/components/support/zendesk/chat/MergedRecordStream.tsx
            └─ SupportChatComposer (the ENTRY bubble) src/components/support/zendesk/chat/SupportChatComposer.tsx
       └─ [no ticket]     ReceivingClaimPanel (claim create/link — OUT OF SCOPE here)
```

Column host tokens (`src/design-system/shells/detail-stack/layout.ts`):
- `DISPLAYS_FLUSH_HOST` = `px-0` — the column is flush edge-to-edge **by design** (chrome plates/verb strips read edge-to-edge).
- `DISPLAYS_BODY_INSET` = `px-4` — the **opt-in** "rows own their gutter" grammar. Body **content rows** (text clusters, the conversation, the composer) opt into this; the host never pads.

Already-landed adjacent work (do not redo, build on it):
- **Task 3 (done):** `SupportChatComposer` default branch no longer sits on a `bg-surface-canvas/40 px-3 py-2 border-t` plane — it floats (`<div className="shrink-0 p-2">{dock}</div>`). `OmnichannelComposerDock` (`chrome="raised"`) is the rounded, elevated bubble.
- **Task 2 (done):** the leaf header (`< Ticket` back/breadcrumb) is the 24px `STATION_SECONDARY_BAND_FACE` eyebrow band.

---

## Two jobs to finish this display

### Job A — no edge-to-edge padding (composer + rows sit in the readable gutter)

**Symptom (latest screenshot):** the floating composer bubble ("Internal note…", the Internal/Public toggle) bleeds off the **right** edge of the Displays column and is clipped; the conversation rows and composer do not share one consistent left/right gutter.

**Requirement:** the conversation body **and** the floating composer sit inside the column's readable gutter — `DISPLAYS_BODY_INSET` (`px-4`) — with symmetric left/right air. The floating composer must never touch or clip the column edge on either side.

**Do:**
- Ensure the composer is rendered inside the `DISPLAYS_BODY_INSET` (`px-4`) content region, or give its floating wrapper the equivalent symmetric gutter, so the bubble's own elevation/rounded corners are fully visible with air on **both** sides. The Task-3 `p-2` is breathing room around the bubble, not the column gutter — the gutter is the `px-4` body inset; reconcile the two so they don't double up or fight (don't stack `px-4` + a wide bubble that overflows).
- Verify against the real column min width (`STATION_DISPLAYS_MIN_WIDTH_PX = 280`) — the bubble + toggle row must fit and wrap within 280px without clipping.

**Don't:**
- Re-pad the **host** (`DISPLAYS_FLUSH_HOST` stays `px-0`) — gutters live on rows (`DISPLAYS_BODY_INSET`), never the host, never a second nested card (layout.ts docblock).
- Reintroduce the `bg-surface-canvas` plane behind the composer (that was Task 3's removal).

### Job B — chat rows become **bubbles** (read-a-conversation, not select-a-list)

**Requirement:** on this Ticket Displays surface the message rows render as **conversation bubbles** (inbound vs outbound distinguished by the bubble), *because this surface is READ, not SELECTED*. This is the operator's difference from a scan-station list: a scan-station row is a selectable ledger entry; a support conversation is prose you read top-to-bottom and reply to.

**Constraints (keep the shared waist — do NOT fork a third renderer):**
- Rows stay `TimelineItem`s produced by the existing `src/lib/timeline/` adapters (`zendeskCommentsToTimeline`, event `*ToTimeline`). **Merge / sort / day-key logic is unchanged.**
- Day banding stays the shared `DateGroupHeader`.
- Block markdown bodies still render via `renderBlockMarkdown` (`src/lib/support/markdown.ts`) — no `dangerouslySetInnerHTML`, no `prose` plugin (there isn't one).
- Attachments grid, reduced-motion behavior, and the bounded/virtualized tail (never an unbounded map) all stay.
- Reading direction stays **ascending** (composer docked at bottom → newest adjacent to it).
- Author identity uses `IdentityMark` / `StaffAvatar` (resolve by id, never guess from a name).
- Still **messages-only** on station Ticket (`mergeFloorTimeline={false}`); floor events stay on the peer **Timeline** Displays tab (`ticket-timeline-split.guard.test.ts` must stay green).

**Scope decision to make (and record in the SoT update):** `MergedRecordStream` is the shared renderer for BOTH the station Ticket Displays **and** the `/support` service workspace thread. Decide whether the bubble treatment is:
- (a) **station Ticket Displays only** (a `variant`/prop on `MergedRecordStream`, default stays flat for `/support`), or
- (b) **both surfaces** (the flat-row era ends).
Recommended: **(a) a `variant="bubble"` prop**, opted into by `SupportTicketDetail` when `embedded` (station), so `/support`'s dense triage list is untouched unless product later flips it. Pick one and write it down.

---

## ⚠️ SoT reversal — this OVERRIDES existing law, so update the law in the same change

The current SoT **explicitly bans** what Job B asks for. This is not drift — it was a deliberate 2026-08-02 decision, and it must be **rewritten**, not quietly contradicted (`pattern-evolution.md` Always #6: a retirement isn't done until the guard/prose is updated to the new truth).

Files that assert "flat rows, no bubbles" and MUST be updated to the new ruling:
1. **`.claude/rules/ui-design-system.md` → "Conversation & message rows"** (≈ line 240). Today: *"Tone is information, never decoration… Ragged variable-width blobs are banned… One shared left reading edge."* → Rewrite to carve out the **read-a-conversation** surface: bubbles ARE the right anatomy where the job is reading a conversation (not selecting ledger rows); the flat one-row anatomy remains the law for **selectable** dense lists (scan-station ledgers, triage queues). State the discriminator explicitly: **read vs select**.
2. **`.claude/rules/display/reference-timeline.md` → "The second sanctioned sibling: `MergedRecordStream`"**. Today it argues bubbles "destroy scan speed" and the job is "reconstruct truth fast." → Amend: on the **station Ticket read surface**, the job is *read + reply to a conversation*, so bubbles are correct there; the flat-ledger argument stays for any surface where the stream is scanned/selected (e.g. an interleaved floor timeline).
3. **`MergedRecordStream.tsx` docblock** — the long "It replaced `SupportChatThread`… a bubble layout spends the surface's only free signalling channel" paragraph. → Rewrite to state the new variant and why (read-not-select), keeping the shared-waist reasoning (still one `TimelineItem` adapter set; only the row **shell** changes).
4. **`.claude/rules/source-of-truth.md` → "Ticket vs Timeline (station Displays)"** and the "Omnichannel / chat-style composer dock" rows — add the bubble-variant + floating-composer facts.

Guards to update (they currently pin the flat-row law):
- **`support-chat-hierarchy.guard.test.ts`** — re-point any assertion that mandates flat `divide-y` rows / bans bubble fills, to the new variant contract.
- **`ticket-timeline-split.guard.test.ts`** — must stay green (messages-only on station Ticket is unchanged); only touch if a selector name changes.
- Consider a **new guard** pinning: (i) composer respects `DISPLAYS_BODY_INSET` / no edge bleed; (ii) bubble variant keeps the shared `TimelineItem` adapters + `DateGroupHeader` + markdown renderer (so a future edit can't fork a third chat renderer).

**Do NOT** resurrect the deleted `SupportChatThread`. Build the bubble shell **inside** `MergedRecordStream` behind the variant, reusing its adapters/day-bands/markdown — a fork is the one thing every one of these laws is protecting against.

---

## Definition of done
- [x] Composer + conversation share the `px-4` readable gutter; floating bubble never clips the column edge (verified at 280px min width).
- [x] `MergedRecordStream` renders bubble rows on the station Ticket surface (variant decided + documented), inbound/outbound distinguished by the bubble; `/support` behavior per the recorded scope decision.
- [x] Shared waist intact: `TimelineItem` adapters, `DateGroupHeader`, `renderBlockMarkdown`, attachments, reduced motion, bounded tail, ascending order, `IdentityMark`/`StaffAvatar`.
- [x] SoT prose rewritten (the 4 files above) — the ban is replaced by the read-vs-select discriminator, not silently contradicted.
- [x] Guards updated (`support-chat-hierarchy` re-pointed; `ticket-timeline-split` still green; optional new bubble/gutter guard).
- [x] `npm run verify` green (note any pre-existing failures from concurrent lanes separately).
- [ ] Visual check on `:3050` (auth-walled for the finisher — confirm Unbox Ticket Displays bubbles + gutter + `/support` ledger after sign-in).

## Anchors (quick open)
- `src/components/support/zendesk/chat/MergedRecordStream.tsx`
- `src/components/support/zendesk/chat/SupportChatComposer.tsx`
- `src/components/support/zendesk/chat/SupportTicketDetail.tsx`
- `src/components/receiving/workspace/line-edit/TicketDisplayHost.tsx`
- `src/design-system/shells/detail-stack/layout.ts` (`DISPLAYS_FLUSH_HOST`, `DISPLAYS_BODY_INSET`)
- `src/design-system/primitives/OmnichannelComposerDock.tsx`
- `src/lib/timeline/*` (adapters), `src/lib/support/markdown.ts` (`renderBlockMarkdown`)
- Laws: `.claude/rules/ui-design-system.md` §Conversation & message rows · `.claude/rules/display/reference-timeline.md` · `.claude/rules/source-of-truth.md` (Ticket vs Timeline · Composer dock)
- Guards: `support-chat-hierarchy.guard.test.ts` · `ticket-timeline-split.guard.test.ts`
