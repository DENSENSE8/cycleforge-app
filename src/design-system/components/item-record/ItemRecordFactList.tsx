'use client';

import { CopyActionIcon } from '../CopyActionIcon';
import { DetailsPanelRow } from '../DetailsPanelRow';
import { ExternalLinkActionIcon } from '../ExternalLinkActionIcon';
import type { ItemRecordFact } from './item-record-types';

/**
 * Reference band under an item row — the identifiers a station ledger has no
 * column for (item numbers, marketplace SKUs, external listings).
 *
 * Each fact is a house {@link DetailsPanelRow}; copy and open-out are the DS
 * action icons, so a caller declares `copyValue` / `href` as DATA and never
 * hand-rolls a clipboard button.
 */
export function ItemRecordFactList({ facts }: { facts: ItemRecordFact[] }) {
  if (facts.length === 0) return null;
  return (
    <div className="space-y-0" data-item-record-facts>
      {facts.map((fact) => {
        const copyValue = String(fact.copyValue || '').trim();
        const href = String(fact.href || '').trim();
        const actions =
          copyValue || href ? (
            <div className="flex items-center gap-1.5">
              {href ? (
                <ExternalLinkActionIcon
                  href={href}
                  ariaLabel={fact.hrefLabel || `Open ${fact.label}`}
                  title={fact.hrefLabel || `Open ${fact.label}`}
                />
              ) : null}
              {copyValue ? (
                <CopyActionIcon value={copyValue} ariaLabel={`Copy ${fact.label}`} />
              ) : null}
            </div>
          ) : null;
        return (
          <DetailsPanelRow key={fact.id} label={fact.label} actions={actions}>
            {fact.value}
          </DetailsPanelRow>
        );
      })}
    </div>
  );
}
