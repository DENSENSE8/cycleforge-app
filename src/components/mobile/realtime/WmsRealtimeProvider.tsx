'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { wmsTicketRefreshDelayMs } from '@/lib/realtime/wms-ticket-lifetime';

export const WMS_SEND_EVENT = 'cycleforge:wms:send';

type WmsResult = {
  type: 'wms.result';
  signalId: string;
  commandId: string;
  completedAt: string;
  result: {
    phase: 'committed' | 'rejected';
    selectedSlotId: string | null;
    commit: { status: 'committed' | 'replayed'; toSlot: string } | null;
    failure: { code: string; message: string } | null;
  };
};

export type WmsExecutionCommand = {
  v: 1;
  commandId: string;
  organizationId: string;
  staffId: number;
  issuedAt: string;
} & (
  | {
      name: 'pick.confirm';
      input: {
        sessionId: number;
        allocationId: number;
        toteScan: string;
        completeSession: boolean;
      };
    }
  | {
      name: 'pick.short';
      input: {
        sessionId: number;
        allocationId: number;
        pickedQty: number;
        plannedQty: number;
        reason: 'NOT_FOUND_IN_BIN' | 'DAMAGED' | 'WRONG_CONDITION' | 'MISLABELED' | 'INSUFFICIENT_STOCK' | 'OTHER';
        note: string;
      };
    }
  | {
      name: 'putaway.adjust';
      input: {
        barcode: string;
        sku: string;
        direction: 'put' | 'take';
        qty: number;
        reason: string;
        reasonCodeId: number | null;
        notes: string | null;
      };
    }
  | {
      name: 'pack.verify';
      input: {
        packerLogId: number;
        outcome: 'VERIFIED' | 'ERROR_MISSING_TRACKING' | 'ERROR_OCR_FAILED';
        detectedTracking: string | null;
        detectedOrderId: string | null;
        ocrConfidence: number | null;
        meta: Record<string, unknown> | null;
      };
    }
);

export type WmsExecutionCommandReceipt = {
  commandId: string;
  name: WmsExecutionCommand['name'];
  status: 'committed' | 'replayed';
  completedAt: string;
  data: Record<string, unknown>;
};

type WmsServerMessage =
  | { type: 'wms.hello' }
  | { type: 'wms.accepted'; signalId: string; commandId: string }
  | { type: 'wms.command.accepted'; commandId: string }
  | { type: 'wms.command.result'; commandId: string; receipt: WmsExecutionCommandReceipt }
  | WmsResult
  | { type: 'wms.error'; signalId: string | null; commandId: string | null; message: string };

type State = {
  status: 'connecting' | 'connected' | 'accepted' | 'committed' | 'rejected' | 'error';
  latest: WmsResult | null;
  message: string | null;
  send(payload: unknown): boolean;
  execute(command: WmsExecutionCommand): Promise<WmsExecutionCommandReceipt>;
};

const WmsRealtimeContext = createContext<State | null>(null);

function socketUrl(): string {
  const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${scheme}//${window.location.host}/__wms/attach`;
}

