'use client';

/**
 * THE SURFACE — the AI feed, pinned centre, always mounted (the inversion,
 * HANDOFF-ai-centre §1). The conversation is the workspace, and since Phase 2
 * the chronology is BLOCKS OF TIME: a session block opens (⌘N, a scan, an
 * assistant action), carries what happened as line items, and parks or ends —
 * a parked block collapses to one line (title · purpose · elapsed) and reopens
 * in place. Scrolling up is scrolling back in time, never visiting a page.
 *
 * The feed's turns and blocks live in `useShell` (`feed` / `sendToAssistant` /
 * the block verbs), not here — the header narrates the session lifecycle this
 * feed drives, so the state has to be visible to siblings. Only the draft is
 * local.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { PlusIcon, SendIcon, XIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useReducedMotion } from 'motion/react';
import { playFeedback } from '@/shell/feedback';
import { useFindFieldScan } from '@/hooks/useFindFieldScan';
import {
  OmniCommandComposer,
  type OmniComposerHandle,
} from '@/components/composer/OmniCommandComposer';
import { hhmmss, useClock } from '@/shell/clock';
import { Icon } from '@/shell/icons';
import { SessionHeader } from '@/shell/SessionHeader';
import {
  blockElapsedSeconds,
  type AssistantFeedMessage,
  type FeedAction,
  type SessionBlock,
} from '@/shell/model';
import { railIconPlate, railIconPlateDisabled } from '@/shell/rail-icon';
import { SessionComposer } from '@/shell/SessionComposer';
import type { ShellApi } from '@/shell/useShell';
import { cn } from '@/utils/_cn';

/** One turn — the same bubble whether it sits between blocks or inside one. */
/**
 * ONE TURN — JUST TEXT (2026-08-24, operator ruling: "no bubbles wrapper
 * for the text, just the text itself, on the left side is the agent on
 * the right is you — it's that simple").
 *
 * Gone: the bordered, filled `.feed-bubble` box and the "ASSISTANT" /
 * "YOU" eyebrow above every turn. Both were saying the same thing SIDE
 * already says — a label naming the author of a message that is already
 * aligned to that author's side is the label restating the layout.
 *
 * The bubble had a second cost the operator's screenshot shows: an
 * elevated white box on the white composer pane reads as a control, and
 * a one-line answer ("Opened Orders.") became a chip floating in space.
 * Text on the plane is text; only alignment marks who said it.
 */
