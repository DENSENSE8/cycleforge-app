'use client';

/**
 * RIGHT RAIL — TOOLS, the left rail's MIRROR (operator ruling, 2026-08-25 —
 * HANDOFF-session-composer-ux §5). Icon plates on the canvas ground: no bar,
 * no fill, no peek, no pin, no expanded mode. Border chrome is hover-only.
 * operator who learns one rail has learned both (R3), and the rebuild makes
 * that literal — same always-mounted column, same plate grammar, mirrored.
 *
 * What LEFT with the rebuild, and why:
 *   · `useRailPeek` / `rightRailOpen` / ⌘⇧B — a rail that is always
 *     mounted has nothing to peek, pin, or toggle (the same argument that
 *     unbound ⌘B when the left rail became permanent).
 *   · The expanded/labelled mode and its Collapse footer — R8: a rail is
 *     icons only. `Tooltip` names every control on hover AND focus.
 *
 * Rendered from the TOOL REGISTRY, banded by scope, permanence decreasing
 * downward (R9): add/search · assistant (the fixed head, T18) · global
 * tools · then session tools BOTTOM-anchored — the volatile band renders
 *  nothing when no session is armed (T9). A queued agent proposal still
 * badges the assistant icon (T12). The pushing `ToolPanel` stays the mount
 * for a tool's body, summoned from these icons and from the beam's ⋯.
 */

import { PlusIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Icon } from '@/shell/icons';
import { TOOLS, toolAvailable, type ToolDescriptor } from '@/shell/model';
import { railIconActive, railIconPlate } from '@/shell/rail-icon';
import type { ShellApi } from '@/shell/useShell';
import { cn } from '@/utils/_cn';

function ToolButton({ shell, tool }: { shell: ShellApi; tool: ToolDescriptor }) {
  const active = shell.toolPanelOpen && shell.openTool === tool.key;
  // A queued proposal is a fact the operator must see WITHOUT opening the
  // panel — so it badges the icon (T12).
  const badge = tool.key === 'ai' && shell.agentQueue.length > 0 ? shell.agentQueue.length : 0;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn('relative size-8', railIconPlate, active && railIconActive)}
          aria-pressed={active}
          aria-label={tool.label}
          onClick={() => shell.toggleTool(tool.key)}
        >
          <Icon name={tool.icon} size={16} />
          {badge > 0 ? (
            <Badge
              variant="destructive"
              className="absolute -right-0.5 -top-0.5 min-w-4 justify-center px-1 py-0 text-[9px] leading-4"
            >
              {badge}
            </Badge>
          ) : null}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="left">
        {tool.label} — {tool.scope} · {tool.cls}
      </TooltipContent>
    </Tooltip>
  );
}

export function RailTools({ shell }: { shell: ShellApi }) {
  const sessionTools = TOOLS.filter(
    (t) => t.scope === 'session' && toolAvailable(t, shell.sessionState, shell.activeRef),
  );

  return (
    <nav className="flex w-10 shrink-0 flex-col items-center gap-0.5 py-1" aria-label="Tools">
      {/* One add control per rail (R2) — the mirror of the left rail's
          Search plate, opening the same launcher pre-scoped to tools. */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn('size-8', railIconPlate)}
            aria-label="Add or search tools"
            onClick={() => shell.openLauncher('tool')}
          >
            <PlusIcon />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">Add or search tools</TooltipContent>
      </Tooltip>

      {/* The fixed head (T18), then the global band. */}
      {TOOLS.filter((t) => t.scope === 'agent').map((tool) => (
        <ToolButton key={tool.key} shell={shell} tool={tool} />
      ))}
      {TOOLS.filter((t) => t.scope === 'global').map((tool) => (
        <ToolButton key={tool.key} shell={shell} tool={tool} />
      ))}

      {/* THE VOLATILE BAND, bottom-anchored (R9) — the mirror of the left
          rail's `?`. It renders nothing when no session is armed (T9). */}
      {sessionTools.length > 0 ? (
        <div className="mt-auto flex flex-col items-center gap-0.5">
          {sessionTools.map((tool) => (
            <ToolButton key={tool.key} shell={shell} tool={tool} />
          ))}
        </div>
      ) : null}
    </nav>
  );
}
