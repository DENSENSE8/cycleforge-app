# Handoff — AI Chat display vs Odysseus

**Status:** nav top-pin shipped; display upgrade not started  
**Lane:** current checkout

**Paste:**

```text
Read docs/todo/ai-chat-odysseus-display-HANDOFF.md. Upgrade /ai-chat display
against Odysseus patterns (read-only AGPL reference — no source vendoring).
Keep AI Chat top-pinned under Media; keep useAiChat + /api/ai/chat/stream +
Hermes. Prefer merging topic/ai-chat deltas first. npm run verify before done.
```

---

## Goal

Calm Odysseus/Claude-class chat **display** on CF tokens + Hermes backend.

## Locks

- Top pin: `Home → Search → Media → AI Chat` (`kind: 'top'`; not Overview)
- SoT: `useAiChat` → `/api/ai/chat/stream` → Hermes / local_ops / RAG  
  ([`09-ai-chat-flow.md`](../diagrams/09-ai-chat-flow.md))
- Odysseus = [odysseus-dev/odysseus](https://github.com/odysseus-dev/odysseus) sibling clone, **patterns only** (AGPL)
- Prior detail (optional): `cycleforge-ai-chat/docs/todo/ai-chat-ux-plan.md` P2/P3 residual

## Map

| Pattern | Land in |
|---|---|
| Reading column / streaming | `AiChatConversation.tsx` |
| Composer send/stop | same / extract under `src/components/ai/` |
| Tool timeline | `AgentStepTimeline.tsx` |
| Session rail | `AiChatSidebarPanel.tsx` + chat-sessions APIs |
| Shell | `AiChatWorkspace.tsx` |

## Phases

0. Audit Odysseus chat UI (read-only) → gap list  
1. Polish CF display (tokens; no AGPL files)  
2. Session resume + history (lane P2)  
3. Real tool spans (lane P3)  
4. `npm run verify` + smoke `:3050`

## Non-goals

No nested Odysseus app; no second chat API; no Overview move-back; no ratchet raises.
