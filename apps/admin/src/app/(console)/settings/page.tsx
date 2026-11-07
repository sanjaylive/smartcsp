'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useConfirm } from '@/components/dialog';
import { Guard } from '@/components/guard';
import { useToast } from '@/components/toast';
import {
  Badge,
  Button,
  Card,
  Field,
  FormError,
  Input,
  PageHeader,
  QueryState,
  Select,
  Switch,
} from '@/components/ui';
import { get, isApiError, post, put } from '@/lib/api';
import { dt } from '@/lib/format';
import { useCan } from '@/lib/session';
import type { PlatformSetting } from '@/lib/types';

/** Mirrors the validators in apps/api/src/modules/admin/admin.controller.ts (SETTINGS). */
const RETENTION_FIELDS = [
  { key: 'auditLogDays', label: 'Audit log', unit: 'days', min: 365, max: 3650, fallback: 2555 },
  {
    key: 'otpChallengeDays',
    label: 'Sign-in code records',
    unit: 'days',
    min: 1,
    max: 90,
    fallback: 7,
  },
  {
    key: 'revokedSessionDays',
    label: 'Revoked sessions',
    unit: 'days',
    min: 7,
    max: 365,
    fallback: 30,
  },
  { key: 'exportFileHours', label: 'Export files', unit: 'hours', min: 1, max: 168, fallback: 24 },
  {
    key: 'suspendedTenantDeletionDays',
    label: 'Deletion window for shops pending deletion',
    unit: 'days',
    min: 30,
    max: 3650,
    fallback: 180,
  },
] as const;

type Retention = Record<(typeof RETENTION_FIELDS)[number]['key'], number>;

export default function SettingsPage() {
  return (
    <Guard perm="platform.view" what="platform settings">
      <SettingsInner />
    </Guard>
  );
}

function SettingsInner() {
  const q = useQuery({
    queryKey: ['settings'],
    queryFn: () => get<{ items: PlatformSetting[]; editableKeys: string[] }>('/v1/admin/settings'),
  });
  const can = useCan();
  const editable = can('settings.manage');
  return (
    <>
      <PageHeader
        title="Settings"
        description="Platform-wide configuration. Changes take effect immediately and are audited."
        actions={!editable && <Badge>Read-only for your role</Badge>}
      />
      <QueryState query={q}>
        {(d) => {
          const val = (k: string) => d.items.find((i) => i.key === k);
          const known = ['dataRetention', 'signupsEnabled', 'supportContact', 'brand', 'sms21'];
          return (
            <div className="grid gap-4 xl:grid-cols-2">
              <BrandCard setting={val('brand')} editable={editable} />
              <Sms21Card editable={editable} />
              <div className="flex flex-col gap-4">
                <SignupsCard setting={val('signupsEnabled')} editable={editable} />
                <SupportContactCard setting={val('supportContact')} editable={editable} />
              </div>
              <RetentionCard setting={val('dataRetention')} editable={editable} />
              {d.items.filter((i) => !known.includes(i.key)).length > 0 && (
                <Card title="Other settings (read-only)" className="xl:col-span-2">
                  <pre className="overflow-auto font-mono text-[12px]">
                    {JSON.stringify(
                      d.items.filter((i) => !known.includes(i.key)),
                      null,
                      2,
                    )}
                  </pre>
                </Card>
              )}
            </div>
          );
        }}
      </QueryState>
    </>
  );
}

function useSave(key: string, label: string) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (value: unknown) => put(`/v1/admin/settings/${key}`, { value }),
    onSuccess: () => {
      toast.success(`${label} saved.`);
      void qc.invalidateQueries({ queryKey: ['settings'] });
    },
  });
}

function Updated({ s }: { s?: PlatformSetting }) {
  return (
    <p className="text-xs text-fg-muted">
      {s ? `Last changed ${dt(s.updatedAt)}` : 'Using built-in defaults (never changed).'}
    </p>
  );
}

