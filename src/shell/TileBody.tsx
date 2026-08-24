'use client';

/**
 * Tile bodies.
 *
 * The SHELL is what this lane ports; a tile's *contents* are the feature
 * modules that will be mounted into it. What is here is the prototype's own
 * placeholder content, kept for exactly one reason: it is what makes the
 * ported frame diffable against the file it came from on sight — the session
 * spine, the pipeline strip, the docked composer, the grid table and the
 * settings tile are all shell chrome that only appears with a body around it.
 *
 * NOT ported from the prototype (demo data with no shell rule behind it, and
 * a real module already owning the job): the staff-activity table, the
 * per-staffer `ops_events` replay, the orders-exceptions queue, and the FBA
 * task-session stepper. See `followUps`.
 */

import { Icon } from '@/shell/icons';
import { ACCENTS, DENSITY, PIPELINE, TILE_FLOOR_SESSION_PX, TILE_FLOOR_TABLE_PX, pipelineLabel, type AccentKey, type DensityKey, type ShellTile } from '@/shell/model';
import type { ShellApi } from '@/shell/useShell';

/**
 * The stage strip. Scan type IS the process stage, so it renders on the
 * SESSION — full tile width buys it a real strip instead of four squeezed
 * segments in shared chrome, and it is the level the procedure STEPS slot into.
 */
function Pipeline({ currentStage }: { currentStage: number }) {
  return (
    <div className="pipeline">
      {PIPELINE.map((stage, i) => (
        <div
          key={stage}
          className={`pipeline-step${i < currentStage ? ' done' : i === currentStage ? ' current' : ''}`}
        >
          <div className="pipeline-mark" />
          <span>{pipelineLabel(stage)}</span>
        </div>
      ))}
    </div>
  );
}

/** THE SPINE — identity, stage, carton. On the object, not in the beam. */
function SessionTile({ tile, shell }: { tile: ShellTile; shell: ShellApi }) {
  const task = tile.sessionKind === 'task';
  return (
    <div className="session-tile">
      <div className="tile-spine">
        <div className="tile-spine-identity">
          <span
            className={`session-state${shell.sessionState === 'armed' ? '' : ` ${shell.sessionState}`}`}
          >
            {task ? 'building' : shell.sessionState}
          </span>
          <span className="spine-title">{tile.title}</span>
          <span className="badge badge-accent">{task ? 'task' : 'carton'}</span>
          <span className="mono">
            {task ? 'batch is the unit of work' : `${shell.contextValue} · unit 3 of 12`}
          </span>
        </div>
        {task ? null : <Pipeline currentStage={shell.currentStage} />}
      </div>

      <div className="scan-await">
        <div className="scan-await-label">Awaiting scan</div>
        <div className="scan-await-line">Scan a unit to pack</div>
        <div className="scan-await-next">
          Next expected: <span className="mono">SN-8842-X</span>
        </div>
      </div>

      <div className="tile-hint">
        Last scan landed in this tile · <span className="kbd">Enter</span> to confirm
      </div>

      <div className="composer docked">
        <div className="composer-wrap">
          <div className="composer-toggle">
            <button type="button" className="active">
              internal
            </button>
            <button type="button">public</button>
          </div>
          <textarea placeholder="Add a note…" rows={1} aria-label="Add a note" />
        </div>
        <button type="button" className="btn btn-icon" title="Send">
          <Icon name="send" size={14} />
        </button>
      </div>
    </div>
  );
}

/**
 * What a work queue looks like once it stops being a rail: real columns, a
 * selection column and room for the identity facts the rail's peek card had to
 * hide. PLACEHOLDER ROWS — the real mount is the table host.
 */
const DEMO_ROWS: readonly (readonly [string, string, string, string, string, string, string])[] = [
  ['ok', 'C-8842-A', 'UPS', '1Z999AA10123456784', 'B', 'unbox', '4m'],
  ['ok', 'C-8839-B', 'FedEx', '7742 8891 0021', 'A', 'unbox', '11m'],
  ['warn', 'C-8830-K', 'USPS', '9410 8036 9930 41', 'C', 'triage', '38m'],
  ['err', 'C-8827-D', 'UPS', '1Z999AA10987654321', '—', 'triage', '1h 02m'],
  ['info', 'C-8821-M', 'DHL', 'JVGL0999 8812 34', 'B', 'testing', '2h 14m'],
  ['ok', 'C-8814-P', 'FedEx', '7742 8890 5510', 'A', 'packing', '3h 40m'],
];

