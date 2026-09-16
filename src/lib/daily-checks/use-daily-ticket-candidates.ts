'use client';

/**
 * Ticket candidates for the Daily chip slider.
 *
 * Lives in `lib` beside the other daily-check hooks so `/m` surfaces can consume
 * it without reaching into a desktop feature dir.
 *
 * `placeholderData: keepPreviousData` is LOAD-BEARING: the operator types a
 * ticket number one digit at a time and every digit is a new query key. Without
 * it the chip row unmounts to empty between keystrokes and the row the thumb was
 * travelling toward jumps out from under it.
 *
 * Failure never reaches render as a throw — the picker is one control inside a
 * checklist sheet, so a dead helpdesk degrades the row, not the sheet.
 */

import { keepPreviousData, useQuery } from '@tanstack/react-query';

export interface DailyTicketOption {
  id: number;
  subject: string | null;
  status: string;
}

export interface DailyTicketCandidates {
  options: DailyTicketOption[];
  isLoading: boolean;
  isError: boolean;
  /** True when the org has no helpdesk connected — the picker renders a quiet note, never an error. */
  notConfigured: boolean;
}

const QUERY_KEY_PREFIX = 'daily-check-ticket-candidates';

const NO_OPTIONS: DailyTicketOption[] = [];

interface CandidatesPayload {
  tickets?: DailyTicketOption[];
  notConfigured?: boolean;
}

async function fetchCandidates(
  query: string,
): Promise<{ options: DailyTicketOption[]; notConfigured: boolean }> {
  const res = await fetch(
    `/api/daily-checks/ticket-candidates?query=${encodeURIComponent(query)}`,
    { cache: 'no-store' },
  );
  if (!res.ok) throw new Error(`ticket candidates failed (${res.status})`);
  const body = (await res.json()) as CandidatesPayload;
  return {
    options: body.tickets ?? NO_OPTIONS,
    notConfigured: body.notConfigured === true,
  };
}

export function useDailyTicketCandidates(query: string): DailyTicketCandidates {
  // Key on the TRIMMED text: leading/trailing whitespace from a phone keyboard
  // is not a different search, and keying on it would refetch for a space.
  const trimmed = query.trim();

  const { data, isLoading, isError } = useQuery({
    queryKey: [QUERY_KEY_PREFIX, trimmed],
    queryFn: () => fetchCandidates(trimmed),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  return {
    options: data?.options ?? NO_OPTIONS,
    isLoading,
    isError,
    notConfigured: data?.notConfigured ?? false,
  };
}
