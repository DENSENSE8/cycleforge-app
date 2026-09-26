/** operations-history-flags — client-safe rollout flag for the Operations History browse region… */
export function isOperationsHistoryBrowseEnabled(): boolean {
  const v = (process.env.NEXT_PUBLIC_OPERATIONS_HISTORY_BROWSE ?? '').trim().toLowerCase();
  return v !== 'false' && v !== '0' && v !== 'off' && v !== 'no';
}
