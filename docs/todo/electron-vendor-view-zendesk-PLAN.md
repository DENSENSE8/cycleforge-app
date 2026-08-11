# PLAN stamp — Electron N5 VendorView + Zendesk dual-path (executed)

**Date:** 2026-08-10  
**Status:** Implemented in checkout — SoT laws + Electron VendorView + ticket presets + Open-full-ticket dual path.  
**SoT:** [`source-of-truth.md`](../../.claude/rules/source-of-truth.md) → Station desktop VendorView · [`AGENTS.md`](../../AGENTS.md) hard law.  
**Parent shell:** [`electron-desktop-shell-PLAN.md`](./electron-desktop-shell-PLAN.md) (N5 supersedes vendor-embed HARD BAN).

## What landed

| Layer | Paths |
|---|---|
| Electron N5 | `electron/vendor-view.js` · wired from `electron/main.js` · `electron/preload.js` |
| Renderer seam | `src/lib/desktop/desktop-host.ts` · `vendor-partitions.ts` · `vendor-view-store.ts` |
| Mask | `src/components/desktop/VendorViewMaskHost.tsx` (mounted from `ResponsiveLayout`) |
| Open full ticket | `openHelpdeskTicketUrl` — VendorView on desktop, deep-link in browser (`SupportChatHeader`, `SupportTicketPaneHeader`) |
| REST presets | `ticket-reply-presets.ts` · `TicketReplyPresetsBar` on `SupportChatComposer` |
| QC → internal note | Testing `As listed` → `postTicketInternalNote` when a ticket is linked |
| Guard | `desktop-vendor-view.guard.test.ts` |

## Prove (manual, desktop build)

1. `pnpm desktop:dev` against `:3050` (attach-only).
2. Open a station Ticket Displays leaf → Open in helpdesk → Agent Workspace fills below Close chrome; Esc / Ctrl+] returns.
3. Preset **QC passed** / **All good** posts via REST without touching the VendorView DOM.
4. Testing **As listed** with a linked ticket appends an internal QC note.
