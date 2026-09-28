'use client';

/**
 * Team logic for a new sales order — shared by the desk and phone faces.
 * Every line starts from its listing → staff rule (`/api/orders/intake/assignees`,
 * the same matcher the import automation runs), shown as "rule". A manual
 * choice is an exception for THIS order: a later rule refresh never overwrites it.
 */

import { useEffect, useRef, useState } from 'react';
import type { IntakeLine } from '@/lib/orders/intake/intake-model';

export type AssigneePick = { id: number; name: string; source: 'rule' | 'manual'; via?: 'primary' | 'backup' };

export type LineAssignment = {
  picker: AssigneePick | null;
  packer: AssigneePick | null;
  rule: { id: number; name: string } | null;
};

export type Lane = 'picker' | 'packer';
export const LANE_LABEL: Record<Lane, string> = { picker: 'Pick', packer: 'Pack' };

/** The provenance tag on an assignee chip — the same words on the desk and the phone. */
export function assigneeSourceLabel(pick: AssigneePick): string {
  return pick.source === 'manual' ? 'changed' : pick.via === 'backup' ? 'rule · backup' : 'rule';
}

/** Which listing→staff rule set a line's defaults. */
export function lineRuleLabel(assignment: LineAssignment | undefined): string {
  return assignment?.rule ? `Rule: ${assignment.rule.name}` : 'No rule for this product';
}

export interface RuleAssignments {
  byKey: Record<string, LineAssignment>;
  setLane: (keys: readonly string[], lane: Lane, id: number | null, name: string | null) => void;
}

/** Fetch rule defaults for the cart; keeps every manual choice. */
export function useRuleAssignments(lines: readonly IntakeLine[], channel: string): RuleAssignments {
  const [byKey, setByKey] = useState<Record<string, LineAssignment>>({});
  const signature = lines.map((l) => `${l.key}:${l.skuCatalogId ?? ''}:${l.sku}:${l.itemNumber}`).join('|');
  const linesRef = useRef(lines);
  linesRef.current = lines;

  useEffect(() => {
    const current = linesRef.current;
    if (current.length === 0) return;
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch('/api/orders/intake/assignees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        signal: ctrl.signal,
        body: JSON.stringify({
          channel,
          lines: current.map((l) => ({ skuCatalogId: l.skuCatalogId, sku: l.sku || null, itemNumber: l.itemNumber || null })),
        }),
      })
        .then((res) => res.json())
        .then((data: { results?: Array<{ rule: LineAssignment['rule']; picker: { id: number; name: string; via: 'primary' | 'backup' } | null; packer: { id: number; name: string; via: 'primary' | 'backup' } | null }> }) => {
          const results = data.results ?? [];
          setByKey((prev) => {
            const next: Record<string, LineAssignment> = {};
            current.forEach((line, i) => {
              const r = results[i];
              const was = prev[line.key];
              const fromRule = (p: { id: number; name: string; via: 'primary' | 'backup' } | null | undefined): AssigneePick | null =>
                p ? { id: p.id, name: p.name, via: p.via, source: 'rule' } : null;
              next[line.key] = {
                rule: r?.rule ?? null,
                picker: was?.picker?.source === 'manual' ? was.picker : fromRule(r?.picker) ?? was?.picker ?? null,
                packer: was?.packer?.source === 'manual' ? was.packer : fromRule(r?.packer) ?? was?.packer ?? null,
              };
            });
            return next;
          });
        })
        .catch(() => {});
    }, 200);
    return () => {
      ctrl.abort();
      window.clearTimeout(timer);
    };
  }, [signature, channel]);

  const setLane = (keys: readonly string[], lane: Lane, id: number | null, name: string | null) =>
    setByKey((prev) => {
      const next = { ...prev };
      for (const key of keys) {
        const was = next[key] ?? { picker: null, packer: null, rule: null };
        next[key] = { ...was, [lane]: id == null ? null : { id, name: name ?? `Staff ${id}`, source: 'manual' } };
      }
      return next;
    });

  return { byKey, setLane };
}

/** Write each line's chosen picker / packer onto its saved order row (`/api/orders/assign`). */
export async function commitAssignments(
  lines: readonly IntakeLine[],
  orderIds: readonly number[],
  byKey: Record<string, LineAssignment>,
): Promise<boolean> {
  // Lines sharing the same pair go in one request.
  const groups = new Map<string, { pickerId: number | undefined; packerId: number | undefined; orderIds: number[] }>();
  lines.forEach((line, i) => {
    const orderId = orderIds[i];
    const a = byKey[line.key];
    if (orderId == null || !a || (!a.picker && !a.packer)) return;
    const key = `${a.picker?.id ?? ''}:${a.packer?.id ?? ''}`;
    const group = groups.get(key) ?? { pickerId: a.picker?.id, packerId: a.packer?.id, orderIds: [] };
    group.orderIds.push(orderId);
    groups.set(key, group);
  });
  const results = await Promise.all(
    [...groups.values()].map((g) =>
      fetch('/api/orders/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ orderIds: g.orderIds, pickerId: g.pickerId, packerId: g.packerId }),
      }).then((r) => r.ok),
    ),
  );
  return results.every(Boolean);
}
