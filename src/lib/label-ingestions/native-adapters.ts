import { safeRandomUUID } from '@/lib/safe-uuid';
import type { BrowserFixtureSession } from './browser-fixture-authority';

export interface LabelSourceCapabilities { folderWatch: boolean; filePicker: boolean; secureEnrollment: boolean; }
export interface LabelObservation { observationId: string; ingestionId: number; state: string; }
export interface LabelSourceSelection { accepted: boolean; ingestionId?: number; replayed?: boolean; }
export type Unsubscribe = () => void;

export interface NativeLabelSource {
  capabilities(): Promise<LabelSourceCapabilities>;
  chooseSource(): Promise<LabelSourceSelection>;
  observe(onObservation: (event: LabelObservation) => void): Promise<Unsubscribe>;
  retry(observationId: string): Promise<void>;
}

export interface PrintCapabilities { printerList: boolean; silentPrint: boolean; browserSimulation: boolean; }
export interface PrinterDescriptor { id: string; displayName: string; }
export interface ServerMintedPrintRequest { ticket: string; documentId: number; printerId: string; copies: number; idempotencyKey: string; }
export interface PrintReceipt { requestId: string; state: 'QUEUED' | 'COMPLETED'; simulated: boolean; }
export interface NativePrintService { capabilities(): Promise<PrintCapabilities>; listPrinters(): Promise<PrinterDescriptor[]>; print(request: ServerMintedPrintRequest): Promise<PrintReceipt>; }

interface BrowserFetchResponse { ok: boolean; status: number; json(): Promise<{ data?: { id?: number }; replayed?: boolean; error?: { message?: string } }>; }
type BrowserFetch = (input: string, init: RequestInit) => Promise<BrowserFetchResponse>;

/** Browser transport only: it has no parser, resolver, database, or apply imports. */
export class BrowserFixtureLabelSource implements NativeLabelSource {
  private listeners = new Set<(event: LabelObservation) => void>();
  constructor(
    // Opaque server authority is intentionally required at construction.
    private readonly _session: BrowserFixtureSession,
    private readonly options: { endpoint?: string; fetcher?: BrowserFetch; pickFile: () => Promise<File | null>; now?: () => Date; uuid?: () => string } = { pickFile: async () => null },
  ) {}

  async capabilities(): Promise<LabelSourceCapabilities> { return { folderWatch: false, filePicker: true, secureEnrollment: false }; }
  async chooseSource(): Promise<LabelSourceSelection> {
    const file = await this.options.pickFile();
    if (!file) return { accepted: false };
    if (file.type && file.type !== 'application/pdf') throw new Error('Only PDF files may be uploaded.');
    const bytes = await file.arrayBuffer();
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    const sha256 = [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    const body = new FormData();
    body.set('file', file); body.set('sha256', sha256); body.set('clientEventId', this.options.uuid?.() ?? safeRandomUUID()); body.set('observedAt', (this.options.now?.() ?? new Date()).toISOString());
    const fetcher = this.options.fetcher ?? ((input: string, init: RequestInit) => globalThis.fetch(input, init));
    const response = await fetcher(this.options.endpoint ?? '/api/v1/label-ingestions', { method: 'POST', body, credentials: 'same-origin' });
    const payload = await response.json();
    if (!response.ok || !payload.data?.id) throw new Error(payload.error?.message ?? `Label upload failed (${response.status}).`);
    const event = { observationId: String(payload.data.id), ingestionId: payload.data.id, state: payload.replayed ? 'DUPLICATE' : 'SUBMITTED' };
    this.listeners.forEach((listener) => listener(event));
    return { accepted: true, ingestionId: payload.data.id, replayed: payload.replayed === true };
  }
  async observe(onObservation: (event: LabelObservation) => void): Promise<Unsubscribe> { this.listeners.add(onObservation); return () => this.listeners.delete(onObservation); }
  async retry(observationId: string): Promise<void> { if (!/^\d+$/.test(observationId)) throw new Error('Invalid ingestion observation.'); const fetcher = this.options.fetcher ?? ((input: string, init: RequestInit) => globalThis.fetch(input, init)); const response = await fetcher(`${this.options.endpoint ?? '/api/v1/label-ingestions'}/${observationId}/retry`, { method: 'POST', credentials: 'same-origin' }); if (!response.ok) { const payload = await response.json(); throw new Error(payload.error?.message ?? 'Retry failed.'); } }
}

/** Test-mode browser substitute. It explicitly reports simulated output. */
export class BrowserPrintRecorder implements NativePrintService {
  readonly requests: ServerMintedPrintRequest[] = [];
  constructor(private readonly _session: BrowserFixtureSession) {}
  async capabilities(): Promise<PrintCapabilities> { return { printerList: true, silentPrint: false, browserSimulation: true }; }
  async listPrinters(): Promise<PrinterDescriptor[]> { return [{ id: 'browser-recorder', displayName: 'Browser print recorder (simulated)' }]; }
  async print(request: ServerMintedPrintRequest): Promise<PrintReceipt> { if (!request.ticket || !request.idempotencyKey || request.documentId <= 0 || request.copies < 1) throw new Error('A server-minted print request is required.'); this.requests.push({ ...request }); return { requestId: request.idempotencyKey, state: 'COMPLETED', simulated: true }; }
}