function RetentionCard({ setting, editable }: { setting?: PlatformSetting; editable: boolean }) {
  const current = (setting?.value ?? {}) as Partial<Retention>;
  const [form, setForm] = useState<Record<string, string>>(() =>
    Object.fromEntries(RETENTION_FIELDS.map((f) => [f.key, String(current[f.key] ?? f.fallback)])),
  );
  const save = useSave('dataRetention', 'Data retention');
  const [confirm, dialog] = useConfirm();
  const errors: Record<string, string> = {};
  for (const f of RETENTION_FIELDS) {
    const n = Number(form[f.key]);
    if (!/^\d+$/.test(form[f.key] ?? '') || n < f.min || n > f.max)
      errors[f.key] = `${f.min}–${f.max} ${f.unit}`;
  }
  const valid = Object.keys(errors).length === 0;
  const apiErr = (k: string) =>
    isApiError(save.error) ? save.error.field(`value.${k}`) : undefined;
  return (
    <Card title="Data retention" actions={<Updated s={setting} />}>
      <form
        className="flex flex-col gap-3"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          const value = Object.fromEntries(
            RETENTION_FIELDS.map((f) => [f.key, Number(form[f.key])]),
          );
          confirm({
            title: 'Change data retention?',
            description:
              'Shorter periods make the nightly cleanup permanently delete older data. This cannot be undone.',
            confirmLabel: 'Save retention policy',
            tone: 'warning',
            onConfirm: () => save.mutateAsync(value),
          });
        }}
      >
        <p className="text-[13px] text-fg-muted">
          How long operational data is kept before automatic deletion. Financial records follow
          statutory retention (see docs/DATA_RETENTION.md) and are not affected.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {RETENTION_FIELDS.map((f) => (
            <Field
              key={f.key}
              label={`${f.label} (${f.unit})`}
              hint={`${f.min}–${f.max}`}
              error={apiErr(f.key) ?? errors[f.key]}
            >
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  min={f.min}
                  max={f.max}
                  value={form[f.key]}
                  disabled={!editable}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                />
              )}
            </Field>
          ))}
        </div>
        <FormError error={save.error} />
        {editable && (
          <div>
            <Button type="submit" variant="primary" loading={save.isPending} disabled={!valid}>
              Save retention
            </Button>
          </div>
        )}
      </form>
      {dialog}
    </Card>
  );
}

const BRAND_DEFAULTS = {
  name: 'Smart Outlet',
  tagline: '',
  supportEmail: '',
  supportPhone: '',
  primaryColor: '#4F46E5',
  logoUrl: '',
};

