"use client";

/**
 * The AI composer's context meter: the house context ring (left of the mic)
 * measuring THIS thread's tokens against the serving model's window, with a
 * details card on hover / click.
 *
 * Every number is the thread's own: the last answered turn's `usage` (the
 * `done` frame live, `analysis.usage` on a reopened thread) and the transcript
 * on screen. `contextTokens` is that turn's last round — prompt plus answer,
 * i.e. what the model is holding now; rows from before the field existed fall
 * back to the per-round mean of their summed input (marked ≈). A new chat is
 * 0 used; the window is the last one this device saw until a turn reports.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { ComposerContextRing } from "@/components/composer/ComposerContextRing";
import type { AssistantMessage } from "@/components/assistant/useAssistantChat";
import {
  AI_LABEL_CLASS,
  AI_PANEL_CLASS,
  aiTransition,
  useMotionPresence,
  useMotionTransition,
} from "@/design-system/ai";
import { AnimatePresence, motion } from "@/design-system/motion";
import { cn } from "@/utils/_cn";

const WINDOW_KEY = "cf.ai.contextWindow";
const HOVER_OPEN_MS = 250;
const HOVER_CLOSE_MS = 180;

interface ThreadContextUsage {
  used: number;
  estimated: boolean;
  window: number | null;
  model: string | null;
  provider: string | null;
  turns: number;
  messages: number;
  last: {
    inputTokens: number | null;
    outputTokens: number | null;
    totalMs: number;
    firstTokenMs: number | null;
    rounds: number;
  } | null;
}

function threadContextUsage(
  messages: readonly AssistantMessage[],
): ThreadContextUsage {
  const answered = messages.findLast(
    (m) => m.role === "assistant" && !m.streaming && m.usage,
  );
  const u = answered?.usage ?? null;
  const perRound =
    u?.inputTokens != null
      ? Math.round(u.inputTokens / Math.max(1, u.rounds)) +
        (u.outputTokens ?? 0)
      : null;
  return {
    used: u?.contextTokens ?? perRound ?? 0,
    estimated: u != null && u.contextTokens == null && perRound != null,
    window: u?.contextWindow ?? null,
    model: u?.model ?? null,
    provider: u?.provider ?? null,
    turns: messages.filter((m) => m.role === "user").length,
    messages: messages.length,
    last: u
      ? {
          inputTokens: u.inputTokens,
          outputTokens: u.outputTokens,
          totalMs: u.totalMs,
          firstTokenMs: u.firstTokenMs,
          rounds: u.rounds,
        }
      : null,
  };
}

function tokens(n: number): string {
  if (n < 1000) return String(n);
  return n < 100_000 ? `${(n / 1000).toFixed(1)}k` : `${Math.round(n / 1000)}k`;
}

function seconds(ms: number | null): string {
  return ms == null
    ? "—"
    : ms < 1000
      ? `${ms} ms`
      : `${(ms / 1000).toFixed(1)} s`;
}

export function ContextUsageRing({
  messages,
  title,
}: {
  messages: readonly AssistantMessage[];
  title: string;
}) {
  const usage = useMemo(() => threadContextUsage(messages), [messages]);

  // The window survives a new chat on this device: the model has not changed
  // just because the transcript did.
  const [knownWindow, setKnownWindow] = useState<number | null>(null);
  useEffect(() => {
    if (usage.window) {
      setKnownWindow(usage.window);
      try {
        window.localStorage.setItem(WINDOW_KEY, String(usage.window));
      } catch {
        /* storage blocked */
      }
      return;
    }
    try {
      const stored = Number(window.localStorage.getItem(WINDOW_KEY));
      if (stored > 0) setKnownWindow(stored);
    } catch {
      /* storage blocked */
    }
  }, [usage.window]);
  const contextWindow = usage.window ?? knownWindow;

  const approx = usage.estimated ? "≈" : "";
  const summary = contextWindow
    ? `Context: ${approx}${tokens(usage.used)} / ${tokens(contextWindow)} tokens`
    : `Context: ${approx}${tokens(usage.used)} tokens`;
  const percent = contextWindow
    ? Math.min(100, Math.round((usage.used / contextWindow) * 100))
    : null;

  // Hover opens after a beat and closes on leave; a click pins it open.
  const [open, setOpen] = useState(false);
  const pinned = useRef(false);
  const timer = useRef<number | null>(null);
  const schedule = (next: boolean, ms: number) => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(next), ms);
  };
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );
  const hoverIn = () => schedule(true, HOVER_OPEN_MS);
  const hoverOut = () => {
    if (!pinned.current) schedule(false, HOVER_CLOSE_MS);
  };

  const pop = useMotionPresence({
    initial: { opacity: 0, scale: 0.96 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.96 },
  });
  const popTransition = useMotionTransition(aiTransition.morph);

  const rows: Array<[string, string]> = [
    ["Used", `${approx}${usage.used.toLocaleString()} tokens`],
    [
      "Window",
      contextWindow
        ? `${contextWindow.toLocaleString()} tokens`
        : "Unknown until a turn reports it",
    ],
    ["Model", usage.model ?? "—"],
    ["Provider", usage.provider ?? "—"],
    [
      "Thread",
      `${usage.turns} ${usage.turns === 1 ? "turn" : "turns"} · ${usage.messages} ${usage.messages === 1 ? "message" : "messages"}`,
    ],
    [
      "Last turn",
      usage.last
        ? `${usage.last.inputTokens?.toLocaleString() ?? "—"} in · ${usage.last.outputTokens?.toLocaleString() ?? "—"} out · ${seconds(usage.last.totalMs)}`
        : "No turns yet",
    ],
  ];
  if (usage.last)
    rows.push([
      "First token",
      `${seconds(usage.last.firstTokenMs)} · ${usage.last.rounds} ${usage.last.rounds === 1 ? "round" : "rounds"}`,
    ]);

  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) pinned.current = false;
        setOpen(next);
      }}
    >
      <PopoverPrimitive.Anchor asChild>
        <span
          className="inline-flex"
          onMouseEnter={hoverIn}
          onMouseLeave={hoverOut}
        >
          <ComposerContextRing
            count={contextWindow ? usage.used : 0}
            capacity={contextWindow ?? 1}
            summary={summary}
            pressed={open}
            onClick={() => {
              pinned.current = !open || !pinned.current;
              if (timer.current) window.clearTimeout(timer.current);
              setOpen(pinned.current);
            }}
          />
        </span>
      </PopoverPrimitive.Anchor>
      <AnimatePresence>
        {open ? (
          <PopoverPrimitive.Portal forceMount>
            <PopoverPrimitive.Content
              forceMount
              asChild
              side="top"
              align="end"
              sideOffset={8}
              onMouseEnter={() =>
                timer.current && window.clearTimeout(timer.current)
              }
              onMouseLeave={hoverOut}
              onOpenAutoFocus={(e) => e.preventDefault()}
            >
              <motion.div
                {...pop}
                transition={popTransition}
                style={{
                  transformOrigin:
                    "var(--radix-popover-content-transform-origin)",
                }}
                className={cn(
                  AI_PANEL_CLASS,
                  "z-command w-72 p-3.5 text-ai-prose-sm text-ai-ink outline-none",
                )}
                data-testid="context-usage-card"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-semibold">{summary}</p>
                  {percent != null ? (
                    <span className="tabular-nums text-ai-muted">
                      {percent}%
                    </span>
                  ) : null}
                </div>
                <div
                  className="mt-2 h-1.5 overflow-hidden rounded-full bg-ai-sunken"
                  aria-hidden
                >
                  <div
                    className="h-full rounded-full bg-ai-muted"
                    style={{ width: `${percent ?? 0}%` }}
                  />
                </div>
                <p
                  className={cn(AI_LABEL_CLASS, "mt-3 truncate")}
                  title={title}
                >
                  {title}
                </p>
                <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                  {rows.map(([label, value]) => (
                    <div key={label} className="contents">
                      <dt className="text-ai-faint">{label}</dt>
                      <dd
                        className="min-w-0 truncate text-right tabular-nums"
                        title={value}
                      >
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </motion.div>
            </PopoverPrimitive.Content>
          </PopoverPrimitive.Portal>
        ) : null}
      </AnimatePresence>
    </PopoverPrimitive.Root>
  );
}
