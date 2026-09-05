# PLAN — companion composer (phone as mic and keyboard)

**Status: BUILDING** (started 2026-09-03). Operator ruling: the app is AI-first.
One composer at the bottom. The header's Sparkles button goes; a **phone**
button takes its slot and pushes the desktop's context to the operator's phone.
The phone types or speaks into a **synced composer** — the same field, mirrored.

Read [`LAWS.md`](LAWS.md), [`HANDOFF-ai-first.md`](HANDOFF-ai-first.md) and
[`PLAN-floating-assistant-composer.md`](PLAN-floating-assistant-composer.md)
first. This plan adds a device, not a mouth.

## What this is

A **companion-device input layer**. The closest industry shapes are Apple
Continuity (Handoff + Continuity Camera) and Teams / Zoom companion mode. In
Cycle Forge words:

> Press the phone button. Your phone, signed in as the same staff ID, shows what
> the desk is looking at and gives you a keyboard and a microphone. Whatever you
> type or say lands in the desk composer as if you typed it there. Send on the
> phone sends on the desk.

A bench with no microphone gets voice for free. A bench with a bad keyboard
gets a good one. The pairing key is the **staff ID** — no QR, no code. That is
the same gate every existing desk-to-phone bridge already uses.

## What already exists — do not rebuild

| You will want | It already is |
|---|---|
| per-staff desk↔phone channel | `getStaffStationBridgeChannelName(orgId, staffId)` → `org:{org}:staffstation:{staffId}` (`src/lib/realtime/channels.ts`) |
| "did a phone hear me?" | `src/lib/realtime/device-handshake.ts` — `sendToDevice` (subscribe-before-publish, 6s timeout) + `publishDeviceAck`; React binding `useSendToDevice(kind)` |
| the token grant for that channel | `src/app/api/realtime/token/route.ts` — per-staff, publish + subscribe, no wildcard |
| the one desktop composer | `AssistantFabHost` → `AssistantDockBody` → `StationComposerHost` |
| seeding / focusing that composer | `composer-seed-store.ts`, `composer-focus-store.ts`, `useAssistantDockControls().seedComposer` |
| what the desk is looking at | `AssistantPageContext` in `src/lib/assistant/context-store.ts` (page · station · mode · selection · skill) |
| the phone shell | `src/app/m/(shell)` — `RedesignedMobileShell`, drawer nav, `MobileTopBar` |
| BYOK provider chain | `resolveOrgAiChain(orgId, capability)` in `src/lib/ai/org-provider.ts` |

## Wire protocol (`src/lib/realtime/companion-composer.ts`)

All on the per-staff `staffstation` bridge. Snake_case on the wire like every
other bridge payload.

| Event | Direction | Payload | Ack |
|---|---|---|---|
| `composer_handoff` | desk → phone | `request_id` (nullable), `context` (page, station, mode, selection, route), `sent_at` | phone publishes `station_device_ack` with `kind: 'composer_handoff'` **only when `request_id` is set** |
| `composer_draft` | phone → desk | `text`, `seq`, `source: 'keyboard' \| 'voice'` | none |
| `composer_submit` | phone → desk | `text`, `seq` | none |

- `DeviceAckKind` gains `'composer_handoff'`. No new ack event name — the
  handshake doc forbids a third one.
- `seq` is monotonic per phone session; the desk drops anything older than the
  last applied seq so a slow draft cannot overwrite a newer one.
- Drafts are throttled at `COMPANION_DRAFT_THROTTLE_MS` (150ms, trailing edge).
- Presence: the phone **enters** Ably presence on the bridge with
  `{ device: 'phone' }`. The desk subscribes and counts phone members. That
  requires the `presence` capability on the per-staff bridge in the token route.

## Desk side

- **`GlobalHeaderPhoneButton`** replaces `GlobalHeaderAssistantButton` in
  `GlobalHeaderActions` (far-right). ⌘J and the floating circle remain the
  assistant door — nothing is lost by dropping the header Sparkles.
- States: `unpaired` (no phone present) · `sending` · `paired` (a phone answered
  or is present) · `unreachable` (timed out, holds until retry).
- Press = `useSendToDevice('composer_handoff')` → publishes the current
  `AssistantPageContext`. While a phone is present, context changes are pushed
  without waiting for an ack (`request_id: null`).
- **Sink** (`useCompanionComposerDesk`): `composer_draft` →
  `seedComposer(text, { autoSend: false })` (opens the dock, replaces the
  draft); `composer_submit` → `seedComposer(text, { autoSend: true })`.
  The phone is a mirror of the one field, not a second input — LAWS "one field"
  holds.

## Phone side

- Route `/m/companion` in the `(shell)` group. Drawer leaf "Companion".
- `MobileCompanionComposer`: subscribes to `composer_handoff`, acks, registers
  the desk context into the assistant context store (so `PageContextSection`
  paints it and the phone's own Ask uses the same working set), enters
  presence, mounts **`StationComposerHost`** `showModeFaces={false}`
  `forceMode="unbox"` `chrome="raised"` — a clone of the AssistantDock mouth,
  not a new shell. The microphone is the host's `trailingAction`.
- Typing publishes `composer_draft`; Enter publishes `composer_submit` and
  clears.

## Voice

`useVoiceDictation` on the phone. Server-first: `MediaRecorder` →
`POST /api/ai/transcribe` (multipart) → the org's provider chain
(`openai` / `ai_gateway` / platform) at `/audio/transcriptions`. If the org has
no speech-capable provider (503) the hook falls back to the browser
`SpeechRecognition` API where it exists. Transcripts land in the draft and ride
`composer_draft` with `source: 'voice'`.

## Not this

- Not a second `StationComposerHost` on the desk. Not a Dialog. Not a toast.
- Not a QR pairing flow — staff ID is the pairing.
- Not overlay-cohort; not slot-table. Do not append to
  `SCAN_STATION_OVERLAY_COHORT`.
- Not a new ack event, not a new channel family.

## Eval

- `node "$GARISEK_OS_ROOT/tools/eval-engineering/cursor-eval.mjs" --root . --fast`
- `npx tsx --test src/lib/realtime/companion-composer.test.ts`
- `npx tsx --test src/lib/auth/route-permission-manifest.test.ts` (transcribe route)
- `pnpm run eval:station scan-out` if `StationComposerHost` props change (they do not).

## Open questions (decide before the phone ships to the floor)

1. Should phone transcripts pass the wedge-vs-human detector so a phone camera
   scan is never dictated into the composer? Recommended yes, later.
2. Deep-link: should the desk handoff also push an inbox nudge so a locked
   phone opens `/m/companion` on tap? The inbox channel has zero subscribers
   today — cheapest win in the repo.