function BrandCard({ setting, editable }: { setting?: PlatformSetting; editable: boolean }) {
  const current = { ...BRAND_DEFAULTS, ...((setting?.value ?? {}) as Record<string, string>) };
  const [form, setForm] = useState<Record<string, string>>(current);
  const save = useSave('brand', 'Branding');
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const err = (k: string) => (isApiError(save.error) ? save.error.field(`value.${k}`) : undefined);
  const colorOk = /^#[0-9a-fA-F]{6}$/.test(form.primaryColor);
  return (
    <Card title="Branding" actions={<Updated s={setting} />} className="xl:col-span-2">
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!form.name.trim() || !colorOk) return;
          save.mutate({
            name: form.name.trim(),
            tagline: form.tagline.trim(),
            supportEmail: form.supportEmail.trim(),
            supportPhone: form.supportPhone.trim(),
            primaryColor: form.primaryColor,
            logoUrl: form.logoUrl.trim(),
          });
        }}
      >
        <p className="text-[13px] text-fg-muted">
          The product name, logo, support details and accent colour shown across the tenant app, the
          admin console and the public site. Changes take effect within a minute.
        </p>
        <div className="flex items-center gap-4 rounded-xl border border-border bg-surface-muted/40 p-4">
          <span
            aria-hidden
            className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl text-lg font-extrabold text-white"
            style={{ background: colorOk ? form.primaryColor : '#4F46E5' }}
          >
            {form.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={form.logoUrl} alt="" className="size-full object-contain" />
            ) : (
              (form.name.trim()[0] ?? 'S').toUpperCase()
            )}
          </span>
          <div className="min-w-0">
            <p className="truncate text-lg font-extrabold tracking-tight">
              {form.name.trim() || 'Smart Outlet'}
            </p>
            {form.tagline.trim() && (
              <p className="truncate text-sm text-fg-muted">{form.tagline.trim()}</p>
            )}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Brand name" required error={err('name')}>
            {(p) => (
              <Input
                {...p}
                value={form.name}
                maxLength={40}
                disabled={!editable}
                onChange={(e) => set('name', e.target.value)}
              />
            )}
          </Field>
          <Field label="Tagline" hint="Short line under the name" error={err('tagline')}>
            {(p) => (
              <Input
                {...p}
                value={form.tagline}
                maxLength={80}
                disabled={!editable}
                onChange={(e) => set('tagline', e.target.value)}
              />
            )}
          </Field>
          <Field label="Support email" error={err('supportEmail')}>
            {(p) => (
              <Input
                {...p}
                type="email"
                value={form.supportEmail}
                disabled={!editable}
                onChange={(e) => set('supportEmail', e.target.value)}
              />
            )}
          </Field>
          <Field label="Support phone" error={err('supportPhone')}>
            {(p) => (
              <Input
                {...p}
                value={form.supportPhone}
                maxLength={20}
                disabled={!editable}
                onChange={(e) => set('supportPhone', e.target.value)}
              />
            )}
          </Field>
          <Field
            label="Accent colour"
            hint="Hex, e.g. #4F46E5"
            error={err('primaryColor') ?? (!colorOk ? 'Use a hex colour like #4F46E5' : undefined)}
          >
            {(p) => (
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label="Accent colour picker"
                  value={colorOk ? form.primaryColor : '#4F46E5'}
                  disabled={!editable}
                  onChange={(e) => set('primaryColor', e.target.value)}
                  className="size-11 shrink-0 cursor-pointer rounded-lg border border-border bg-surface"
                />
                <Input
                  {...p}
                  value={form.primaryColor}
                  maxLength={7}
                  disabled={!editable}
                  onChange={(e) => set('primaryColor', e.target.value)}
                />
              </div>
            )}
          </Field>
          <Field
            label="Logo URL"
            hint="Square PNG/SVG on a transparent background"
            error={err('logoUrl')}
          >
            {(p) => (
              <Input
                {...p}
                type="url"
                inputMode="url"
                value={form.logoUrl}
                disabled={!editable}
                placeholder="https://…"
                onChange={(e) => set('logoUrl', e.target.value)}
              />
            )}
          </Field>
        </div>
        <FormError error={save.error} />
        {editable && (
          <div>
            <Button
              type="submit"
              variant="primary"
              loading={save.isPending}
              disabled={!form.name.trim() || !colorOk}
            >
              Save branding
            </Button>
          </div>
        )}
      </form>
    </Card>
  );
}

interface Sms21Public {
  configured: boolean;
  baseUrl: string;
  apiKeyMasked: string;
  otpEnabled: boolean;
  otpChannel: 'sms' | 'whatsapp';
  notifyEnabled: boolean;
  senderId: string;
  testMode: boolean;
}

function Sms21Card({ editable }: { editable: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['sms21'], queryFn: () => get<Sms21Public>('/v1/admin/sms21') });
  return (
    <Card
      title="SMS & WhatsApp (SMS21)"
      className="xl:col-span-2"
      actions={
        q.data ? (
          <Badge tone={q.data.configured ? 'success' : 'warning'}>
            {q.data.configured ? (q.data.testMode ? 'Test key' : 'Connected') : 'Not connected'}
          </Badge>
        ) : undefined
      }
    >
      <QueryState query={q}>
        {(d) => <Sms21Form data={d} editable={editable} qc={qc} toast={toast} />}
      </QueryState>
    </Card>
  );
}

