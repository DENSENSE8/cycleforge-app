'use client';

/**
 * Typed vault credential connect sheet — replaces the generic JSON textarea.
 * Despite the name, this is a centered modal (Dialog), not a bottom sheet.
 */
import { useCallback, useMemo, useState } from 'react';
import { toast } from '@/lib/toast';
import { Button } from '@/design-system/primitives/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/design-system/components/Dialog';
import { getCredentialFormDef } from '@/lib/integrations/credential-form-defs';
import type { ConfiguredFieldHint } from '@/lib/integrations/credential-payload';
import { CredentialField } from './CredentialField';
import { FIELD_INPUT_CLS } from './form-styles';

interface VaultConnectSheetProps {
  provider: string;
  providerLabel: string;
  onClose: () => void;
  onSuccess?: () => void;
  /** Pre-filled non-secret values (update mode). */
  initialValues?: Record<string, string>;
  configuredFields?: ConfiguredFieldHint[];
  isUpdate?: boolean;
}

function emptyValues(
  fields: { key: string }[],
  initial?: Record<string, string>,
  provider?: string,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) {
    out[f.key] = initial?.[f.key] ?? '';
  }
  if (provider === 'fedex' && !out.env) out.env = 'sandbox';
  return out;
}

export function VaultConnectSheet({
  provider,
  providerLabel,
  onClose,
  onSuccess,
  initialValues,
  configuredFields = [],
  isUpdate = false,
}: VaultConnectSheetProps) {
  const formDef = getCredentialFormDef(provider);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [advancedJson, setAdvancedJson] = useState('{}');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const configuredByKey = useMemo(() => {
    const m = new Map<string, ConfiguredFieldHint>();
    for (const c of configuredFields) m.set(c.key, c);
    return m;
  }, [configuredFields]);

  const [values, setValues] = useState<Record<string, string>>(() =>
    formDef ? emptyValues(formDef.fields, initialValues, provider) : {},
  );

  const setField = useCallback((key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const submitTyped = useCallback(async () => {
    if (!formDef) return;
    setBusy(true);
    setFormError(null);
    setFieldErrors({});

    const payload: Record<string, unknown> = {};
    for (const field of formDef.fields) {
      const v = values[field.key]?.trim() ?? '';
      if (v) payload[field.key] = v;
      else if (field.required && !isUpdate) {
        setFieldErrors({ [field.key]: 'Required' });
        setBusy(false);
        return;
      } else if (v === '' && !field.secret) {
        payload[field.key] = '';
      }
    }

    // FedEx default env on first connect
    if (provider === 'fedex' && !payload.env) payload.env = 'sandbox';

    try {
      const res = await fetch('/api/admin/integrations/upsert', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider, payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.fieldErrors) setFieldErrors(data.fieldErrors);
        setFormError(data.detail || data.error || `HTTP ${res.status}`);
        return;
      }
      // The endpoint probe can succeed with an advisory (e.g.
      if (data.warning) toast.warning(String(data.warning));
      else toast.success(`${providerLabel} credentials saved.`);
      onSuccess?.();
      if (!onSuccess) window.location.reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }, [formDef, values, provider, providerLabel, isUpdate, onSuccess]);

  const submitAdvanced = useCallback(async () => {
    setBusy(true);
    setFormError(null);
    setFieldErrors({});
    try {
      const parsed = JSON.parse(advancedJson);
      const res = await fetch('/api/admin/integrations/upsert', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider, payload: parsed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.fieldErrors) setFieldErrors(data.fieldErrors);
        setFormError(data.detail || data.error || `HTTP ${res.status}`);
        return;
      }
      if (data.warning) toast.warning(String(data.warning));
      else toast.success(`${providerLabel} credentials saved.`);
      onSuccess?.();
      if (!onSuccess) window.location.reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Invalid JSON');
    } finally {
      setBusy(false);
    }
  }, [advancedJson, provider, providerLabel, onSuccess]);

  const sections = useMemo(() => {
    if (!formDef) return [];
    const groups = new Map<string, typeof formDef.fields>();
    for (const field of formDef.fields) {
      const section = field.section ?? '';
      const list = groups.get(section) ?? [];
      list.push(field);
      groups.set(section, list);
    }
    return [...groups.entries()];
  }, [formDef]);

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <DialogContent hideClose className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isUpdate ? `Update ${providerLabel}` : `Connect ${providerLabel}`}
          </DialogTitle>
          <DialogDescription>
            {formDef
              ? formDef.description
              : `Enter credentials for ${providerLabel}. Stored encrypted in the workspace vault.`}
          </DialogDescription>
        </DialogHeader>

        {formDef && !showAdvanced && (
          <div className="space-y-4">
            {sections.map(([section, fields]) => (
              <div key={section || '_default'} className="space-y-3">
                {section ? (
                  <p className="text-role-micro text-text-faint">{section}</p>
                ) : null}
                {fields.map((field) => (
                  <CredentialField
                    key={field.key}
                    def={field}
                    value={values[field.key] ?? ''}
                    error={fieldErrors[field.key]}
                    configuredHint={configuredByKey.get(field.key)?.hint}
                    onChange={(v) => setField(field.key, v)}
                  />
                ))}
              </div>
            ))}
          </div>
        )}

        {(!formDef || showAdvanced) && (
          <div>
            <textarea
              className={`${FIELD_INPUT_CLS} h-48 font-mono text-role-caption shadow-inner`}
              value={advancedJson}
              onChange={(e) => setAdvancedJson(e.target.value)}
              spellCheck={false}
              placeholder="{}"
            />
          </div>
        )}

        {formDef && (
          <button
            type="button"
            className="text-role-caption font-semibold text-text-soft hover:text-text-default"
            onClick={() => setShowAdvanced((v) => !v)}
          >
            {showAdvanced ? '← Back to form' : 'Advanced: paste JSON'}
          </button>
        )}

        {formError && (
          <div className="rounded-md bg-red-50 px-2 py-1 text-role-caption font-medium text-red-700">{formError}</div>
        )}

        <DialogFooter>
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            size="sm"
            loading={busy}
            onClick={formDef && !showAdvanced ? submitTyped : submitAdvanced}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
