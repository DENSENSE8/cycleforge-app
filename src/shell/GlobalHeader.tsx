'use client';

/**
 * THE BEAM. Identity pin · session cluster · context line · overflow.
 *
 * Pairing and the timers are TOOLS and live in the right rail; the beam
 * reports identity and never verbs. The context line carries only what is
 * GENUINELY GLOBAL — the session's own identity lives on the session tile,
 * which is where the operator is already looking, and repeating it 700px away
 * in centred chrome is a saccade for nothing.
 */

import { IdentityMenu } from '@/shell/IdentityMenu';
import { Icon } from '@/shell/icons';
import { mmss, useClock } from '@/shell/clock';
import { PIPELINE, STAGE_TARGETS } from '@/shell/model';
import type { ShellApi } from '@/shell/useShell';

/**
 * SCAN-ARMED — permanent, and welded to the scan field. Not a toast. The
 * operator must be able to see where the next scan lands without leaving the
 * carton, so it never auto-hides and it never moves.
 */
function ScanArmed({ shell }: { shell: ShellApi }) {
  const { sessionState, sessionName } = shell;
  const named = sessionName.trim().length > 0;
  const label =
    sessionState === 'armed'
      ? named
        ? sessionName
        : 'Unnamed session'
      : sessionState === 'parked'
        ? 'parked — no target'
        : sessionState === 'ended'
          ? 'no session'
          : 'scan blocked';

  return (
    <div
      className={`scan-armed${sessionState === 'armed' ? '' : ` ${sessionState}`}`}
      title="Where the next scan lands"
    >
      <div className="mark" />
      <span>{label}</span>
    </div>
  );
}

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
      {/* Identity owns the top-left — Linear / Vercel name pin. Scan type
          and search used to live here; they do not any more. */}
      <IdentityMenu shell={shell} />
      <div className="corner-cluster">
        <ScanArmed shell={shell} />
        <button
          type="button"
          className="zone-context"
          title="Session context"
          onClick={() => shell.setSessionPopoverOpen(true)}
        >
          <Icon name="box" size={14} />
          <span className="mono">{shell.contextValue}</span>
        </button>
      </div>

      <div className="context-line">
        <div className="ctx-seg">
          <span className="ctx-global">{shell.globalContext}</span>
          <span className="ctx-sep" />
          {/* The session lifecycle, narrated: "starting session" while the
              AI-first screen is up, "session started" once one is armed. */}
          <span className={`ctx-narration ${shell.sessionState}`}>{shell.sessionNarration}</span>
        </div>
      </div>

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
      </div>
    </header>
  );
}
