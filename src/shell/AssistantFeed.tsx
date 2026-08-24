'use client';

/**
 * THE FIRST SCREEN — the AI chat feed.
 *
 * AI-first means the empty canvas is a CONVERSATION, not a menu: one centred
 * column clamped to a prose measure, a welcome that offers to get the canvas
 * tiles started, and a coding-assistant composer — the entry, the context
 * readout at the entry's bottom-right, and the tool row on the very bottom.
 * The moment a tile opens, the canvas takes over and the assistant recedes to
 * its rail band; this component simply stops rendering.
 *
 * The feed's turns live in `useShell` (`feed` / `sendToAssistant`), not here —
 * the header narrates the session lifecycle this feed drives, so the state has
 * to be visible to siblings. Only the draft is local.
 */

import { useEffect, useRef, useState } from 'react';
import { useFindFieldScan } from '@/hooks/useFindFieldScan';
import { Icon } from '@/shell/icons';
import { FEED_WELCOME, TOOLS } from '@/shell/model';
import type { ShellApi } from '@/shell/useShell';

/** The bottom tool row: global-scope tools only. Session tools need an armed
 *  session, and the feed exists precisely while there is none. */
const GLOBAL_TOOLS = TOOLS.filter((tool) => tool.scope === 'global');

export function AssistantFeed({ shell }: { shell: ShellApi }) {
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const { feed, sendToAssistant, runFeedAction, handleFieldScan, handleFieldPaste } = shell;

  /* The input truth layer (Phase 1): the composer opts in to field-scoped
     wedge detection and paste stamping. A claimed burst's characters were
     typed into the field (never prevented), so the CONTROLLED field strips
     them from its own state here — the adapter never fights React. */
  const scanCapture = useFindFieldScan({
    onScan: (claim) => {
      setDraft((d) => (d.endsWith(claim.value) ? d.slice(0, d.length - claim.value.length) : d));
      handleFieldScan(claim);
    },
    onPaste: (paste) => handleFieldPaste(paste),
  });

  /* Pin the newest turn into view. Instant — nothing animates. */
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [feed]);

  const send = () => {
    if (!draft.trim()) return;
    sendToAssistant(draft);
    setDraft('');
  };

  /* What the assistant can see, in the corner where coding assistants put
     their context readout. */
  const contextLabel = `${shell.globalContext} · ${
    shell.sessionState === 'armed' && shell.sessionName ? shell.sessionName : 'no session'
  }`;

  /* Observable truth for tests and the live drive — Phase 3's suggestion row
     is the human-facing display; until it lands, the stamp rides the DOM. */
  const lastInput = shell.inputTruth[shell.inputTruth.length - 1];

  return (
    <div className="assistant-feed" data-last-input-source={lastInput?.source}>
      <div className="feed-column">
        {feed.length === 0 ? (
          <div className="feed-welcome">
            <div className="feed-welcome-mark" aria-hidden>
              <Icon name="assistant" size={20} />
            </div>
            <h2>{FEED_WELCOME.title}</h2>
            <p>{FEED_WELCOME.body}</p>
          </div>
        ) : (
          <div className="feed-scroll" ref={scrollRef} aria-label="Conversation">
            {feed.map((msg) => (
              <div key={msg.id} className={`feed-msg ${msg.role}`}>
                <span className="feed-role">{msg.role === 'operator' ? 'You' : 'Assistant'}</span>
                <div className="feed-bubble">{msg.text}</div>
                {msg.actions ? (
                  <div className="feed-actions">
                    {msg.actions.map((action) => (
                      <button
                        key={action.ref}
                        type="button"
                        className="btn"
                        onClick={() => runFeedAction(action)}
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}

        <div className="feed-composer">
          <div className="feed-entry">
            <textarea
              ref={scanCapture}
              rows={2}
              value={draft}
              autoFocus
              aria-label="Message the assistant"
              placeholder="Describe the work — I’ll open the tiles for it…"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <div className="feed-entry-meta">
              <span className="feed-hint">
                <span className="kbd">Enter</span> send
              </span>
              <span className="feed-context mono" title="What the assistant can see">
                {contextLabel}
              </span>
              <button
                type="button"
                className="btn btn-icon feed-send"
                title="Send"
                disabled={!draft.trim()}
                onClick={send}
              >
                <Icon name="send" size={14} />
              </button>
            </div>
          </div>

          <div className="feed-tools" role="toolbar" aria-label="Tools">
            {GLOBAL_TOOLS.map((tool) => (
              <button
                key={tool.key}
                type="button"
                className="feed-tool"
                title={tool.label}
                onClick={() => shell.toggleTool(tool.key)}
              >
                <Icon name={tool.icon} size={13} />
                <span>{tool.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