function deviceId(): string {
  const key = 'cycleforge:wms-device-id';
  const existing = window.sessionStorage.getItem(key);
  if (existing) return existing;
  const created = `mobile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  window.sessionStorage.setItem(key, created);
  return created;
}

export function WmsRealtimeProvider({ children }: { children: ReactNode }) {
  const socketRef = useRef<WebSocket | null>(null);
  const ticketRef = useRef<{ token: string; deviceId: string } | null>(null);
  const retryRef = useRef<number | null>(null);
  const ticketRefreshRef = useRef<number | null>(null);
  const pendingCommandsRef = useRef(new Map<string, {
    resolve: (receipt: WmsExecutionCommandReceipt) => void;
    reject: (error: Error) => void;
  }>());
  const stoppedRef = useRef(false);
  const [status, setStatus] = useState<State['status']>('connecting');
  const [latest, setLatest] = useState<WmsResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const send = useCallback((payload: unknown): boolean => {
    const socket = socketRef.current;
    const ticket = ticketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN || !ticket) return false;
    socket.send(JSON.stringify({
      type: 'wms.signal',
      token: ticket.token,
      deviceId: ticket.deviceId,
      payload,
    }));
    return true;
  }, []);

  const execute = useCallback((command: WmsExecutionCommand): Promise<WmsExecutionCommandReceipt> => {
    const socket = socketRef.current;
    const ticket = ticketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN || !ticket) {
      return Promise.reject(new Error('Realtime execution connection is not ready.'));
    }
    if (pendingCommandsRef.current.has(command.commandId)) {
      return Promise.reject(new Error(`Command ${command.commandId} is already pending.`));
    }
    return new Promise((resolve, reject) => {
      pendingCommandsRef.current.set(command.commandId, { resolve, reject });
      try {
        socket.send(JSON.stringify({
          type: 'wms.command',
          token: ticket.token,
          deviceId: ticket.deviceId,
          command,
        }));
      } catch (error) {
        pendingCommandsRef.current.delete(command.commandId);
        reject(error instanceof Error ? error : new Error('Unable to send WMS command.'));
      }
    });
  }, []);

  useEffect(() => {
    stoppedRef.current = false;
    let attempt = 0;

    const connect = async () => {
      if (stoppedRef.current) return;
      setStatus('connecting');
      try {
        const id = deviceId();
        const response = await fetch(`/api/realtime/wms-ticket?deviceId=${encodeURIComponent(id)}`, {
          credentials: 'include',
          cache: 'no-store',
        });
        if (!response.ok) throw new Error('Realtime ticket unavailable');
        const ticket = await response.json() as { token: string; deviceId: string; expiresAt: string };
        ticketRef.current = ticket;

        const socket = new WebSocket(socketUrl());
        socketRef.current = socket;
        socket.onopen = () => {
          attempt = 0;
          setStatus('connected');
          setMessage(null);
          if (ticketRefreshRef.current != null) window.clearTimeout(ticketRefreshRef.current);
          ticketRefreshRef.current = window.setTimeout(() => {
            // Closing deliberately re-enters the normal reconnect path, which
            // fetches a fresh ticket before opening the replacement socket.
            socket.close(4001, 'ticket refresh');
          }, wmsTicketRefreshDelayMs(ticket.expiresAt));
        };
        socket.onmessage = (event) => {
          let next: WmsServerMessage;
          try {
            next = JSON.parse(String(event.data)) as WmsServerMessage;
          } catch {
            return;
          }
          if (next.type === 'wms.accepted') {
            setStatus('accepted');
            setMessage('Checking capacity');
          } else if (next.type === 'wms.result') {
            setLatest(next);
            setStatus(next.result.phase === 'committed' ? 'committed' : 'rejected');
            setMessage(next.result.failure?.message ?? null);
          } else if (next.type === 'wms.command.accepted') {
            setStatus('accepted');
            setMessage('Committing action');
          } else if (next.type === 'wms.command.result') {
            const pending = pendingCommandsRef.current.get(next.commandId);
            pendingCommandsRef.current.delete(next.commandId);
            pending?.resolve(next.receipt);
            setStatus('committed');
            setMessage(null);
          } else if (next.type === 'wms.error') {
            if (next.commandId) {
              const pending = pendingCommandsRef.current.get(next.commandId);
              pendingCommandsRef.current.delete(next.commandId);
              pending?.reject(new Error(next.message));
            }
            setStatus('error');
            setMessage(next.message);
          }
        };
        socket.onclose = () => {
          if (stoppedRef.current) return;
          if (ticketRefreshRef.current != null) {
            window.clearTimeout(ticketRefreshRef.current);
            ticketRefreshRef.current = null;
          }
          socketRef.current = null;
          ticketRef.current = null;
          for (const pending of pendingCommandsRef.current.values()) {
            pending.reject(new Error('Realtime connection interrupted; retrying is safe.'));
          }
          pendingCommandsRef.current.clear();
          const delay = Math.min(5_000, 250 * (2 ** attempt));
          attempt += 1;
          retryRef.current = window.setTimeout(() => void connect(), delay);
        };
      } catch (error) {
        setStatus('error');
        setMessage(error instanceof Error ? error.message : 'Realtime connection failed');
        const delay = Math.min(5_000, 250 * (2 ** attempt));
        attempt += 1;
        retryRef.current = window.setTimeout(() => void connect(), delay);
      }
    };

    void connect();
    return () => {
      stoppedRef.current = true;
      if (retryRef.current != null) window.clearTimeout(retryRef.current);
      if (ticketRefreshRef.current != null) window.clearTimeout(ticketRefreshRef.current);
      socketRef.current?.close();
      socketRef.current = null;
      ticketRef.current = null;
      for (const pending of pendingCommandsRef.current.values()) {
        pending.reject(new Error('Realtime execution shell closed.'));
      }
      pendingCommandsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const listener = (event: Event) => {
      const payload = (event as CustomEvent<unknown>).detail;
      send(payload);
    };
    window.addEventListener(WMS_SEND_EVENT, listener);
    return () => window.removeEventListener(WMS_SEND_EVENT, listener);
  }, [send]);

  const value = useMemo<State>(
    () => ({ status, latest, message, send, execute }),
    [execute, latest, message, send, status],
  );
  return <WmsRealtimeContext.Provider value={value}>{children}</WmsRealtimeContext.Provider>;
}

export function useWmsRealtime(): State {
  const value = useContext(WmsRealtimeContext);
  if (!value) throw new Error('useWmsRealtime must be used inside WmsRealtimeProvider');
  return value;
}

export function dispatchWmsSignal(payload: unknown): void {
  window.dispatchEvent(new CustomEvent(WMS_SEND_EVENT, { detail: payload }));
}
