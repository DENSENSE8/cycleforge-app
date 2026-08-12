/**
 * Guard — region host modules named in AGENTS.md still exist on disk.
 *
 * Run: node --import tsx --test src/lib/governance/region-hosts.guard.test.ts
 */

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = process.cwd();

const HOSTS = [
  'src/components/station/workbench/StationScanPaneHost.tsx',
  'src/components/dashboard/WorkbenchSheetView.tsx',
  'src/components/dashboard/workbench-shell.tsx',
  'src/components/tables/NonlinearTableHost.tsx',
  'src/components/tables/table-definition-registry.ts',
  'src/components/right-rail/RightRailHost.tsx',
  'src/design-system/components/monitor/MonitorPageShell.tsx',
  'src/lib/right-rail/frame.ts',
  'src/components/sidebar/ContextPanelLayout.tsx',
  'src/design-system/components/RouteShell.tsx',
  'src/components/ui/CopyChip.tsx',
  'src/components/ui/StackedRowIdentity.tsx',
  'src/lib/source-platform.ts',
  'src/design-system/motion/framer.ts',
  'src/lib/inventory/state-machine.ts',
  'src/lib/tenancy/db.ts',
];

describe('region / SoT hosts', () => {
  it('keeps AGENTS.md host paths on disk', () => {
    const missing = HOSTS.filter((rel) => !existsSync(join(ROOT, rel)));
    assert.deepEqual(missing, [], `missing host file(s):\n  ${missing.join('\n  ')}`);
  });
});