function Sms21Form({
  data,
  editable,
  qc,
  toast,
}: {
  data: Sms21Public;
  editable: boolean;
  qc: ReturnType<typeof useQueryClient>;
  toast: ReturnType<typeof useToast>;
}) {
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState(data.baseUrl);
  const [otpEnabled, setOtpEnabled] = useState(data.otpEnabled);
  const [otpChannel, setOtpChannel] = useState<'sms' | 'whatsapp'>(data.otpChannel);
  const [notifyEnabled, setNotifyEnabled] = useState(data.notifyEnabled);
  const [senderId, setSenderId] = useState(data.senderId);

  const save = useMutation({
    mutationFn: () =>
      put('/v1/admin/sms21', {
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        baseUrl,
        otpEnabled,
        otpChannel,
        notifyEnabled,
        senderId,
      }),
    onSuccess: () => {
      toast.success('SMS21 settings saved.');
      setApiKey('');
      void qc.invalidateQueries({ queryKey: ['sms21'] });
    },
  });

  const test = useMutation({
    mutationFn: () =>
      post<{ ok: boolean; environment: string | null; scopes: string[]; wallet: unknown }>(
        '/v1/admin/sms21/test',
      ),
  });
  const wallet = test.data?.wallet as { balance?: number; currency?: string } | null | undefined;

  const err = (k: string) => (isApiError(save.error) ? save.error.field(`value.${k}`) : undefined);
  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <p className="text-[13px] text-fg-muted">
        Connect your SMS21 account (api.sms21.in) to send sign-in codes and reminders over SMS and
        WhatsApp. The API key is stored encrypted and never shown again. Test keys (sms21_test_…)
        don’t deliver or charge.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="API key"
          hint={
            data.configured
              ? `Saved: ${data.apiKeyMasked} — leave blank to keep`
              : 'sms21_live_… or sms21_test_…'
          }
          error={err('apiKey')}
        >
          {(p) => (
            <Input
              {...p}
              type="password"
              autoComplete="off"
              value={apiKey}
              placeholder={data.configured ? '••••••••' : 'sms21_…'}
              disabled={!editable}
              onChange={(e) => setApiKey(e.target.value)}
            />
          )}
        </Field>
        <Field label="API base URL" error={err('baseUrl')}>
          {(p) => (
            <Input
              {...p}
              type="url"
              value={baseUrl}
              disabled={!editable}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          )}
        </Field>
      </div>

      <div className="rounded-xl border border-border p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-semibold">Phone sign-in (OTP)</p>
            <p className="text-[13px] text-fg-muted">
              Let shops sign in with a code sent to their phone.
            </p>
          </div>
          <Switch
            checked={otpEnabled}
            label="Enable phone sign-in"
            disabled={!editable}
            onChange={setOtpEnabled}
          />
        </div>
      </div>

      <div className="rounded-xl border border-border p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-semibold">Customer reminders</p>
            <p className="text-[13px] text-fg-muted">
              Send due and follow-up reminders to customers over WhatsApp/SMS.
            </p>
          </div>
          <Switch
            checked={notifyEnabled}
            label="Enable customer reminders"
            disabled={!editable}
            onChange={setNotifyEnabled}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Preferred channel" hint="WhatsApp falls back to SMS">
          {(p) => (
            <Select
              {...p}
              value={otpChannel}
              disabled={!editable}
              onChange={(e) => setOtpChannel(e.target.value as 'sms' | 'whatsapp')}
            >
              <option value="whatsapp">WhatsApp (SMS fallback)</option>
              <option value="sms">SMS</option>
            </Select>
          )}
        </Field>
        <Field label="SMS sender ID" hint="Approved DLT header for live SMS (optional)">
          {(p) => (
            <Input
              {...p}
              value={senderId}
              maxLength={16}
              disabled={!editable}
              onChange={(e) => setSenderId(e.target.value)}
            />
          )}
        </Field>
      </div>

      {test.data?.ok && (
        <p className="rounded-lg bg-success-bg px-3 py-2 text-[13px] font-medium text-success">
          Connected to SMS21 ({test.data.environment ?? 'unknown'} environment)
          {wallet && typeof wallet.balance === 'number'
            ? ` · wallet ${wallet.balance} ${wallet.currency ?? ''}`.trimEnd()
            : ''}
          .
        </p>
      )}
      {test.error && (
        <p className="rounded-lg bg-danger-bg px-3 py-2 text-[13px] font-medium text-danger">
          {isApiError(test.error) ? test.error.message : 'Connection test failed.'}
        </p>
      )}

      <FormError error={save.error} />
      {editable && (
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary" loading={save.isPending}>
            Save SMS21 settings
          </Button>
          <Button
            type="button"
            variant="secondary"
            loading={test.isPending}
            disabled={!data.configured && !apiKey.trim()}
            onClick={() => test.mutate()}
          >
            Test connection
          </Button>
        </div>
      )}
    </form>
  );
}

