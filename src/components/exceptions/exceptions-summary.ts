import type { RecordLedgerSummary } from '@/design-system/components/record-ledger/RecordLedgerSummary';
import {
  EXCEPTION_DOMAINS,
  EXCEPTION_DOMAIN_LABEL,
  EXCEPTION_KINDS,
  EXCEPTION_KIND_SPEC,
  type ExceptionDomain,
  type ExceptionKind,
  type ExceptionListResponse,
} from '@/lib/exceptions/types';

/** The lock a lane door puts on the one list (`ExceptionsDesk`). */
export interface ExceptionsDeskLock {
  domain?: ExceptionDomain;
  kind?: ExceptionKind;
}

/**
 * Totals from the list's own counts (the same predicate as its rows) over
 * only the kinds this list covers: the open total, then per domain when it
 * spans several, else per kind when it spans several.
 */
export function exceptionsSummary(
  counts: ExceptionListResponse['counts'] | undefined,
  lock: ExceptionsDeskLock | undefined,
  kind: ExceptionKind | undefined,
  domain: ExceptionDomain | undefined,
): RecordLedgerSummary {
  const kinds = EXCEPTION_KINDS.filter(
    (candidate) =>
      counts?.[candidate] !== undefined &&
      (!kind || candidate === kind) &&
      (!domain || EXCEPTION_KIND_SPEC[candidate].domain === domain),
  );
  const sum = (subset: readonly ExceptionKind[]) => subset.reduce((total, candidate) => total + (counts?.[candidate] ?? 0), 0);
  const domains = EXCEPTION_DOMAINS.filter((candidate) => kinds.some((k) => EXCEPTION_KIND_SPEC[k].domain === candidate));
  const open = sum(kinds);
  const breakdown =
    domains.length > 1
      ? domains.map((candidate) => ({
          label: EXCEPTION_DOMAIN_LABEL[candidate],
          value: sum(kinds.filter((k) => EXCEPTION_KIND_SPEC[k].domain === candidate)),
          toolbar: true,
        }))
      : kinds.length > 1
        ? kinds.map((candidate) => ({ label: EXCEPTION_KIND_SPEC[candidate].label, value: counts?.[candidate] ?? 0, toolbar: true }))
        : [];
  return {
    title: lock?.kind ? EXCEPTION_KIND_SPEC[lock.kind].label : lock?.domain ? EXCEPTION_DOMAIN_LABEL[lock.domain] : 'Exceptions',
    facts: [{ label: 'Open', value: open, warn: open > 0 }, ...breakdown],
    note: 'Open one to resolve it here.',
  };
}