function Turn({ msg, run }: { msg: AssistantFeedMessage; run: (action: FeedAction) => void }) {
  const operator = msg.role === 'operator';
  return (
    <div className={`flex flex-col gap-1 ${operator ? 'items-end' : 'items-start'}`}>
      <p
        className={`max-w-[85%] whitespace-pre-wrap break-words text-sm leading-relaxed ${
          /* The operator's own words sit one step back; the agent's answer
             is the thing being read, so it takes the full ink. */
          operator ? 'text-right text-muted-foreground' : 'text-foreground'
        }`}
      >
        {msg.text}
      </p>
      {msg.actions ? (
        <div className="flex flex-wrap gap-2 pt-1">
          {msg.actions.map((action) => (
            <Button key={action.ref} variant="outline" size="sm" onClick={() => run(action)}>
              {action.label}
            </Button>
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
 * instant, no geometry tween (M1). Parked blocks resume IN PLACE. Header
 * reads title · purpose · elapsed. Park/Resume/End stay on *mine*.
 */
function BlockView({ block, shell }: { block: SessionBlock; shell: ShellApi }) {
  const mine = block.mine !== false;
  const hasBody = block.items.length > 0 || Boolean(block.notes) || Boolean(block.wrapUp);
  return (
    <section className="feed-block" data-state={block.state} data-mine={mine ? '1' : '0'}>
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
        {block.purposeLabel ? (
          <span className="feed-block-purpose">{block.purposeLabel}</span>
        ) : (
          <span className="feed-block-state">{block.state}</span>
        )}
        {!mine && block.staffName ? (
          <span className="feed-block-staff">{block.staffName}</span>
        ) : null}
        <BlockClock block={block} />
        {mine && block.state === 'parked' ? (
          <button
            type="button"
            className="btn feed-block-act"
            onClick={() => shell.resumeBlock(block.ref)}
            title="Resume this block in place — elapsed continues where it froze"
          >
            Resume
          </button>
        ) : null}
        {mine && block.state === 'armed' ? (
          <>
            <button
              type="button"
              className="btn feed-block-act"
              onClick={shell.parkArmedBlock}
              title="Park — lossless, one keystroke's worth (⌘N also parks and cuts a new block)"
            >
              Park
            </button>
            <button
              type="button"
              className="btn feed-block-act"
              onClick={shell.openEndComposer}
              title="End — wrap up with from → to, why"
            >
              End
            </button>
          </>
        ) : null}
      </div>
      {!block.collapsed && hasBody ? (
        <div className="feed-block-items">
          {block.notes ? <p className="feed-block-notes">{block.notes}</p> : null}
          {block.wrapUp ? (
            <p className="feed-block-wrap">
              <span className="feed-block-wrap-label">Wrap-up</span>
              {block.wrapUp}
            </p>
          ) : null}
          {block.items.map((msg) => (
            <Turn key={msg.id} msg={msg} run={shell.runFeedAction} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

/* THE TOOLS COMBOBOX IS DEAD (operator ruling, 2026-08-25 —
   HANDOFF-session-composer-ux §5/§8): "the composer would need to be …
   contextually based modes — not tools beneath the composer." Tools live
   on the right rail and behind the beam's ⋯; what replaces this row is a
   CONTEXTUAL MODE ROW, planned before it is built — see
   docs/warehouse-os/PLAN-composer-modes.md. Until that plan is ruled on,
   the row below the field carries only the context ring. */

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

  /* FEEDBACK MOTION — the one call site so far (see shell/feedback.ts).
     The entry swells 1.5% for 140ms when a commit lands, which is what
     tells an operator mid-scan that the gun's burst was taken. It is
     REINFORCEMENT: the committed value also appears as a chip in the
     field, so the surface reads correctly with motion disabled. */
  const entryRef = useRef<HTMLDivElement | null>(null);
  const reduced = useReducedMotion() ?? false;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const { feed, runFeedAction, handleFieldScan, handleFieldPaste, onComposerCommit } = shell;

  /* Wrapped, not replaced. The commit runs FIRST and synchronously; the
     animation is fired after and never awaited, so nothing on the scan
     path can be delayed by a paint (guardrail 2). */
  const commitWithFeedback = useCallback<typeof onComposerCommit>(
    (...args) => {
      const result = onComposerCommit(...args);
      playFeedback(entryRef.current, 'commit', reduced);
      return result;
    },
    [onComposerCommit, reduced],
  );

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

  /* STICK TO BOTTOM, BUT ONLY IF ALREADY THERE (2026-08-25).
   *
   * The old rule was `scrollTop = scrollHeight` on every feed change,
   * unconditionally. That yanks an operator who has scrolled up to read
   * history back to the present the moment anything lands — and in this
   * app something lands on every scan, so reading history during an
   * active session was effectively impossible.
   *
   * `atBottom` is sampled on scroll rather than computed at append time,
   * because by the time the effect runs the new content is already in the
   * DOM and the measurement would always say "not at bottom".
   */
  const atBottom = useRef(true);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    // 24px of slack: a scroller sitting one subpixel off the floor after a
    // reflow is still, to the operator, at the bottom.
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !atBottom.current) return;

    /* PIN TO THE BOTTOM (2026-08-25, operator ruling). An earlier pass
       aimed at the newest turn's TOP edge so a long answer would start at
       its first line. The operator overruled it, and on this surface they
       are right: the assistant's turns are short operational confirmations
       ("Opened Orders."), so top-pinning almost never changed what was on
       screen — but when it did fire it left a gap of dead space between
       the newest turn and the composer, which is the exact void the
       bottom-anchor was introduced to close. One rule, always the floor.

       Instant assignment, never `smooth`: a scroll animation delays the
       paint that tells a scanning operator the scan landed. */
    el.scrollTop = el.scrollHeight;
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
        {feed.length === 0 ? null : (
          <div className="feed-scroll" ref={scrollRef} onScroll={onScroll} aria-label="Conversation">
            {hasBlocks ? (
              <button
                type="button"
                className="feed-collapse-all"
                onClick={shell.collapseAllBlocks}
                title="Collapse every block to one line — title · purpose · elapsed"
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
          {/* THE SESSION'S FACE (2026-08-25, operator ruling): the armed
              session mounts at the TOP of the composer display — chronology
              above, field below — never as a canvas tile. The parked-block
              rows pin to the bottom of the chronology; this slots between
              them and the field. */}
          <SessionHeader shell={shell} />
          {shell.composerMode === 'start' ? (
            <SessionComposer
              mode="start"
              purposes={shell.purposes}
              busy={shell.composerBusy}
              onCancel={shell.closeSessionComposer}
              onConfirm={shell.confirmStart}
            />
          ) : null}
          {shell.composerMode === 'end' ? (
            <SessionComposer
              mode="end"
              title={shell.armedBlock?.title ?? shell.sessionName}
              busy={shell.composerBusy}
              onCancel={shell.closeSessionComposer}
              onConfirm={shell.confirmEnd}
            />
          ) : null}
          {/* THE WRITE TARGET (Phase 7's `target`, first landing): while an
              order is focused, prose in the One Field is a comment ON THAT
              ORDER. The chip is a status readout, never an input (I6); the ✕
              releases prose back to the assistant. */}
          {shell.composerTarget ? (
            <div className="flex items-center gap-1 px-2 pb-1">
              <Badge
                variant="outline"
                className="min-w-0 gap-1 border-edge-accent text-ink-accent"
              >
                → <span className="mono">#{shell.composerTarget.orderKey}</span>
                <span className="text-technical text-muted-foreground">
                  prose writes an internal note
                </span>
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                className="size-5"
                aria-label="Stop writing to this order — prose returns to the assistant"
                title="Stop writing to this order — prose returns to the assistant"
                onClick={shell.clearComposerTarget}
              >
                <XIcon />
              </Button>
            </div>
          ) : null}
          <div className="feed-entry" ref={entryRef}>
            {/* LEADING `+` (2026-08-25, operator ruling). It opens the FILES
                tool, which is the only "add something to this session"
                verb the shell has — the universal composer meaning of `+`.

                FLAGGED: this is the third `+` in the application. The left
                rail's is New Session and the tools rail's is Add Tool.
                Three glyphs, three verbs. Each is unambiguous in its own
                container, but "the plus button" is now an ambiguous phrase
                between us, and a fourth would make the icon meaningless.
                Worth a distinct glyph (paperclip) if you disagree. */}
            <Button
              variant="ghost"
              size="icon"
              className={cn('size-7 shrink-0', railIconPlate)}
              aria-label="Attach a file to this session"
              title="Attach a file to this session"
              onClick={() => shell.toggleTool('files')}
            >
              <PlusIcon />
            </Button>

            {/* THE ONE FIELD (HANDOFF-ai-centre): identifiers chip, `/` runs
                actions, prose talks, and the gun lands here too. */}
            <OmniCommandComposer
              onCommit={commitWithFeedback}
              onDraftChange={setHasDraft}
              handleRef={composerHandle}
              attachScanCapture={scanCapture}
            />

            <Button
              variant="ghost"
              size="icon"
              className={cn('size-7 shrink-0', railIconPlate, railIconPlateDisabled)}
              aria-label="Send"
              disabled={!hasDraft}
              onClick={() => composerHandle.current?.submit()}
            >
              <SendIcon />
            </Button>
          </div>

            {/* THE ROW BELOW THE WELL (amended 2026-08-25): the tools
              combobox is gone by ruling — tools live on the right rail and
              behind the beam's ⋯. Until the contextual MODE ROW is planned
              and ruled on (PLAN-composer-modes.md), the row carries only
              the context ring, right-aligned where it always sat. */}
          <div className="composer-row justify-end" role="toolbar" aria-label="Composer context">
            <ContextRing shell={shell} label={contextLabel} />
          </div>
        </div>
      </div>
    </div>
  );
}
