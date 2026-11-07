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
  Switch,
} from '@/components/ui';
import { get, isApiError, put } from '@/lib/api';
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
          const known = ['dataRetention', 'signupsEnabled', 'supportContact', 'brand'];
          return (
            <div className="grid gap-4 xl:grid-cols-2">
              <BrandCard setting={val('brand')} editable={editable} />
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
