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

import { XIcon } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
      <div className="flex flex-col gap-0.5 pb-3">
        <div className="mono text-xl font-semibold text-foreground">{hhmmss(clock.elapsed)}</div>
        <div className="font-condensed text-technical font-bold uppercase tracking-[0.14em] text-muted-foreground">Session elapsed</div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={toggleElapsed}>
          {clock.elapsedRunning ? 'Pause' : 'Resume'}
        </Button>
        <Button variant="outline" size="sm" onClick={resetElapsed}>
          Reset
        </Button>
      </div>
      <div className="flex flex-col gap-2 border-t border-border pt-3">
        <div className="font-condensed text-technical font-bold uppercase tracking-[0.14em] text-muted-foreground">Header readout</div>
        <ToggleGroup className="self-stretch" aria-label="Header readout">
          {modes.map(([mode, label]) => (
            <ToggleGroupItem
              key={mode}
              className="flex-1"
              active={shell.faceMode === mode}
              onClick={() => shell.setFaceMode(mode)}
            >
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div className="text-xs leading-relaxed text-muted-foreground">
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
      <div className="flex flex-col gap-0.5 pb-3">
        <div className="mono text-xl font-semibold text-foreground">{hhmmss(clock.stopwatch).slice(3)}</div>
        <div className="font-condensed text-technical font-bold uppercase tracking-[0.14em] text-muted-foreground">Lap timing</div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={toggleStopwatch}>
          {clock.stopwatchRunning ? 'Stop' : 'Start'}
        </Button>
        <Button variant="outline" size="sm" onClick={resetStopwatch}>
          Reset
        </Button>
      </div>
    </>
  );
}

function AssistantBody({ shell }: { shell: ShellApi }) {
  return (
    <div className="flex flex-col gap-2">
      {shell.agentQueue.length > 0 ? (
        <div>
          <div className="font-condensed text-technical font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Awaiting review · {shell.agentQueue.length}
          </div>
          {shell.agentQueue.map((m) => (
            <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-3" key={m.id}>
              <div className="text-sm font-medium text-card-foreground">{m.summary}</div>
              <div className="mono text-xs text-muted-foreground mono">{m.kind}</div>
              <div className="text-xs leading-relaxed text-muted-foreground">{m.why}</div>
              <div className="flex gap-2 pt-1">
                <Button size="sm"
                  onClick={() => shell.agentApply(m.id)}
                >
                  Apply
                </Button>
                <Button variant="outline" size="sm" onClick={() => shell.agentDismiss(m.id)}>
                  Dismiss
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-1 py-6 text-center text-sm text-muted-foreground">Nothing awaiting review</div>
      )}
      <div>
        <div className="font-condensed text-technical font-bold uppercase tracking-[0.14em] text-muted-foreground">Applied today · {shell.agentApplied}</div>
        <Button variant="outline" size="sm" onClick={shell.agentUndo}>
          Undo last
        </Button>
      </div>
      {/* HARD RULE (operator, 2026-08-24): the shell has ONE composer.
          The panel's own "Ask the assistant" textarea was deleted — asking
          the assistant IS the main composer's prose path; a panel that
          grows a second mouth splits where words go. */}
      <div className="text-xs text-muted-foreground">Ask through the main composer — it is the one input.</div>
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
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pair-tracking">Tracking number</Label>
              <Input id="pair-tracking" type="text" defaultValue="1Z999AA10123456784" />
            </div>
            <div className="text-center text-base text-muted-foreground" aria-hidden>
              ↕
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pair-serial">Serial</Label>
              <Input id="pair-serial" type="text" placeholder="Scan serial…" />
            </div>
            <Button size="sm">
              Commit pair</Button>
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
          <div className="flex flex-col gap-2">
            <div className="text-xs leading-relaxed text-muted-foreground">
              Orders sync on a schedule. This is the manual path — a fallback when the sync is
              down, or a one-off file. Either way the rows land in the same exceptions queue.
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="import-channel">Channel</Label>
              <Input id="import-channel" className="text-muted-foreground" type="text" defaultValue="eBay" readOnly />
            </div>
            <Button size="sm">
              Import rows</Button>
          </div>
        ),
        footer: 'Actuator · single act · nothing staged',
      };
    case 'photos':
      return {
        title: 'Photo library',
        body: (
          <div className="flex flex-col items-center gap-1 py-6 text-center text-sm text-muted-foreground">
            12 photos
            <br />
            <span className="text-xs text-muted-foreground">Drag onto a tile to attach</span>
          </div>
        ),
        footer: 'Auto-summoned on unit scan',
      };
    case 'manuals':
      return {
        title: 'Manuals',
        body: (
          <div className="flex flex-col items-center gap-1 py-6 text-center text-sm text-muted-foreground">
            3 manuals linked
            <br />
            <span className="text-xs text-muted-foreground">Auto-summoned on scan</span>
          </div>
        ),
        footer: 'Testing stage only',
      };
    case 'printer':
      return {
        title: 'Label printer',
        body: (
          <div className="flex flex-col items-center gap-1 py-6 text-center text-sm text-muted-foreground">
            Printer: Zebra-ZT411
            <br />
            <span className="text-xs text-muted-foreground">Paired · 42 labels today</span>
          </div>
        ),
        footer: 'USB/serial — workstation bound',
      };
    case 'calc':
    default:
      return {
        title: 'Calculator',
        body: (
          <div className="grid grid-cols-4 gap-1">
            {CALC_KEYS.map((k) => (
              <Button key={k} variant={k === '=' ? 'default' : 'outline'} size="sm" className="min-h-9">
                {k}
              </Button>
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
    /* It PUSHES, it does not float: a panel over the work is a panel you
       cannot read past. A flex sibling in normal flow, appearing and
       disappearing instantly — the canvas simply gets narrower. */
    <aside
      className={`${shell.toolPanelOpen ? 'flex' : 'hidden'} w-[280px] shrink-0 flex-col overflow-hidden border-l border-border bg-plane-edge`}
      aria-label={title}
    >
      <div className="flex h-[26px] shrink-0 items-center justify-between border-b border-border bg-plane-edge-raised pl-3 pr-1 font-condensed text-technical font-bold uppercase tracking-[0.14em] text-muted-foreground">
        <span>{title}</span>
        <Button variant="ghost" size="icon" className="size-5" onClick={shell.closeToolPanel} aria-label="Close tool">
          <XIcon />
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-3 text-xs">{body}</div>
      </ScrollArea>
      <div className="shrink-0 border-t border-border px-3 py-1 font-condensed text-technical font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {footer}
      </div>
    </aside>
  );
}
