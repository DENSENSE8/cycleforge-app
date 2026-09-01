# HANDOFF — Scan-out dumb station mouth (StationComposerHost)

**Written:** 2026-08-31 · **Branch:** `main` · **State:** SoT — implemented  
**Route:** `/shipping/scan-out`

**Paste everything below the horizontal rule into a fresh agent session.**

---

You are maintaining **`/shipping/scan-out`** as a **dumb floor scan station**. Call
design-mcp first (`ds_contract` / `ds_tokens` / `ds_critique`, or
`node tools/design-mcp/ds.mjs …` if MCP tools are missing from the catalog).

## Operator sentence

> One Omnichannel **station mouth** (same as Unbox). Gun + optional note-last in
> the same textarea. No Unbox|Ticket faces. Caption row stays with the
> **bottom-right context ring** for Displays verification. White card surface.
> Railless. Async SHIP_CONFIRM.

## Locked anatomy (do not re-derive)

```
ScanOutWorkspace (bg-surface-card, railless)
  ├ StationScanPaneHost + CartonContextCard header (Pack chrome)
  │    └ Displays (Timeline · Listings) — opened by context ring
  └ ScanOutComposerDock
       └ StationComposerHost
            showModeRow={true}
            showModeFaces={false}   ← dumb: faces off, ring on
            ├ OmnichannelComposerDock   (outline)
            └ ComposerModeRow           (spacer + procedure ring bottom-right)
```

| Say this | Mount this | Never |
|----------|------------|--------|
| Omni Composer / station mouth | `StationComposerHost` | raw `OmnichannelComposerDock` alone |
| no modes / dumb station | `showModeFaces={false}` | `showModeRow={false}` (deletes the ring) |
| verify carton | ring → Displays | invent a second notes mouth |

## Hard rules

1. **Reuse** `StationComposerHost` — thin adapter only (`ScanOutComposerDock`).
2. **One textarea**: tracking-shaped Enter → async `POST /api/shipped/scan-out`; else note last matched `orderRowId`.
3. **Railless** — no left recent rail / no dual middle+bottom mouths.
4. **White** `bg-surface-card` only — no gray canvas fork.
5. **Most recent carton** stays visible during pending; miss must not wipe last good.
6. design-mcp before UI; pin keys `StationComposerHost` / `ComposerModeRow` / `OmnichannelComposerDock`.

## Explicit non-goals

- Do not restore `ScanOutRecentRail` / middle notes composer + bottom scan bar.
- Do not add Ticket · Claim · Unbox faces on this route.
- Do not treat marketplace order IDs as scan keys.

## Related

- Pins: `src/design-system/pinned.json` (`StationComposerHost`, `ComposerModeRow`).
- Unbox locks: `docs/todo/station-composer-HANDOFF-PROMPT.md`.
- CLI: `node tools/design-mcp/ds.mjs contract "dumb station scan mouth"`.
