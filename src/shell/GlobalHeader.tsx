'use client';

/**
 * THE BEAM. SIMPLIFIED (2026-08-24, operator ruling): left-rail toggle ·
 * identity · timer · overflow · right-rail toggle — the two toggles are
 * the outermost elements, flush at the true top-left and top-right
 * corners (no header padding, no hairline). The corner cluster (armed
 * pill, carton chip) and the context line (global context, session
 * narration) are gone — both were restating facts the well already carries
 * as the chronology's own line items and its armed-block header (Phase 2),
 * 700px away in centred chrome for a second read.
 */

import { IdentityMenu } from '@/shell/IdentityMenu';
import { Icon } from '@/shell/icons';
import { mmss, useClock } from '@/shell/clock';
import { PIPELINE, STAGE_TARGETS } from '@/shell/model';
import type { ShellApi } from '@/shell/useShell';

/**
 * THE HEADER FACE — one slot, fixed width, readouts only. It is
 * `elapsed / target`, not two counters: "how long am I taking" and "is there a
 * limit" are the same question and one pair answers both at a glance. It is
 * also its own button — a readout behind a dropdown is not a readout.
 */
function HeaderFace({ shell }: { shell: ShellApi }) {
  const { faceMode, sessionState, currentStage, toggleTool } = shell;
  const clock = useClock();

  if (faceMode === 'off') return null;

  const armed = sessionState === 'armed';
  const paced = faceMode === 'pace';
  const target = armed && paced ? STAGE_TARGETS[PIPELINE[currentStage]] : null;

  // `elapsed` mode is NEVER coloured. Colour is the verdict, and this mode
  // exists precisely for the operator who wants the clock without one.
  let tone = 'idle';
  if (armed && target) {
    const ratio = clock.elapsed / target;
    tone = ratio >= 1 ? 'over' : ratio >= 0.8 ? 'near' : 'on-target';
  }

  return (
    <button
      type="button"
      className={`header-face ${paced ? tone : 'idle'}`}
      style={{ width: paced ? '128px' : '78px' }}
      onClick={() => toggleTool('timer')}
      title={
        paced
          ? 'Session elapsed against the target for this task type. Click for the timer.'
          : 'Session elapsed. No target shown. Click for the timer.'
      }
    >
      <span className="mono">{armed ? mmss(clock.elapsed % 3600) : '--:--'}</span>
      {/* In `elapsed` mode the target half is not blanked — it is REMOVED, so
          the slot narrows and stops implying a hidden number. */}
      {target ? <span className="face-sep">/</span> : null}
      {target ? <span className="mono">{mmss(target)}</span> : null}
    </button>
  );
}

export function GlobalHeader({ shell }: { shell: ShellApi }) {
  return (
    <header className="wos-header">
      {/* THE LEFT-RAIL TOGGLE — the true top-left corner (2026-08-24):
          the outermost element on the beam, ahead of identity, so nothing
          sits closer to the corner than it. The mirror of the right
          rail's button — same control, same icon, other side. PINS the
          rail open or fully closed; `RailSessions`'s hover hot-zone at
          the viewport's left edge can also peek it open without pinning,
          but this click always works, hover-capable device or not. */}
      <button
        type="button"
        className={`cluster-btn${shell.leftRailOpen ? ' active' : ''}`}
        title="Open or close the sessions panel (Ctrl+B)"
        aria-label="Open or close the sessions panel"
        aria-expanded={shell.leftRailOpen}
        aria-pressed={shell.leftRailOpen}
        onClick={shell.toggleLeftRailOpen}
      >
        <Icon name="split" size={15} />
      </button>

      {/* SEARCH + ADD — ALWAYS accessible (2026-08-24), regardless of
          whether the sessions rail is open or closed. The rail's own "+"
          disappears with it when closed; these two live in the beam
          instead, so the one launcher (T11, R2) never goes more than a
          click away. Both open the same launcher — a second "+" here
          isn't a second index, it's the one index reachable from a
          second place. */}
      <button
        type="button"
        className="cluster-btn"
        title="Search (Ctrl+K)"
        onClick={() => shell.openLauncher('')}
      >
        <Icon name="search" size={15} />
      </button>
      <button
        type="button"
        className="cluster-btn"
        title="Add a session or table (Ctrl+K)"
        onClick={() => shell.openLauncher('')}
      >
        <Icon name="plus" size={15} />
      </button>

      {/* Identity sits right after the corner controls now. */}
      <IdentityMenu shell={shell} />

      {/* No fixed content claims the middle — nothing here is genuinely
          global enough to earn centred chrome (the well already narrates
          the session). The spacer keeps the right-anchored group pinned
          to the corner regardless. */}
      <div className="header-spacer" />

      <HeaderFace shell={shell} />

      <div className="header-overflow">
        <button
          type="button"
          className="cluster-btn"
          title="Session · settings · everything else"
          onClick={() => shell.setSessionPopoverOpen(!shell.sessionPopoverOpen)}
        >
          <Icon name="more" size={15} />
        </button>
        {/* THE RIGHT-RAIL TOGGLE — the outermost, top-right corner. It
            PINS the rail open or fully closed (2026-08-24) — closed means
            gone, not just icon-only; `RailTools`'s hover hot-zone can also
            peek it open without pinning, but this click always works,
            hover-capable device or not. It sits last so it is the single
            furthest-right thing on the beam. */}
        <button
          type="button"
          className={`cluster-btn${shell.rightRailOpen ? ' active' : ''}`}
          title="Open or close the tools panel (Ctrl+Shift+B)"
          aria-label="Open or close the tools panel"
          aria-expanded={shell.rightRailOpen}
          aria-pressed={shell.rightRailOpen}
          onClick={shell.toggleRightRailOpen}
        >
          <Icon name="split" size={15} />
        </button>
      </div>
    </header>
  );
}
