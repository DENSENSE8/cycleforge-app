'use client';

/**
 * The centre of every `/search?sel=` station pane — Status band, then Items band.
 *
 * WHY THIS EXISTS
 *   Order and Receiving both painted `Status` + `Items` collapsible blocks;
 *   Unit painted a single `Unit` block of label/value rows. Same host, same
 *   collapse controller, three hand-written compositions — so a serial unit
 *   read as a spec sheet while an order read as a record, and the operator had
 *   to learn two layouts for the same question ("what is this and where is it").
 *
 * WHAT IS SHARED AND WHAT IS NOT
 *   The BANDS are the source of truth: their order, their labels, and the fact
 *   that both always exist. What goes INSIDE each band is entity-specific and
 *   always was — a receiving carton legitimately shows the order pipeline when
 *   it is linked and the carton pipeline when it is not, and a unit's status is
 *   a lifecycle face rather than a pipeline. That variation is data, not shape.
 *
 *   So callers hand in two nodes. They cannot hand in a third, reorder them, or
 *   omit one: an entity with nothing to say in a band says so inside the band,
 *   which is a different claim from not having the band at all.
 *
 * ## Bands are the station's, not this file's
 *
 * The disclosure itself is {@link StationBandStack} — the same component the
 * Unbox and Testing centres render, so `/search` gets per-band collapse, the
 * full-row accordion, and the icon-first faces without a third
 * implementation. This file supplies the two nodes and the two glyphs.
 */

import type { ReactNode } from 'react';
import { Activity, Boxes } from '@/components/Icons';
import {
  StationBandStack,
  useBandCollapse,
  type AutoCollapseController,
} from '@/components/station/collapse';

export function SearchEntityCentre({
  entity,
  status,
  items,
  collapse,
}: {
  /**
   * UI entity type — keys the test ids per surface. Every entity `/search` can
   * open belongs here: a type missing from this union is a surface that has
   * quietly grown its own layout, which is the fork this component exists to
   * make impossible.
   */
  entity: 'order' | 'unit' | 'receiving' | 'repair' | 'fba' | 'sku';
  /** Whatever states where this record IS: a pipeline, a lifecycle face. */
  status: ReactNode;
  /** The record's contents, through the shared item face. */
  items: ReactNode;
  collapse: AutoCollapseController;
}) {
  // Layered on the centre-wide controller the host already owns: the scroll /
  // composer rules still move both bands together, but a band the operator
  // closes BY HAND now closes alone. Before this, both blocks read the one
  // `collapse.collapsed` flag, so shutting Status shut Items with it.
  const bands = useBandCollapse(collapse);

  return (
    <StationBandStack
      className="flex min-h-0 flex-1 flex-col gap-3"
      face="label"
      collapse={bands}
      bands={[
        {
          id: 'status',
          label: 'Status',
          icon: Activity,
          body: status,
          testId: `search-${entity}-status-block`,
        },
        {
          id: 'items',
          label: 'Items',
          icon: Boxes,
          body: items,
          testId: `search-${entity}-items-block`,
        },
      ]}
    />
  );
}
