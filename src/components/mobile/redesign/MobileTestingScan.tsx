'use client';

/**
 * /m/testing — the testing-orders scan, freed from the retired /m/scan pager.
 *
 * Interim host on purpose: the panel and its Recent rail are the existing
 * components, mounted under their own route so the Stack's Queues band and
 * Find can reach them. The station-harness port (tape + bottom capture) is
 * the long-tail item; this is the cutover, not the redesign.
 */

import { useState } from 'react';
import { TextField } from '@/design-system/primitives';
import { ScanTestingPanel } from '@/components/mobile/redesign/ScanTestingPanel';
import { TestingRecentPanel } from '@/components/mobile/redesign/ScanModeFeeds';

export default function MobileTestingScan() {
  const [query, setQuery] = useState('');

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-4 pt-3">
        <TextField
          label="Scan a PO label (R-####)"
          value={query}
          onChange={setQuery}
          inputMode="text"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pt-2">
        <TestingRecentPanel />
        <ScanTestingPanel query={query} />
      </div>
    </div>
  );
}
