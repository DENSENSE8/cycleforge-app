export type PackerBoxCountRow = {
  readonly packer: string;
  readonly boxesPacked: number;
};

export type PackerBoxCountReport = {
  readonly day: string;
  readonly rows: readonly PackerBoxCountRow[];
  readonly total: number;
};

export async function fetchPackerBoxCounts(day: string): Promise<PackerBoxCountReport> {
  const res = await fetch(`/api/packing/box-counts?day=${encodeURIComponent(day)}`);
  if (!res.ok) throw new Error(`box-counts ${res.status}`);
  const body = (await res.json()) as {
    ok?: boolean;
    day?: string;
    rows?: Array<{ packer: string; boxesPacked: number }>;
    total?: number;
  };
  if (!body.ok || !Array.isArray(body.rows)) throw new Error('box-counts shape');
  return {
    day: typeof body.day === 'string' ? body.day : day,
    rows: body.rows.map((r) => ({
      packer: r.packer,
      boxesPacked: Number(r.boxesPacked) || 0,
    })),
    total: typeof body.total === 'number' ? body.total : body.rows.reduce((n, r) => n + (Number(r.boxesPacked) || 0), 0),
  };
}
