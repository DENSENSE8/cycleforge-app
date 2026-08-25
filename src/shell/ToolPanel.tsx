'use client';

/**
 * THE TOOL PANEL — it PUSHES. `position: absolute` + a shadow was the easy
 * answer and the wrong one: on a bench a panel over the work is a panel you
 * cannot read past. It is a flex sibling in normal flow between canvas and
 * right rail, it appears and disappears instantly, and the canvas simply gets
 * 280px narrower.
 *
 * Bodies here are the prototype's, unchanged. Each is a placeholder for the
 * real tool module; what this lane owns is the panel, its push, its header and
 * its footer line — the footer names the tool's INPUT CLASS, which is what
 * decides whether a tool may ever auto-summon.
 */

import { Icon } from '@/shell/icons';
import { hhmmss, resetElapsed, resetStopwatch, toggleElapsed, toggleStopwatch, useClock } from '@/shell/clock';
import { FilesBody } from '@/shell/FilesPanel';
import type { FaceMode } from '@/shell/model';
import type { ShellApi } from '@/shell/useShell';

const CALC_KEYS = ['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '−', '0', '.', '=', '+'];

function TimerBody({ shell }: { shell: ShellApi }) {
  const clock = useClock();
  const modes: readonly [FaceMode, string][] = [
    ['pace', 'pace'],
    ['elapsed', 'elapsed'],
    ['off', 'off'],
  ];
  return (
    <>
      <div className="tool-readout">
        <div className="tool-readout-value">{hhmmss(clock.elapsed)}</div>
        <div className="tool-readout-label">Session elapsed</div>
      </div>
      <div className="tool-actions">
        <button type="button" className="btn" onClick={toggleElapsed}>
          {clock.elapsedRunning ? 'Pause' : 'Resume'}
        </button>
        <button type="button" className="btn" onClick={resetElapsed}>
          Reset
        </button>
      </div>
      <div className="tool-section">
        <div className="recent-band-label standalone">Header readout</div>
        <div className="composer-toggle" style={{ alignSelf: 'stretch' }}>
          {modes.map(([mode, label]) => (
            <button
              type="button"
              key={mode}
              className={shell.faceMode === mode ? 'active' : undefined}
              aria-pressed={shell.faceMode === mode}
              onClick={() => shell.setFaceMode(mode)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="tool-note">
          <b>pace</b> shows the target and colours when you are near or over it. <b>elapsed</b>{' '}
          shows the clock only and is never coloured. <b>off</b> hides the readout.
          <br />
          This is a display setting for you alone. Work is recorded either way — it changes what
          you see, not what is measured.
        </div>
      </div>
    </>
  );
}

function StopwatchBody() {
  const clock = useClock();
  return (
    <>
      <div className="tool-readout">
        <div className="tool-readout-value">{hhmmss(clock.stopwatch).slice(3)}</div>
        <div className="tool-readout-label">Lap timing</div>
      </div>
      <div className="tool-actions">
        <button type="button" className="btn btn-primary" onClick={toggleStopwatch}>
          {clock.stopwatchRunning ? 'Stop' : 'Start'}
        </button>
        <button type="button" className="btn" onClick={resetStopwatch}>
          Reset
        </button>
      </div>
    </>
  );
}

function AssistantBody({ shell }: { shell: ShellApi }) {
  return (
    <div className="tool-block">
      {shell.agentQueue.length > 0 ? (
        <div>
          <div className="recent-band-label standalone">
            Awaiting review · {shell.agentQueue.length}
          </div>
          {shell.agentQueue.map((m) => (
            <div className="agent-card" key={m.id}>
              <div className="agent-card-title">{m.summary}</div>
              <div className="agent-card-kind mono">{m.kind}</div>
              <div className="agent-card-why">{m.why}</div>
              <div className="agent-card-actions">
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={() => shell.agentApply(m.id)}
                >
                  Apply
                </button>
                <button type="button" className="btn btn-sm" onClick={() => shell.agentDismiss(m.id)}>
                  Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="tool-empty">Nothing awaiting review</div>
      )}
      <div>
        <div className="recent-band-label standalone">Applied today · {shell.agentApplied}</div>
        <button type="button" className="btn btn-sm" onClick={shell.agentUndo}>
          Undo last
        </button>
      </div>
      {/* HARD RULE (operator, 2026-08-24): the shell has ONE composer.
          The panel's own "Ask the assistant" textarea was deleted — asking
          the assistant IS the main composer's prose path; a panel that
          grows a second mouth splits where words go. */}
      <div className="tool-empty-sub">Ask through the main composer — it is the one input.</div>
    </div>
  );
}

/** title · body · footer, per tool. The footer is the tool's input class. */
function panelFor(shell: ShellApi): { title: string; body: React.ReactNode; footer: string } {
  switch (shell.openTool) {
    case 'ai':
      return {
        title: 'Assistant',
        body: <AssistantBody shell={shell} />,
        footer: 'Writes land in agent_mutations · every row reversible',
      };
    case 'timer':
      return {
        title: 'Timer',
        body: <TimerBody shell={shell} />,
        footer: 'Auto-started when session opened',
      };
    case 'stopwatch':
      return { title: 'Stopwatch', body: <StopwatchBody />, footer: 'User-pinned tool' };
    case 'pairing':
      // Pairing is an operation, so it lives here and not in the beam.
      return {
        title: 'Pairing',
        body: (
          <div className="tool-block">
            <div className="session-field">
              <label htmlFor="pair-tracking">Tracking number</label>
              <input id="pair-tracking" type="text" defaultValue="1Z999AA10123456784" />
            </div>
            <div className="pair-arrow" aria-hidden>
              ↕
            </div>
            <div className="session-field">
              <label htmlFor="pair-serial">Serial</label>
              <input id="pair-serial" type="text" placeholder="Scan serial…" />
            </div>
            <button type="button" className="btn btn-primary">
              Commit pair
            </button>
          </div>
        ),
        footer: 'Operation — not header chrome',
      };
    case 'files':
      // N6 — native file workspaces (T30). Real, not a placeholder: full CRUD
      // on operator-opened folders through the desktop bridge.
      return {
        title: 'Files',
        body: <FilesBody />,
        footer: 'Desktop only · scoped to folders you open',
      };
    case 'import':
      return {
        title: 'Import orders',
        body: (
          <div className="tool-block">
            <div className="tool-copy">
              Orders sync on a schedule. This is the manual path — a fallback when the sync is
              down, or a one-off file. Either way the rows land in the same exceptions queue.
            </div>
            <div className="session-field">
              <label htmlFor="import-channel">Channel</label>
              <input id="import-channel" className="readonly" type="text" defaultValue="eBay" readOnly />
            </div>
            <button type="button" className="btn btn-primary">
              Import rows
            </button>
          </div>
        ),
        footer: 'Actuator · single act · nothing staged',
      };
    case 'photos':
      return {
        title: 'Photo library',
        body: (
          <div className="tool-empty">
            12 photos
            <br />
            <span className="tool-empty-sub">Drag onto a tile to attach</span>
          </div>
        ),
        footer: 'Auto-summoned on unit scan',
      };
    case 'manuals':
      return {
        title: 'Manuals',
        body: (
          <div className="tool-empty">
            3 manuals linked
            <br />
            <span className="tool-empty-sub">Auto-summoned on scan</span>
          </div>
        ),
        footer: 'Testing stage only',
      };
    case 'printer':
      return {
        title: 'Label printer',
        body: (
          <div className="tool-empty">
            Printer: Zebra-ZT411
            <br />
            <span className="tool-empty-sub">Paired · 42 labels today</span>
          </div>
        ),
        footer: 'USB/serial — workstation bound',
      };
    case 'calc':
    default:
      return {
        title: 'Calculator',
        body: (
          <div className="calc-grid">
            {CALC_KEYS.map((k) => (
              <button type="button" key={k} className={`btn${k === '=' ? ' btn-primary' : ''}`}>
                {k}
              </button>
            ))}
          </div>
        ),
        footer: 'Pinned tool',
      };
  }
}

export function ToolPanel({ shell }: { shell: ShellApi }) {
  const { title, body, footer } = panelFor(shell);
  return (
    <div className={`tool-panel${shell.toolPanelOpen ? ' open' : ''}`} aria-label={title}>
      <div className="tool-panel-header">
        <span>{title}</span>
        <button
          type="button"
          className="rail-btn rail-btn-sm"
          onClick={shell.closeToolPanel}
          title="Close tool"
        >
          <Icon name="close" size={12} />
        </button>
      </div>
      <div className="tool-panel-body">{body}</div>
      <div className="tool-panel-footer">{footer}</div>
    </div>
  );
}
