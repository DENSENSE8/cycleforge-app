/**
 * The five operator sentences, as the operator sees them: the question on the
 * left in the chat column, the report on the right on the artifact panel.
 *
 * The payloads are NOT hand-written. `scripts/gen-report-fixtures.ts` runs the
 * five real builders in `src/lib/reports/` against a fake `deps.query` and
 * validates each result against `sessionArtifactSchema` before writing
 * `__fixtures__/operator-reports.json`. So what renders here is the same bytes
 * the tool would hand the panel in production — SQL row shape through builder
 * math through the zod contract through this renderer. A drift anywhere in that
 * chain shows up in the screenshot.
 *
 * The chat column is a static transcript, deliberately: this story exists to
 * pin the ARTIFACT, and mounting `AgentSessionPanel` would drag the SSE hook,
 * the session store and a live provider into a screenshot that is supposed to
 * prove one renderer.
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ArtifactReport } from '@/lib/assistant/ui-artifacts';
import { ReportArtifact } from './ReportArtifact';
import fixtures from './__fixtures__/operator-reports.json';

interface ReportFixture {
  question: string;
  summary: string;
  artifact: ArtifactReport;
}

const REPORTS = fixtures as unknown as Record<string, ReportFixture>;

/**
 * The split the session surface uses: chat column left at its persisted default
 * width, artifact panel right. Grid, not flex percentages, so the panel cannot
 * collapse when a table is wide.
 */
function Workspace({ id }: { id: string }) {
  const fixture = REPORTS[id];
  if (!fixture) throw new Error(`missing report fixture: ${id}`);

  return (
    <div className="grid h-[900px] grid-cols-[420px_1fr] overflow-hidden rounded-xl border border-border-hairline bg-surface-canvas">
      <ChatColumn question={fixture.question} summary={fixture.summary} />
      <div className="min-h-0 overflow-y-auto p-5">
        <ReportArtifact artifact={fixture.artifact} />
      </div>
    </div>
  );
}

/** Static transcript: the operator's sentence, then what the model says back. */
function ChatColumn({ question, summary }: { question: string; summary: string }) {
  return (
    <div className="flex min-h-0 flex-col border-r border-border-hairline bg-surface-card">
      <div className="border-b border-border-hairline px-4 py-3">
        <p className="text-role-eyebrow uppercase tracking-widest text-text-faint">Ask</p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
        <div className="self-end rounded-xl bg-surface-sunken px-3 py-2">
          <p className="text-role-body text-text-default">{question}</p>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-role-eyebrow uppercase tracking-widest text-text-faint">
            Building the report
          </p>
          <p className="text-role-body text-text-default">{summary}</p>
          <p className="text-role-micro text-text-faint">
            Rendered on the panel. The numbers came straight from the query — the model was handed
            this sentence, not the table.
          </p>
        </div>
      </div>

      <div className="border-t border-border-hairline px-4 py-3">
        <div className="rounded-xl border border-border-hairline bg-surface-sunken px-3 py-2">
          <p className="text-role-caption text-text-faint">Ask the warehouse…</p>
        </div>
      </div>
    </div>
  );
}

const meta = {
  title: 'Session/Operator reports',
  component: Workspace,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Workspace>;

export default meta;
type Story = StoryObj<typeof meta>;

/** "What is Maria's packing performance today?" */
export const PackingPerformance: Story = { args: { id: 'packing-performance' } };

/** "How many boxes are left to be unboxed?" */
export const UnboxBacklog: Story = { args: { id: 'unbox-backlog' } };

/** "What is the most expensive order currently in the warehouse?" */
export const MostExpensiveOrder: Story = { args: { id: 'order-value-rank' } };

/** "What are the highest ROIs right now?" */
export const HighestRois: Story = { args: { id: 'roi-rank' } };

/** "Which staff can I delegate to attack the highest ROIs in terms of pending tasks?" */
export const DelegationPlan: Story = { args: { id: 'delegation-plan' } };
