'use client';

/**
 * MobileCompanionComposer — `/m/companion`. The phone as mic and keyboard for
 * the ONE desk composer (PLAN-companion-composer).
 *
 * Pairing is the staff ID: signed in here as the same person as the desk, the
 * phone sits on `staffstation:{staffId}`, enters presence, and:
 *
 *   ← `composer_handoff`  acks (when asked) and registers the desk's context
 *                          into the assistant context store, so
 *                          {@link PageContextSection} paints it and the phone's
 *                          own Ask shares the desk's working set
 *   → `composer_draft`    every edit, throttled
 *   → `composer_submit`   Enter — the desk sends; this field clears
 *
 * The mouth is a clone of the AssistantDock foot — {@link StationComposerHost}
 * faces off, Send on the dock — not a new shell. The microphone is the host's
 * `trailingAction`.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Mic, MicOff, Smartphone } from '@/components/Icons';
import { StationComposerHost } from '@/components/composer/StationComposerHost';
import { PageContextSection } from '@/components/assistant/PageContextSection';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IconButton } from '@/design-system/primitives';
import { useAblyChannel } from '@/hooks/useAblyChannel';
import { useAblyClient } from '@/contexts/AblyContext';
import { useAuth } from '@/contexts/AuthContext';
import { useVoiceDictation } from '@/hooks/useVoiceDictation';
import { registerAssistantContext } from '@/lib/assistant/context-store';
import { getStaffStationBridgeChannelName, safeChannelName } from '@/lib/realtime/channels';
import { publishDeviceAck, type DeviceAckChannel } from '@/lib/realtime/device-handshake';
import {
  COMPANION_DRAFT_EVENT,
  COMPANION_DRAFT_THROTTLE_MS,
  COMPANION_HANDOFF_EVENT,
  COMPANION_PHONE_PRESENCE,
  COMPANION_SUBMIT_EVENT,
  parseCompanionHandoff,
  type CompanionContext,
  type CompanionDraftSource,
} from '@/lib/realtime/companion-composer';
import { cn } from '@/utils/_cn';

export function MobileCompanionComposer() {
  const { user } = useAuth();
  const { getClient } = useAblyClient();
  const orgId = user?.organizationId;
  const staffId = user?.staffId ?? 0;
  const channelName =
    staffId > 0 && orgId ? safeChannelName(() => getStaffStationBridgeChannelName(orgId, staffId)) : '';

  const [deskContext, setDeskContext] = useState<CompanionContext | null>(null);
  const [lastHandoffAt, setLastHandoffAt] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const seqRef = useRef(0);
  const throttleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<{ text: string; source: CompanionDraftSource } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── publish helpers ──────────────────────────────────────────────────────
  const publish = useCallback(
    async (event: string, data: Record<string, unknown>) => {
      if (!channelName) return;
      try {
        const client = await getClient();
        await client?.channels.get(channelName).publish(event, data);
      } catch {
        /* the desk's seq guard tolerates a dropped draft; the next one wins */
      }
    },
    [channelName, getClient],
  );

  const flushDraft = useCallback(() => {
    throttleRef.current = null;
    const p = pendingRef.current;
    pendingRef.current = null;
    if (!p) return;
    seqRef.current += 1;
    void publish(COMPANION_DRAFT_EVENT, { text: p.text, seq: seqRef.current, source: p.source });
  }, [publish]);

  const queueDraft = useCallback(
    (text: string, source: CompanionDraftSource) => {
      pendingRef.current = { text, source };
      if (throttleRef.current) return;
      throttleRef.current = setTimeout(flushDraft, COMPANION_DRAFT_THROTTLE_MS);
    },
    [flushDraft],
  );

  useEffect(
    () => () => {
      if (throttleRef.current) clearTimeout(throttleRef.current);
    },
    [],
  );

  const submit = useCallback(
    (live?: string) => {
      const text = (live ?? draft).trim();
      if (!text) return;
      if (throttleRef.current) {
        clearTimeout(throttleRef.current);
        throttleRef.current = null;
        pendingRef.current = null;
      }
      seqRef.current += 1;
      void publish(COMPANION_SUBMIT_EVENT, { text, seq: seqRef.current });
      setDraft('');
    },
    [draft, publish],
  );

  // ── presence ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!channelName) return;
    let disposed = false;
    let channel: any = null;
    getClient()
      .then(async (client) => {
        if (disposed || !client) return;
        channel = client.channels.get(channelName);
        await channel.presence.enter(COMPANION_PHONE_PRESENCE);
      })
      .catch(() => {});
    return () => {
      disposed = true;
      channel?.presence?.leave().catch(() => {});
    };
  }, [channelName, getClient]);

  // ── handoff ──────────────────────────────────────────────────────────────
  useAblyChannel(
    channelName,
    COMPANION_HANDOFF_EVENT,
    (msg: { data?: unknown }) => {
      const handoff = parseCompanionHandoff(msg?.data);
      if (!handoff) return;
      setDeskContext(handoff.context);
      setLastHandoffAt(handoff.sent_at || new Date().toISOString());
      if (handoff.request_id) {
        void getClient().then((client) =>
          publishDeviceAck(
            client?.channels.get(channelName) as DeviceAckChannel | undefined,
            handoff.request_id,
            'composer_handoff',
          ),
        );
        // An explicit handoff is the desk asking for hands — put the caret there.
        textareaRef.current?.focus();
      }
    },
    !!channelName,
  );

  // The desk's working set becomes this phone's assistant context while paired.
  useEffect(() => {
    if (!deskContext) return;
    return registerAssistantContext({
      page: deskContext.page,
      station: deskContext.station,
      mode: deskContext.mode,
      selection: deskContext.selection,
    });
  }, [deskContext]);

  // ── voice ────────────────────────────────────────────────────────────────
  const baseRef = useRef('');
  const dictation = useVoiceDictation({
    onInterim: (text) => {
      const next = joinDictation(baseRef.current, text);
      setDraft(next);
      queueDraft(next, 'voice');
    },
    onFinal: (text) => {
      const next = joinDictation(baseRef.current, text);
      baseRef.current = next;
      setDraft(next);
      queueDraft(next, 'voice');
    },
  });

  const onMic = () => {
    if (dictation.state !== 'listening') baseRef.current = draft;
    dictation.toggle();
  };

  const listening = dictation.state === 'listening';
  const micLabel = !dictation.supported
    ? 'Microphone unavailable on this phone'
    : listening
      ? 'Stop dictation'
      : dictation.state === 'transcribing'
        ? 'Transcribing…'
        : 'Dictate';

  const micButton = (
    <HoverTooltip label={micLabel} asChild>
      <IconButton
        type="button"
        size="md"
        radius="pill"
        ariaLabel={micLabel}
        aria-pressed={listening}
        disabled={!dictation.supported || dictation.state === 'transcribing'}
        onClick={onMic}
        className={cn(listening && 'text-[var(--ds-color-text-danger)]')}
        icon={
          dictation.state === 'transcribing' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : !dictation.supported ? (
            <MicOff className="h-4 w-4" />
          ) : (
            <Mic className={cn('h-4 w-4', listening && 'animate-pulse')} />
          )
        }
      />
    </HoverTooltip>
  );

  if (!channelName) {
    return (
      <div className="px-4 py-6 text-role-caption text-text-muted">Sign in as staff to pair this phone.</div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="companion-composer">
      <div className="flex shrink-0 items-center gap-2 border-b border-border-hairline px-4 py-2.5">
        <Smartphone className="h-4 w-4 text-[var(--ds-color-text-success)]" />
        <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">Companion</p>
        <p className="ml-auto text-role-micro text-text-faint">
          {deskContext
            ? `Desk · ${deskContext.route}`
            : 'Paired by staff ID — press the phone button on the desk'}
        </p>
      </div>

      <div className="shrink-0 border-b border-border-hairline">
        <PageContextSection />
        {lastHandoffAt ? (
          <p className="px-4 pb-2 text-role-micro text-text-faint">
            Context received {new Date(lastHandoffAt).toLocaleTimeString()}
          </p>
        ) : null}
      </div>

      <div className="min-h-0 flex-1" />

      {dictation.error ? (
        <p className="px-4 pb-1 text-role-micro text-[var(--ds-color-text-danger)]" role="status">
          {dictation.error}
        </p>
      ) : null}

      <div className="shrink-0 px-2 pb-2 pt-1">
        <StationComposerHost
          presenceKind="desk"
          textareaRef={textareaRef}
          labelValue={draft}
          onLabelChange={(next) => {
            setDraft(next);
            queueDraft(next, 'keyboard');
          }}
          onLabelCommit={submit}
          labelCommitAriaLabel="Send on the desk"
          labelCommitTooltip="Send on the desk (Enter)"
          labelPlaceholder={listening ? 'Listening…' : 'Type or talk — it lands on the desk'}
          trailingAction={micButton}
          showModeFaces={false}
          forceMode="unbox"
          chrome="raised"
        />
      </div>
    </div>
  );
}

function joinDictation(base: string, spoken: string): string {
  const b = base.trimEnd();
  const s = spoken.trim();
  if (!s) return b;
  return b ? `${b} ${s}` : s;
}
