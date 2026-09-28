/** The two app calls the hub makes: serial → unit, and readings upload. */

export function createApi({ baseUrl, sid, timeoutMs = 15000 }) {
  const headers = { accept: 'application/json', cookie: `cf_sid=${sid}` };

  async function call(method, pathname, body) {
    const res = await fetch(new URL(pathname, baseUrl), {
      method,
      headers: body ? { ...headers, 'content-type': 'application/json' } : headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const reason = json?.error ?? json?.message ?? res.statusText;
      throw new Error(`${method} ${pathname} → ${res.status} ${typeof reason === 'string' ? reason : JSON.stringify(reason)}`);
    }
    return json;
  }

  return {
    /** First serial that resolves to a serial_units row → { unitId, serial, sku }, else null. */
    async lookupUnit(serials) {
      for (const serial of serials) {
        const json = await call('GET', `/api/serial-units/lookup?serial=${encodeURIComponent(serial)}`);
        if (json?.found && json.unit?.id) return { unitId: json.unit.id, serial, sku: json.unit.sku ?? null };
      }
      return null;
    },

    /** The open session on the unit this hub belongs to, else the caller's open one. */
    async openSessionId(unitId, hubId) {
      const json = await call('GET', `/api/qc/sessions?unitId=${unitId}`).catch(() => null);
      const data = json?.data;
      if (!data) return null;
      const hubSession = data.sessions?.find((s) => s.endedAt == null && s.hubDeviceId === hubId);
      return (hubSession ?? data.open)?.id ?? null;
    },

    async postReadings(readings) {
      const json = await call('POST', '/api/qc/readings', { readings });
      return json.data;
    },
  };
}
