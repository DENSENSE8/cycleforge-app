'use client';

/**
 * useVoiceDictation — phone microphone → text for the companion composer.
 *
 * Server-first: `MediaRecorder` captures a burst, `POST /api/ai/transcribe`
 * runs it through the org's provider chain. When the org has no speech
 * provider (503) the hook flips to the browser's own `SpeechRecognition` for
 * the rest of the session, where the browser has one (Chrome Android; iOS
 * Safari is unreliable — which is why the server path is first).
 *
 * `onInterim` fires only on the browser path (server transcription has no
 * partials). `onFinal` fires once per stop with the whole transcript.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export type DictationState = 'idle' | 'listening' | 'transcribing' | 'unsupported' | 'error';

interface DictationHandlers {
  onInterim?: (text: string) => void;
  onFinal: (text: string) => void;
}

interface BrowserRecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}

interface BrowserRecognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<BrowserRecognitionResult> }) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type BrowserRecognitionCtor = new () => BrowserRecognition;

/** The prefixed constructor is not in lib.dom — read it by name, no cast. */
function browserRecognitionCtor(): BrowserRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const ctor: unknown =
    Reflect.get(window, 'SpeechRecognition') ?? Reflect.get(window, 'webkitSpeechRecognition');
  return typeof ctor === 'function' ? (ctor as BrowserRecognitionCtor) : null;
}

function pickMime(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const m of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return '';
}

export function useVoiceDictation({ onInterim, onFinal }: DictationHandlers) {
  const [state, setState] = useState<DictationState>('idle');
  const [error, setError] = useState<string | null>(null);
  const handlersRef = useRef({ onInterim, onFinal });
  handlersRef.current = { onInterim, onFinal };

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<BrowserRecognition | null>(null);
  /** Flipped once the server said 503 — browser path for the rest of the session. */
  const useBrowserRef = useRef(false);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      try { recorderRef.current?.stop(); } catch {}
      streamRef.current?.getTracks().forEach((t) => t.stop());
      try { recognitionRef.current?.abort(); } catch {}
    };
  }, []);

  const supported =
    typeof window !== 'undefined' &&
    ((typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia) ||
      browserRecognitionCtor() !== null);

  const startBrowser = useCallback((): boolean => {
    const Ctor = browserRecognitionCtor();
    if (!Ctor) return false;
    const rec = new Ctor();
    rec.lang = typeof navigator !== 'undefined' ? navigator.language || 'en-US' : 'en-US';
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = '';
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      handlersRef.current.onInterim?.((finalText + interim).trim());
    };
    rec.onerror = (e) => {
      if (!aliveRef.current) return;
      setError(e?.error || 'Dictation failed');
      setState('error');
    };
    rec.onend = () => {
      recognitionRef.current = null;
      if (!aliveRef.current) return;
      const text = finalText.trim();
      if (text) handlersRef.current.onFinal(text);
      setState((s) => (s === 'error' ? s : 'idle'));
    };
    recognitionRef.current = rec;
    rec.start();
    setState('listening');
    return true;
  }, []);

  const transcribeBlob = useCallback(async (blob: Blob) => {
    setState('transcribing');
    const form = new FormData();
    const ext = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm';
    form.append('audio', blob, `dictation.${ext}`);
    try {
      const res = await fetch('/api/ai/transcribe', { method: 'POST', body: form, credentials: 'include' });
      if (!aliveRef.current) return;
      if (res.status === 503) {
        // No org speech provider — remember, and tell the operator once.
        useBrowserRef.current = true;
        if (browserRecognitionCtor()) {
          setError('No speech provider — using your phone’s built-in dictation next time.');
        } else {
          setError('No speech provider configured. Ask an admin to connect OpenAI.');
        }
        setState('error');
        return;
      }
      if (!res.ok) {
        setError(`Transcription failed (${res.status})`);
        setState('error');
        return;
      }
      const json = (await res.json()) as { text?: string };
      const text = (json.text || '').trim();
      if (text) handlersRef.current.onFinal(text);
      setState('idle');
    } catch (e) {
      if (!aliveRef.current) return;
      setError(e instanceof Error ? e.message : 'Transcription failed');
      setState('error');
    }
  }, []);

  const startServer = useCallback(async (): Promise<boolean> => {
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) return false;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (!aliveRef.current) {
      stream.getTracks().forEach((t) => t.stop());
      return true;
    }
    streamRef.current = stream;
    const mime = pickMime();
    const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    chunksRef.current = [];
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      recorderRef.current = null;
      const blob = new Blob(chunksRef.current, { type: rec.mimeType || mime || 'audio/webm' });
      chunksRef.current = [];
      if (blob.size === 0) {
        if (aliveRef.current) setState('idle');
        return;
      }
      void transcribeBlob(blob);
    };
    recorderRef.current = rec;
    rec.start();
    setState('listening');
    return true;
  }, [transcribeBlob]);

  const start = useCallback(async () => {
    setError(null);
    if (!supported) {
      setState('unsupported');
      return;
    }
    try {
      if (useBrowserRef.current && startBrowser()) return;
      if (await startServer()) return;
      if (startBrowser()) return;
      setState('unsupported');
    } catch (e) {
      if (!aliveRef.current) return;
      setError(e instanceof Error ? e.message : 'Microphone unavailable');
      setState('error');
    }
  }, [startBrowser, startServer, supported]);

  const stop = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
      return;
    }
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  }, []);

  const toggle = useCallback(() => {
    if (state === 'listening') stop();
    else if (state !== 'transcribing') void start();
  }, [start, state, stop]);

  return { state, error, supported, start, stop, toggle };
}
