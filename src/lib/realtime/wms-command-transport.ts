/** Client transport choice for WMS execution commands. */
export const WMS_COMMAND_HTTP_PATH = '/api/wms/commands';

type WmsCommandTransport = 'socket' | 'http';

export function chooseWmsTransport(link: { socketOpen: boolean; hasTicket: boolean }): WmsCommandTransport {
  return link.socketOpen && link.hasTicket ? 'socket' : 'http';
}

export async function postWmsCommand<Receipt>(
  command: { commandId: string },
  fetchImpl: typeof fetch = fetch,
): Promise<Receipt> {
  let response: Response;
  try {
    response = await fetchImpl(WMS_COMMAND_HTTP_PATH, {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
    });
  } catch {
    throw new Error('Network unavailable; retrying is safe.');
  }
  const body = await response.json().catch(() => null) as { error?: unknown } | null;
  if (!response.ok) {
    const message = typeof body?.error === 'string' && body.error.trim()
      ? body.error
      : `Command failed (${response.status}).`;
    throw new Error(message);
  }
  return body as Receipt;
}