function TableTile() {
  return (
    <>
      <table className="data-table">
        <thead>
          <tr>
            <th className="col-xs" />
            <th className="col-s">carton</th>
            <th>carrier</th>
            <th className="col-m">tracking</th>
            <th className="col-xs">gr</th>
            <th className="col-s">stage</th>
            <th className="col-s">age</th>
          </tr>
        </thead>
        <tbody>
          {DEMO_ROWS.map((r) => (
            <tr key={r[1]}>
              <td>
                <span className={`status-dot ${r[0]}`} />
              </td>
              <td className="mono">{r[1]}</td>
              <td>{r[2]}</td>
              <td className="mono">{r[3]}</td>
              <td className="mono">{r[4]}</td>
              <td>{r[5]}</td>
              <td className="mono">{r[6]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="tile-note">Placeholder rows — the table host mounts here.</div>
    </>
  );
}

/**
 * SETTINGS IS A TILE, not a modal and not a page. It is a view of data you
 * edit, so it tiles beside the thing you are adjusting and you watch the
 * change land live.
 */
function SettingsTile({ shell }: { shell: ShellApi }) {
  const floorScale = DENSITY[shell.prefs.density].floorScale;
  return (
    <div className="settings-tile">
      <div>
        <div className="recent-band-label standalone">Arrangement — yours, unrestricted</div>
        <div className="settings-copy">
          Tabs, pins, tools, canvas layout, saved workspaces, keybindings, the header readout.
          Per staff, per org. Nothing here is bounded, because none of it changes what anything{' '}
          <b>means</b>.
        </div>
      </div>

      <div>
        <div className="recent-band-label standalone">Comfort — yours, bounded</div>

        <div className="settings-row">
          <span className="settings-row-label">Density</span>
          <div className="composer-toggle">
            {(['compact', 'default', 'roomy'] as DensityKey[]).map((d) => (
              <button
                type="button"
                key={d}
                className={shell.prefs.density === d ? 'active' : undefined}
                aria-pressed={shell.prefs.density === d}
                onClick={() => shell.setPref('density', d)}
              >
                {d}
              </button>
            ))}
          </div>
          <span className="mono tool-empty-sub">floors ×{floorScale.toFixed(2)}</span>
        </div>
        <div className="settings-copy spaced">
          One scale, not separate padding knobs. The tile floors were measured against a density,
          so they scale with it — session {Math.round(TILE_FLOOR_SESSION_PX * floorScale)}px, table{' '}
          {Math.round(TILE_FLOOR_TABLE_PX * floorScale)}px. Separate knobs would be an untested
          combination with silently wrong floors.
        </div>

        <div className="settings-row">
          <label className="settings-row-label" htmlFor="pref-radius">
            Frame radius
          </label>
          <input
            id="pref-radius"
            className="pref-range"
            type="range"
            min={0}
            max={16}
            step={1}
            value={shell.prefs.radius}
            onChange={(e) => shell.setPref('radius', Number(e.target.value))}
          />
          <span className="mono">{shell.prefs.radius}px</span>
        </div>
        <div className="settings-copy spaced">
          Safe to expose <i>because</i> the control radius tokens do not exist. Radius appears in
          exactly one place — the workspace frame — so this parameterizes that place instead of
          reopening the question.
        </div>

        <div className="settings-row">
          <span className="settings-row-label">Accent</span>
          <div className="accent-swatches">
            {(Object.keys(ACCENTS) as AccentKey[]).map((name) => (
              <button
                type="button"
                key={name}
                className="btn btn-sm"
                style={{
                  borderColor: ACCENTS[name].light,
                  color: ACCENTS[name].light,
                  fontWeight: shell.prefs.accent === name ? 700 : undefined,
                }}
                aria-pressed={shell.prefs.accent === name}
                onClick={() => shell.setPref('accent', name)}
              >
                {name}
                {shell.prefs.accent === name ? ' ·' : ''}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div>
        <div className="recent-band-label standalone">Meaning — locked</div>
        <div className="status-legend">
          {(
            [
              ['ok', 'packed / on target'],
              ['warn', 'pending / near limit'],
              ['err', 'damaged / over'],
              ['info', 'received'],
            ] as const
          ).map(([k, l]) => (
            <span className="status-legend-item" key={k}>
              <span className={`status-dot ${k}`} />
              {l}
            </span>
          ))}
        </div>
        <div className="settings-copy">
          Not a preference. Semantic colour is a <b>shared vocabulary</b>: if two staff recolour
          their own, they read the same screen differently, and a lead walking the floor cannot
          read anyone&apos;s. Org-level only, and only for accessibility — never taste.
        </div>
      </div>
    </div>
  );
}

export function TileBody({ tile, shell }: { tile: ShellTile; shell: ShellApi }) {
  if (tile.ref === 'settings') return <SettingsTile shell={shell} />;
  if (tile.type === 'session') return <SessionTile tile={tile} shell={shell} />;
  if (tile.type === 'table') return <TableTile />;
  return <div className="tile-placeholder">Tile content</div>;
}
