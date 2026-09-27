'use client';

/**
 * ConnectAppPill — the in-chat OAuth handoff.
 *
 * The pattern (as shipped by Cursor's MCP prompts and Claude's connector auth):
 * when a tool needs an account the person has not authorized, the transcript
 * grows an inline pill naming the app, why it is needed, and ONE high-contrast
 * button. Clicking opens the provider's own consent screen in a separate
 * window; this app never sees a password, a token, or a code.
 *
 * Requirements this satisfies deliberately:
 *
 * - **No credential in chat.** The chat surface never collects a secret. The
 *   only thing crossing it is an https link the SERVER minted.
 * - **Authorization Code + PKCE, off-surface.** The flow runs inside
 *   Composio's hosted Connect Link against the provider; this component is
 *   presentation plus a poll, so there is no OAuth state machine here to get
 *   wrong (no `state`, no code exchange, no token storage in the client).
 * - **Context-aware consent.** The pill states what the connection unlocks
 *   ("so I can read your ops handbook"), because a bare "Sign in" prompt in an
 *   agent surface is how people click through things they did not want.
 * - **Inline resumption.** After the window closes the pill polls the app's own
 *   connection endpoint; on success it flips to "Connected" and seeds the
 *   original question back into the composer so the operator presses Enter
 *   once instead of retyping.
 * - **Keyboard reachable.** It is a real `<button>` in flow order — Tab, Enter.
 *   Mouse is an alias, never the only path (session cohort law 4).
 * - **Revocable.** The footer points at the connections desk; an operator who
 *   can grant must be able to find where to revoke.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ExternalLink, Loader2 } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { cn } from '@/utils/_cn';
import type { AssistantConnectionPrompt } from '@/components/assistant/useAssistantChat';

/** Poll cadence while the operator is in the consent window. */
const POLL_MS = 2000;
/** Give up watching after this long — the pill stays clickable, it just stops asking. */
const POLL_CEILING_MS = 3 * 60 * 1000;

type PillState = 'idle' | 'waiting' | 'connected';

interface ConnectionsResponse {
  configured?: boolean;
  apps?: Array<{ app: string; connected: boolean }>;
}

export function ConnectAppPill({
  prompt,
  onConnected,
  className,
}: {
  prompt: AssistantConnectionPrompt;
  /** Fired once, after the connection is confirmed server-side. */
  onConnected: (prompt: AssistantConnectionPrompt) => void;
  className?: string;
}) {
  const [state, setState] = useState<PillState>('idle');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedRef = useRef(0);

  const stopPolling = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  const poll = useCallback(async () => {
    if (Date.now() - startedRef.current > POLL_CEILING_MS) {
      stopPolling();
      setState('idle');
      return;
    }
    try {
      // `fresh=1` drops the cached Composio session for this staffer, without
      // which the status would report the pre-consent state for its whole TTL
      // and the pill would never flip.
      const res = await fetch('/api/integrations/composio/connections?fresh=1', { cache: 'no-store' });
      if (!res.ok) return;
      const body = (await res.json()) as ConnectionsResponse;
      const row = body.apps?.find((entry) => entry.app === prompt.app);
      if (row?.connected !== true) return;
      stopPolling();
      setState('connected');
      onConnected(prompt);
    } catch {
      /* transient — the next tick retries */
    }
  }, [onConnected, prompt, stopPolling]);

  const connect = useCallback(() => {
    // A named window, not a tab: the consent screen belongs beside the chat so
    // the operator's place in the conversation is never lost, and a second
    // click reuses the same window instead of stacking them.
    window.open(prompt.connectUrl, `cf-connect-${prompt.app}`, 'width=520,height=680,noopener,noreferrer');
    startedRef.current = Date.now();
    setState('waiting');
    stopPolling();
    timerRef.current = setInterval(() => void poll(), POLL_MS);
  }, [poll, prompt.app, prompt.connectUrl, stopPolling]);

  const connected = state === 'connected';

  return (
    <div
      data-connect-pill={prompt.app}
      className={cn(
        'flex items-center gap-2.5 rounded-lg border px-3 py-2',
        connected
          ? 'border-border-success bg-surface-success'
          : 'border-border-soft bg-surface-sunken',
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="text-role-caption font-medium text-text-default">
          {connected ? `${prompt.appLabel} connected` : `Connect ${prompt.appLabel}`}
        </p>
        {prompt.reason && !connected ? (
          <p className="truncate text-role-micro text-text-muted">{prompt.reason}</p>
        ) : null}
        {connected ? (
          <p className="text-role-micro text-text-muted">Ask again and I&apos;ll pick it up.</p>
        ) : null}
      </div>

      {connected ? (
        <Check className="h-4 w-4 shrink-0 text-text-success" aria-hidden />
      ) : (
        <Button
          variant="primary"
          onClick={connect}
          disabled={state === 'waiting'}
          aria-label={`Connect ${prompt.appLabel}`}
        >
          {state === 'waiting' ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Waiting
            </>
          ) : (
            <>
              Connect <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </>
          )}
        </Button>
      )}
    </div>
  );
}
