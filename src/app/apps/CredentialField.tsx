'use client';

import type { CredentialFieldDef } from '@/lib/integrations/credential-form-defs';
import { FIELD_INPUT_CLS } from './form-styles';

interface CredentialFieldProps {
  def: CredentialFieldDef;
  value: string;
  error?: string;
  configuredHint?: string;
  onChange: (value: string) => void;
}

export function CredentialField({ def, value, error, configuredHint, onChange }: CredentialFieldProps) {
  const placeholder = def.secret && configuredHint
    ? `Configured (${configuredHint}) — leave blank to keep`
    : def.placeholder;

  const inputCls = `${FIELD_INPUT_CLS}${error ? ' border-border-danger focus:border-border-danger focus:ring-border-danger' : ''}`;

  return (
    <label className="block">
      <span className="text-role-caption font-semibold text-text-default">
        {def.label}
        {def.required && !configuredHint ? <span className="text-text-danger"> *</span> : null}
      </span>
      {def.type === 'textarea' ? (
        <textarea
          className={`${inputCls} mt-1 h-28 font-mono text-role-caption`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          spellCheck={false}
        />
      ) : def.type === 'select' ? (
        <select
          className={`${inputCls} mt-1`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {(def.options ?? []).map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      ) : (
        <input
          type={def.type === 'password' ? 'password' : def.type === 'email' ? 'email' : 'text'}
          className={`${inputCls} mt-1${def.secret ? ' font-mono text-role-caption' : ''}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          spellCheck={false}
          autoComplete="off"
        />
      )}
      {def.help && <p className="mt-1 text-role-caption text-text-faint">{def.help}</p>}
      {error && <p className="mt-1 text-role-caption font-medium text-text-danger">{error}</p>}
    </label>
  );
}
