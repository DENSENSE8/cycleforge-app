'use client';

/**
 * RIGHT RAIL — TOOLS. The mirror of the left: add · global tools · session
 * tools.
 *
 * Rendered from the TOOL REGISTRY, banded by `scope`. A session band with no
 * available tools renders NOTHING — a heading over an empty band spends the
 * rail's scarcest resource on saying there is nothing to say.
 *
 * NO `agent` BAND (2026-08-24, operator ruling): the well IS the assistant
 * now (the inversion, HANDOFF-ai-centre §1) — a second "Assistant" entry
 * here opened a tool panel standing in for the one surface that is already
 * permanently mounted and pinned centre. Two assistants was the bug.
 *
 * Both rails run the same gradient, PERMANENCE DECREASES DOWNWARD: left is
 * pins → tabs → recents, right is global tools → session tools. An operator
 * who learns one has learned both.
 *
 * There is ONE overflow in the application and it is the header's. A second
 * three-dots in the top-right corner is two menus claiming the same job;
 * unpinned tools are reachable from the launcher, which is the one index.
 *
 * FULLY CLOSEABLE (2026-08-24, operator ruling — amends R1 for this rail;
 * the left rail joined it for parity, see `RailSessions`). `shell.
 * rightRailOpen` PINS it open or closed; the header's button is the click
 * path and always works. This component adds a hover hot-zone at the
 * viewport's right edge (`useRailPeek`) that PEEKS it open without pinning
 * — a preview, never the only way in (R1's own clause), which is what keeps
 * a `(hover: none)` tablet unaffected: the click path is untouched by any
 * of this.
 */

import { Icon } from '@/shell/icons';
import { TOOLS, toolAvailable, type ToolDescriptor } from '@/shell/model';
import type { ShellApi } from '@/shell/useShell';
import { useRailPeek } from '@/shell/useRailPeek';

function ToolBand({
  shell,
  tools,
  label,
}: {
  shell: ShellApi;
  tools: readonly ToolDescriptor[];
  label?: string;
}) {
  if (tools.length === 0) return null;
  return (
    <div className="rail-group">
      {label ? <div className="recent-band-label">{label}</div> : null}
      {tools.map((tool) => {
        const active = shell.toolPanelOpen && shell.openTool === tool.key;
        // A queued proposal is a fact the operator must see WITHOUT opening
        // the panel — so it badges the icon.
        const badge = tool.key === 'ai' && shell.agentQueue.length > 0 ? shell.agentQueue.length : 0;
        return (
          <button
            type="button"
            key={tool.key}
            className={`rail-btn${active ? ' active' : ''}`}
            title={`${tool.label} — ${tool.scope} · ${tool.cls}`}
            aria-pressed={active}
            onClick={() => shell.toggleTool(tool.key)}
          >
            <Icon name={tool.icon} size={15} />
            <span className="rail-btn-label">{tool.label}</span>
            {badge > 0 ? <span className="rail-badge">{badge}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export function RailTools({ shell }: { shell: ShellApi }) {
  const expanded = shell.rightExpanded;
  const { visible, handleEnter, handleLeave } = useRailPeek(shell.rightRailOpen);
  const sessionTools = TOOLS.filter(
    (t) => t.scope === 'session' && toolAvailable(t, shell.sessionState, shell.activeRef),
  );

  return (
    <div className="rail-right-zone" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      {visible ? (
        <nav className={`rail right${expanded ? ' expanded' : ''}`} aria-label="Tools">
          <button
            type="button"
            className="rail-btn"
            onClick={() => shell.openLauncher('tool')}
            title="Add or search tools"
          >
            <Icon name="plus" size={16} />
            <span className="rail-btn-label">Add tool</span>
          </button>
          <div className="rail-divider" />

          <ToolBand shell={shell} tools={TOOLS.filter((t) => t.scope === 'global')} />

          {/* THE VOLATILE BAND, bottom-anchored — the mirror of the left
              rail's recents. It renders nothing at all when no session is
              armed. */}
          <ToolBand shell={shell} tools={sessionTools} label="Session" />
          <button
            type="button"
            className="rail-label"
            onClick={shell.toggleRightRail}
            title="Switch between icon-only and labelled"
          >
            Tools
          </button>
        </nav>
      ) : null}
    </div>
  );
}