function SignupsCard({ setting, editable }: { setting?: PlatformSetting; editable: boolean }) {
  const enabled = setting ? setting.value === true : true;
  const save = useSave('signupsEnabled', 'Sign-up setting');
  const [confirm, dialog] = useConfirm();
  return (
    <Card title="New shop sign-ups" actions={<Updated s={setting} />}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px]">
          {enabled
            ? 'New shop sign-ups are open.'
            : 'New shop sign-ups are paused. Existing shops are unaffected.'}
        </p>
        {editable ? (
          <Switch
            checked={enabled}
            label="Allow new shop sign-ups"
            disabled={save.isPending}
            onChange={(v) =>
              confirm({
                title: v ? 'Allow new sign-ups?' : 'Pause new sign-ups?',
                description: v
                  ? 'New shops can register again.'
                  : 'People who try to create a new shop will be told sign-ups are paused.',
                confirmLabel: v ? 'Allow sign-ups' : 'Pause sign-ups',
                tone: v ? 'primary' : 'warning',
                onConfirm: () => save.mutateAsync(v),
              })
            }
          />
        ) : (
          <Badge tone={enabled ? 'success' : 'warning'}>{enabled ? 'Open' : 'Paused'}</Badge>
        )}
      </div>
      <p className="mt-2 text-xs text-fg-muted">
        Note: the API stores this flag, but onboarding does not enforce it yet.
      </p>
      <FormError error={save.error} />
      {dialog}
    </Card>
  );
}

function SupportContactCard({
  setting,
  editable,
}: {
  setting?: PlatformSetting;
  editable: boolean;
}) {
  const v = (setting?.value ?? {}) as { email?: string; hours?: string };
  const [email, setEmail] = useState(v.email ?? '');
  const [hours, setHours] = useState(v.hours ?? '');
  const save = useSave('supportContact', 'Support contact');
  const err = (k: string) => (isApiError(save.error) ? save.error.field(`value.${k}`) : undefined);
  return (
    <Card title="Support contact" actions={<Updated s={setting} />}>
      <form
        className="flex flex-col gap-3"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate({ email: email.trim(), hours: hours.trim() });
        }}
      >
        <p className="text-[13px] text-fg-muted">
          The support address and hours for shops. (Stored platform setting; the shop apps do not
          read it yet.)
        </p>
        <Field label="Support email" required error={err('email')}>
          {(p) => (
            <Input
              {...p}
              type="email"
              value={email}
              disabled={!editable}
              onChange={(e) => setEmail(e.target.value)}
            />
          )}
        </Field>
        <Field label="Support hours" hint="e.g. Mon–Sat, 9:00–18:00 IST" error={err('hours')}>
          {(p) => (
            <Input
              {...p}
              value={hours}
              maxLength={100}
              disabled={!editable}
              onChange={(e) => setHours(e.target.value)}
            />
          )}
        </Field>
        <FormError error={save.error} />
        {editable && (
          <div>
            <Button
              type="submit"
              variant="primary"
              loading={save.isPending}
              disabled={!email.trim()}
            >
              Save contact
            </Button>
          </div>
        )}
      </form>
    </Card>
  );
}
