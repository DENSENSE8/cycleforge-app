'use client';

/**
 * RIGHT RAIL — TOOLS. The mirror of the left: overflow · add · pins · label.
 *
 * Rendered from the TOOL REGISTRY, banded by `scope`. A session band with no
 * available tools renders NOTHING — a heading over an empty band spends the
 * rail's scarcest resource on saying there is nothing to say.
 *
 * Both rails run the same gradient, PERMANENCE DECREASES DOWNWARD:
 * left is pins → tabs → recents, right is assistant → global tools → session
 * tools. An operator who learns one has learned both, and the rule is a rule
 * rather than a coincidence of layout.
 *
 * There is ONE overflow in the application and it is the header's. A second
 * three-dots in the top-right corner is two menus claiming the same job;
 * unpinned tools are reachable from the launcher, which is the one index.
 */

import { Icon } from '@/shell/icons';
import { TOOLS, toolAvailable, type ToolDescriptor } from '@/shell/model';
import type { ShellApi } from '@/shell/useShell';

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
  const sessionTools = TOOLS.filter(
    (t) => t.scope === 'session' && toolAvailable(t, shell.sessionState, shell.activeRef),
  );

  return (
    <nav className={`rail right${expanded ? ' expanded' : ''}`} aria-label="Tools">
      <button
        type="button"
        className="rail-edge"
        onClick={shell.toggleRightRail}
        title="Show or hide the tool labels (Ctrl+Shift+B)"
        aria-label="Show or hide the tool labels"
        aria-expanded={expanded}
      >
        <span className="grip" />
      </button>

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

      {/* `agent` is a scope of one, and the band exists because the
          distinction is real: the assistant is the ONLY tool that writes on
          your behalf. `agent_mutations.actor_kind` already separates 'agent'
          from 'operator' in the ledger; the rail says the same thing. */}
      <ToolBand shell={shell} tools={TOOLS.filter((t) => t.scope === 'agent')} />
      <div className="rail-divider" />
      <ToolBand shell={shell} tools={TOOLS.filter((t) => t.scope === 'global')} />

      <button
        type="button"
        className="rail-slack"
        onClick={shell.toggleRightRail}
        title="Click the empty rail to show or hide labels (Ctrl+Shift+B)"
        aria-label="Show or hide the tool labels"
      />

      {/* THE VOLATILE BAND, bottom-anchored — the mirror of the left rail's
          recents. It renders nothing at all when no session is armed. */}
      <ToolBand shell={shell} tools={sessionTools} label="Session" />
      <button
        type="button"
        className="rail-label"
        onClick={shell.toggleRightRail}
        title="Collapse the tools rail"
      >
        Tools
      </button>
    </nav>
  );
}
