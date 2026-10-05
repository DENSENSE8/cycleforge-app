'use client';

import { useState } from 'react';
import { Smartphone } from '@/components/Icons';
import { Button, TextField } from '@/design-system/primitives';
import type { PrepackSerialEntryProps } from '@/features/prepack/serial-entry';

/** Desk serial entry: type the serial (or let a wedge scanner type it), or hand the scan to the phone. No camera here. */
export function PrepackSerialField({ onSerial, busy, phone }: PrepackSerialEntryProps) {
  const [serial, setSerial] = useState('');
  return (
    <div className="space-y-3">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const value = serial.trim();
          if (!value || busy) return;
          onSerial(value);
          setSerial('');
        }}
      >
        <TextField
          label="Serial number"
          value={serial}
          onChange={setSerial}
          mono
          autoFocus
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="enter"
          data-testid="prepack-serial-input"
        />
      </form>
      <Button
        variant="secondary"
        size="lg"
        className="w-full"
        icon={<Smartphone />}
        onClick={phone.send}
        disabled={!phone.available || phone.waiting}
        loading={phone.sending}
        data-testid="prepack-serial-phone"
      >
        Scan with phone
      </Button>
      {phone.waiting ? (
        <div className="flex items-center gap-2 rounded-mode-control border border-mode-rule bg-surface-card p-3 text-role-caption text-text-muted">
          <span className="min-w-0 flex-1">The phone is scanning — each serial it sends joins this package.</span>
          <Button variant="ghost" size="sm" onClick={phone.stop} data-testid="prepack-serial-phone-done">
            Done
          </Button>
        </div>
      ) : null}
    </div>
  );
}
