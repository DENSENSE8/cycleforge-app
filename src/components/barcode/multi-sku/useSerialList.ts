'use client';

import { useCallback, useState } from 'react';

interface UseSerialList {
  snInput: string;
  setSnInput: React.Dispatch<React.SetStateAction<string>>;
  serialNumbers: string[];
  setSerialNumbers: React.Dispatch<React.SetStateAction<string[]>>;
  /** Parse a comma-separated string into the serial list (free-text edit). */
  handleSnInputChange: (value: string) => void;
  /** Append one scanned/typed serial (Enter path). */
  handleSnAdd: (sn: string) => void;
  /** Remove a single serial by value. */
  removeSerial: (target: string) => void;
  /** Clear both the raw input and the parsed list. */
  resetSerials: () => void;
}

/** Owns the serial-number list and its mirrored comma-separated text input. */
export function useSerialList(): UseSerialList {
  const [snInput, setSnInput] = useState('');
  const [serialNumbers, setSerialNumbers] = useState<string[]>([]);

  const handleSnInputChange = useCallback((value: string) => {
    setSnInput(value);
    setSerialNumbers(
      value
        .split(',')
        .map((s) => s.trim())
        .filter((s) => !!s),
    );
  }, []);

  const handleSnAdd = useCallback((sn: string) => {
    const trimmed = sn.trim();
    if (!trimmed) return;
    setSerialNumbers((prev) => {
      const next = [...prev, trimmed];
      setSnInput(next.join(', '));
      return next;
    });
  }, []);

  const removeSerial = useCallback((target: string) => {
    setSerialNumbers((prev) => {
      const next = prev.filter((s) => s !== target);
      setSnInput(next.join(', '));
      return next;
    });
  }, []);

  const resetSerials = useCallback(() => {
    setSnInput('');
    setSerialNumbers([]);
  }, []);

  return {
    snInput,
    setSnInput,
    serialNumbers,
    setSerialNumbers,
    handleSnInputChange,
    handleSnAdd,
    removeSerial,
    resetSerials,
  };
}
