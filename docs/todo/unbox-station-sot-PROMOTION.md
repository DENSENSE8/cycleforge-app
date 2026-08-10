# Unbox SoT promotion + sibling port playbook

**Date:** 2026-08-09 · **Lane:** main (dogfood)  
**Status:** SoT promoted — ready to drive sibling ports one station at a time

## What landed

Unbox's live floor (centre ops-flow · flush two-band dock · per-step ACTION/KNOW ·
Displays cockpit) is now the **named golden** in rules, not only in code comments
and scattered handoffs.

| Artifact | Role |
|---|---|
| [`.claude/rules/display/unbox-station.md`](../../.claude/rules/display/unbox-station.md) | Exact Unbox anatomy + **per-step** dock ACTION / `railLeaf` / gates / photo stages |
| [`.claude/rules/display/station-port-from-unbox.md`](../../.claude/rules/display/station-port-from-unbox.md) | **Identify → remove → compose** pattern for Arrival · Testing · Pack · Shipping |
| [`scan-cockpit.md`](../../.claude/rules/display/scan-cockpit.md) | DO/KNOW split (Unbox Phase 1 live) |
| `source-of-truth.md` + `contextual-display.md` + `AGENTS.md` | Index rows / hard-law pointer |

## Per-step snapshot (Found walk)

| Step | Dock ACTION | KNOW leaf |
|---|---|---|
| Arrival photos | Photo strip (Link\|Upload\|Send) → `arrival_package` | `photos` |
| Shipping label / Box / Packing | Carton photo strip → `unbox_carton`+aspect | `photos` |
| Contents | Ack | `inventory` |
| Serial → Condition → Item photos | Serial / grade bar / photo strip | `units` / `units` / `photos` |
| Label | Ack | work plane (`UnboxLabelPreview`) — no rail |
| Settle | Print · Receive XOR | cockpit idle |

Unfound prepends **Classify** (`classify` leaf). Full table in `unbox-station.md`.

## Sibling port order

1. **Arrival** — kill centre `WorkflowRecommendationsStrip`; flush notes (drop Omnichannel floor).
2. **Testing** — replace raised `TestingDockHost`; add derivation + `railLeaf`; flip `testing-qc-dock.guard`.
3. **Pack** — papers/rollup off centre; keep terminal-exempt.
4. **Shipping** — advisory banners out; Pack·Units only with an explicit redesign.
5. **Labels** — registry slice only; keep centre tabs.

## How to run a port

Follow the checklist in `station-port-from-unbox.md`. Hard rule from pattern-evolution:
**old twin deleted (or shrink-only allowlist) before the port is "done."** Never raise a
baseline. Never port N stations in one pass.

## Out of scope here

- Implementing Arrival/Testing ports (next sessions).
- Multi-qty Phase 3 per-unit trio loop.
- Remounting centre `ProcedureDeck` (stays parked).
