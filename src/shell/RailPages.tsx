'use client';

/**
 * LEFT RAIL — PAGES. 40px collapsed, 208px expanded, INSTANTLY: a rail that
 * tweens its width holds the canvas hostage for the length of the tween and
 * hands back nothing during it.
 *
 * Order is meaningful — add · pins · label · tabs · recents. A pin is
 * always-there; a tab is currently-open. Both rails run the same gradient:
 * PERMANENCE DECREASES DOWNWARD.
 *
 * THE RAIL'S INNER EDGE IS THE CONTROL, AND IT IS THE ONLY ONE. The border
 * between rail and canvas is the line that actually moves when the rail
 * expands, so it is the line you grab. There is no chevron and no collapse
 * button anywhere: a second visible control for one verb was an apology for
 * not trusting the first.
 */

import { Icon } from '@/shell/icons';
import { RECENT_KINDS, type RecentEntry } from '@/shell/model';
import type { ShellApi } from '@/shell/useShell';

/**
 * RECENTS — per staff, per org. Never per session. Banded by kind in a FIXED
 * order, MRU within a band. The band is what makes the list reachable by
 * muscle memory: cartons sit at the same offset from the top whatever you did
 * at another bench. Recency is not lost to the banding — it is carried by the
 * marker instead, which is why the marker exists.
 */
function Recents({ shell }: { shell: ShellApi }) {
  const newest = shell.recents.reduce<RecentEntry | null>(
    (best, r) => (best === null || r.at > best.at ? r : best),
    null,
  );

  return (
    <div className={`recents-list${shell.recentsCollapsed ? ' collapsed' : ''}`}>
      {RECENT_KINDS.map((band) => {
        const rows = shell.recents
          .filter((r) => r.kind === band.kind)
          .sort((a, b) => b.at - a.at)
          .slice(0, band.cap);
        if (rows.length === 0) return null;

        return (
          <div className="recent-band" key={band.kind} data-kind={band.kind}>
            <div className="recent-band-label">{band.label}</div>
            {rows.map((r) => {
              const isLast = newest !== null && r.id === newest.id;
              const inSession = r.sessionId === shell.liveSessionId;
              return (
                <button
                  type="button"
                  key={r.id}
                  className={`recent-item${inSession ? ' in-session' : ''}${isLast ? ' is-last' : ''}`}
                  title={`${isLast ? 'Most recent selection · ' : ''}${band.label.replace(/s$/, '')} · ${r.title} — ${r.sub}${inSession ? ' · this session' : ''}`}
                  onClick={() => shell.touchRecent(r.id)}
                >
                  <Icon name={band.icon} size={15} />
                  <span className="recent-text">
                    <span className="recent-title">{r.title}</span>
                    <span className="recent-sub">{r.sub}</span>
                  </span>
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

export function RailPages({ shell }: { shell: ShellApi }) {
  const expanded = shell.leftExpanded;

  return (
    <nav className={`rail left${expanded ? ' expanded' : ''}`} aria-label="Pages">
      <button
        type="button"
        className="rail-edge"
        onClick={shell.toggleLeftRail}
        title="Show or hide the page labels (Ctrl+B)"
        aria-label="Show or hide the page labels"
        aria-expanded={expanded}
      >
        <span className="grip" />
      </button>

      <button
        type="button"
        className="rail-btn"
        onClick={() => shell.openLauncher('')}
        title="Add a page or table (Ctrl+N)"
      >
        <Icon name="plus" size={16} />
        <span className="rail-btn-label">Add page or table</span>
      </button>
      <div className="rail-divider" />

      {/* PINNED — above the tabs, and that ordering is the point. */}
      <div className="rail-group">
        {shell.pins.map((pin) => (
          <button
            type="button"
            key={pin.id}
            className="pin"
            title={`${pin.title} — pinned`}
            onClick={() => shell.openTile(pin.id, pin.title, 'table')}
          >
            <Icon name={pin.icon} size={15} />
            <span className="tab-name">{pin.title}</span>
          </button>
        ))}
      </div>

      <div className="rail-divider rail-divider-collapsed" />
      <button
        type="button"
        className="rail-label"
        onClick={shell.toggleLeftRail}
        title="Collapse the pages rail"
      >
        Pages
      </button>

      <div className="tab-list">
        {shell.tabs.map((tab) => (
          <button
            type="button"
            key={tab.ref}
            className={`tab${tab.ref === shell.activeRef ? ' active' : ''}`}
            title={tab.title}
            onClick={() => shell.focusRef(tab.ref)}
            onContextMenu={(e) => {
              e.preventDefault();
              const tile = shell.tiles.find((t) => t.ref === tab.ref);
              shell.setContextMenu({ x: e.clientX, y: e.clientY, tileId: tile?.id ?? null });
            }}
          >
            <Icon name={tab.icon} size={15} />
            <span className="tab-name">{tab.title}</span>
            {tab.color ? <span className="tab-color" style={{ background: tab.color }} /> : null}
          </button>
        ))}
      </div>

      {/* THE SLACK. Both content blocks are anchored to an edge and the unused
          space sits between them, where nothing can be destabilized by it.
          It is also the rail's open/close: the one region here that can never
          hold a tab, so a click in it cannot mean anything else. */}
      <button
        type="button"
        className="rail-slack"
        onClick={shell.toggleLeftRail}
        title="Click the empty rail to show or hide labels (Ctrl+B)"
        aria-label="Show or hide the page labels"
      />

      <div className="rail-divider" />
      <button
        type="button"
        className={`recents-header${shell.recentsCollapsed ? ' collapsed' : ''}`}
        onClick={shell.toggleRecents}
        title="Recents — yours, per org. Banded by kind; the tint marks your most recent selection."
        aria-expanded={!shell.recentsCollapsed}
      >
        <span className="recents-icon">
          <Icon name="history" size={15} />
        </span>
        <span className="recents-chevron">
          <Icon name="chevron-down" size={10} />
        </span>
        <span>Recents</span>
      </button>
      <Recents shell={shell} />

      {/* The corner carries one control. Theme went into settings — a palette
          swap is a preference, not a floor control — and the rail's width is
          the edge strip's job. */}
      <div className="rail-footer">
        <button
          type="button"
          className={`rail-btn${shell.settingsPopoverOpen ? ' active' : ''}`}
          title="Settings"
          onClick={(e) => {
            e.stopPropagation();
            shell.setSettingsPopoverOpen(!shell.settingsPopoverOpen);
          }}
        >
          <Icon name="settings" size={16} />
          <span className="rail-btn-label">Settings</span>
        </button>
      </div>
    </nav>
  );
}
