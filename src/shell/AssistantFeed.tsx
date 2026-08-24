'use client';

/**
 * THE SURFACE — the AI feed, pinned centre, always mounted (the inversion,
 * HANDOFF-ai-centre §1). The conversation is the workspace, and since Phase 2
 * the chronology is BLOCKS OF TIME: a session block opens (⌘N, a scan, an
 * assistant action), carries what happened as line items, and parks or ends —
 * a parked block collapses to one line (title · state · elapsed) and reopens
 * in place. Scrolling up is scrolling back in time, never visiting a page.
 *
 * The feed's turns and blocks live in `useShell` (`feed` / `sendToAssistant` /
 * the block verbs), not here — the header narrates the session lifecycle this
 * feed drives, so the state has to be visible to siblings. Only the draft is
 * local.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useFindFieldScan } from '@/hooks/useFindFieldScan';
import {
  OmniCommandComposer,
  type OmniComposerHandle,
} from '@/components/composer/OmniCommandComposer';
import { hhmmss, useClock } from '@/shell/clock';
import { Icon } from '@/shell/icons';
import {
  FEED_WELCOME,
  TOOLS,
  blockElapsedSeconds,
  type AssistantFeedMessage,
  type FeedAction,
  type SessionBlock,
} from '@/shell/model';
import type { ShellApi } from '@/shell/useShell';

/** One turn — the same bubble whether it sits between blocks or inside one. */
function Turn({ msg, run }: { msg: AssistantFeedMessage; run: (action: FeedAction) => void }) {
  return (
    <div className={`feed-msg ${msg.role}`}>
      <span className="feed-role">{msg.role === 'operator' ? 'You' : 'Assistant'}</span>
      <div className="feed-bubble">{msg.text}</div>
      {msg.actions ? (
        <div className="feed-actions">
          {msg.actions.map((action) => (
            <button key={action.ref} type="button" className="btn" onClick={() => run(action)}>
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Elapsed = the sum of the block's intervals against the shared once-a-second
 *  pulse. Parked and ended blocks print a frozen sum; only the text changes,
 *  and it is tabular, so nothing moves (M1/M5). */
function BlockClock({ block }: { block: SessionBlock }) {
  const clock = useClock();
  return (
    <span className="feed-block-elapsed mono">
      {hhmmss(blockElapsedSeconds(block.intervals, clock.now))}
    </span>
  );
}

/**
 * A block of time: one condensed header line — title · state · elapsed — and
 * the turns that happened inside it. Collapse is a conditional render:
 * instant, no geometry tween (M1). Parked blocks resume IN PLACE.
 */
function BlockView({ block, shell }: { block: SessionBlock; shell: ShellApi }) {
  return (
    <section className="feed-block" data-state={block.state}>
      <div className="feed-block-line">
        <button
          type="button"
          className="feed-block-toggle"
          onClick={() => shell.toggleBlockCollapsed(block.id)}
          aria-expanded={!block.collapsed}
          title={block.collapsed ? 'Expand this block' : 'Collapse to one line'}
        >
          <Icon name="chevron-down" size={10} />
        </button>
        <span className="feed-block-title">{block.title}</span>
        <span className="feed-block-state">{block.state}</span>
        <BlockClock block={block} />
        {block.state === 'parked' ? (
          <button
            type="button"
            className="btn feed-block-act"
            onClick={() => shell.resumeBlock(block.ref)}
            title="Resume this block in place — elapsed continues where it froze"
          >
            Resume
          </button>
        ) : block.state === 'armed' ? (
          <button
            type="button"
            className="btn feed-block-act"
            onClick={shell.parkArmedBlock}
            title="Park — lossless, one keystroke's worth (⌘N also parks and cuts a new block)"
          >
            Park
          </button>
        ) : null}
      </div>
      {!block.collapsed && block.items.length > 0 ? (
        <div className="feed-block-items">
          {block.items.map((msg) => (
            <Turn key={msg.id} msg={msg} run={shell.runFeedAction} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

/** The bottom tool row: global-scope tools only. Session tools need an armed
 *  session (T6) and live on the right rail; the composer's row stays global. */
const GLOBAL_TOOLS = TOOLS.filter((tool) => tool.scope === 'global');

/**
 * THE TOOLS COMBOBOX (2026-08-24, corrected). This IS the row the operator
 * meant: six spelled-out labels (Files, Import orders, Calculator, Photo
 * library, Manuals, Label printer) sitting in the composer's bottom row —
 * exactly the "all the modes text in the bottom row" a Claude-Code-style
 * "Bypass permissions ▾" pill collapses into one control. The pill's own
 * label follows whichever tool is currently open; "Tools" when none is.
 */
function ToolsCombobox({ shell }: { shell: ShellApi }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [close, open]);

  const activeTool = GLOBAL_TOOLS.find((t) => shell.toolPanelOpen && shell.openTool === t.key);

  return (
    <div ref={wrapRef} className="composer-mode-slot">
      <button
        type="button"
        className={`composer-mode${open ? ' open' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Tools"
        onClick={() => setOpen((v) => !v)}
      >
        <span>{activeTool?.label ?? 'Tools'}</span>
        <Icon name="chevron-down" size={10} />
      </button>
      {open ? (
        <div className="composer-mode-menu" role="menu">
          {GLOBAL_TOOLS.map((tool) => (
            <button
              type="button"
              key={tool.key}
              role="menuitemradio"
              aria-checked={activeTool?.key === tool.key}
              className="composer-mode-item"
              onClick={() => {
                shell.toggleTool(tool.key);
                close();
              }}
            >
              <span className="composer-mode-item-copy">
                <span className="composer-mode-item-title">
                  <Icon name={tool.icon} size={13} /> {tool.label}
                </span>
              </span>
              {activeTool?.key === tool.key ? <Icon name="check" size={12} /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** THE CONTEXT RING — bottom-right, a coloured dot standing in for the
 *  plain-text readout it replaces (2026-08-24). Session-state colour, same
 *  palette `.scan-armed` already used; the full text moves to `title` —
 *  hover discloses it, the same pattern this app uses everywhere else. */
function ContextRing({ shell, label }: { shell: ShellApi; label: string }) {
  return (
    <span className={`context-ring ${shell.sessionState}`} title={label} aria-label={label}>
      <span className="context-ring-dot" />
    </span>
  );
}

export function AssistantFeed({ shell }: { shell: ShellApi }) {
  const [hasDraft, setHasDraft] = useState(false);
  const composerHandle = useRef<OmniComposerHandle | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const { feed, runFeedAction, handleFieldScan, handleFieldPaste, onComposerCommit } = shell;

  /* The input truth layer (Phase 1): the composer opts in to field-scoped
     wedge detection and paste stamping. A claimed burst's characters were
     typed into the contenteditable (never prevented), so the editor strips
     its own trailing suffix and the token re-enters through the composer's
     commit: unique complete scan → chip + hydration, miss → plain text the
     typeahead can see. */
  const scanCapture = useFindFieldScan({
    onScan: (claim) => {
      handleFieldScan(claim);
      const handle = composerHandle.current;
      if (!handle) return;
      handle.stripTrailingText(claim.value);
      handle.commitToken(claim.value, 'scanner');
    },
    onPaste: (paste) => handleFieldPaste(paste),
  });

  /* Pin the newest turn into view. Instant — nothing animates. */
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [feed]);

  /* What the assistant can see, in the corner where coding assistants put
     their context readout. */
  const contextLabel = `${shell.globalContext} · ${
    shell.sessionState === 'armed' && shell.sessionName ? shell.sessionName : 'no session'
  }`;

  /* Observable truth for tests and the live drive — Phase 3's suggestion row
     is the human-facing display; until it lands, the stamp rides the DOM. */
  const lastInput = shell.inputTruth[shell.inputTruth.length - 1];

  const hasBlocks = feed.some((e) => e.kind === 'block');

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
            {hasBlocks ? (
              <button
                type="button"
                className="feed-collapse-all"
                onClick={shell.collapseAllBlocks}
                title="Collapse every block to one line — title · state · elapsed"
              >
                Collapse all
              </button>
            ) : null}
            {feed.map((entry) =>
              entry.kind === 'block' ? (
                <BlockView key={entry.id} block={entry} shell={shell} />
              ) : (
                <Turn key={entry.id} msg={entry} run={runFeedAction} />
              ),
            )}
          </div>
        )}

        <div className="feed-composer">
          <div className="feed-entry">
            {/* THE ONE FIELD (HANDOFF-ai-centre): identifiers chip, `/` runs
                actions, prose talks, and the gun lands here too. */}
            <OmniCommandComposer
              onCommit={onComposerCommit}
              onDraftChange={setHasDraft}
              handleRef={composerHandle}
              attachScanCapture={scanCapture}
            />
            <div className="feed-entry-meta">
              <span className="feed-hint">
                <span className="kbd">#</span> order · <span className="kbd">/</span> action ·{' '}
                <span className="kbd">Enter</span> send
              </span>
              <button
                type="button"
                className="btn btn-icon feed-send"
                title="Send"
                disabled={!hasDraft}
                onClick={() => composerHandle.current?.submit()}
              >
                <Icon name="send" size={14} />
              </button>
            </div>
          </div>

          {/* Its own row, BELOW the composer box — not folded into
              `.feed-entry-meta` (2026-08-24, corrected three times: the
              tools combobox, its placement, and now the context ring
              joining it here too — same row, tools left, ring right). */}
          <div className="feed-tools-row" role="toolbar" aria-label="Tools">
            <ToolsCombobox shell={shell} />
            <ContextRing shell={shell} label={contextLabel} />
          </div>
        </div>
      </div>
    </div>
  );
}
