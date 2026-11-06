'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Megaphone } from 'lucide-react';
import { useState } from 'react';
import { announcementSchema } from '@csp2all/shared';
import { useConfirm } from '@/components/dialog';
import { Can, Guard } from '@/components/guard';
import { useToast } from '@/components/toast';
import {
  Badge,
  Button,
  Card,
  Empty,
  Field,
  FormError,
  Input,
  PageHeader,
  QueryState,
  Select,
  StatusBadge,
  Textarea,
} from '@/components/ui';
import { del, get, isApiError, post } from '@/lib/api';
import { dt } from '@/lib/format';
import { useCan } from '@/lib/session';
import type { Announcement } from '@/lib/types';

export default function AnnouncementsPage() {
  return (
    <Guard perm="platform.view" what="announcements">
      <AnnouncementsInner />
    </Guard>
  );
}

function state(a: Announcement): 'Scheduled' | 'Live' | 'Ended' {
  const now = Date.now();
  if (new Date(a.startsAt).getTime() > now) return 'Scheduled';
  if (a.endsAt && new Date(a.endsAt).getTime() <= now) return 'Ended';
  return 'Live';
}

function AnnouncementsInner() {
  const q = useQuery({
    queryKey: ['announcements'],
    queryFn: () => get<{ items: Announcement[] }>('/v1/admin/announcements'),
  });
  const can = useCan();
  const qc = useQueryClient();
  const toast = useToast();
  const [confirm, dialog] = useConfirm();
  return (
    <>
      <PageHeader
        title="Announcements"
        description="Banners shown to every shop in the web and mobile apps (maintenance windows, new features, incidents)."
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Card title="All announcements" bodyClassName="p-0">
          <QueryState query={q}>
            {(d) =>
              d.items.length === 0 ? (
                <Empty
                  title="No announcements yet"
                  icon={<Megaphone className="size-6" aria-hidden />}
                />
              ) : (
                <ul className="divide-y divide-line">
                  {d.items.map((a) => {
                    const st = state(a);
                    return (
                      <li
                        key={a.id}
                        className="flex flex-wrap items-start justify-between gap-3 px-4 py-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <strong className="text-sm">{a.title}</strong>
                            <StatusBadge status={a.severity} />
                            <Badge
                              tone={
                                st === 'Live' ? 'success' : st === 'Scheduled' ? 'info' : 'neutral'
                              }
                            >
                              {st}
                            </Badge>
                          </div>
                          <p className="mt-1 whitespace-pre-line text-[13px]">{a.body}</p>
                          <p className="mt-1 text-xs text-fg-muted">
                            {dt(a.startsAt)} → {a.endsAt ? dt(a.endsAt) : 'until ended'}
                          </p>
                        </div>
                        {st !== 'Ended' && can('announcements.manage') && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-danger"
                            onClick={() =>
                              confirm({
                                title: `End “${a.title}” now?`,
                                description:
                                  'The banner disappears from all shops immediately. The announcement stays in this history.',
                                confirmLabel: 'End announcement',
                                tone: 'danger',
                                onConfirm: async () => {
                                  await del(`/v1/admin/announcements/${a.id}`);
                                  toast.success('Announcement ended.');
                                  void qc.invalidateQueries({ queryKey: ['announcements'] });
                                },
                              })
                            }
                          >
                            End now
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )
            }
          </QueryState>
        </Card>
        <Can perm="announcements.manage">
          <NewAnnouncement />
        </Can>
      </div>
      {dialog}
    </>
  );
}

function toLocalInput(d: Date): string {
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 16);
}

function NewAnnouncement() {
  const qc = useQueryClient();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [severity, setSeverity] = useState<'INFO' | 'WARNING' | 'CRITICAL'>('INFO');
  const [startsAt, setStartsAt] = useState(() => toLocalInput(new Date()));
  const [endsAt, setEndsAt] = useState('');
  const [touched, setTouched] = useState(false);
  const payload = {
    title: title.trim(),
    body: body.trim(),
    severity,
    startsAt: startsAt ? new Date(startsAt).toISOString() : '',
    endsAt: endsAt ? new Date(endsAt).toISOString() : null,
  };
  const parsed = announcementSchema.safeParse(payload);
  const local: Record<string, string> = {};
  if (!parsed.success) for (const i of parsed.error.issues) local[i.path.join('.')] ??= i.message;
  if (endsAt && startsAt && new Date(endsAt) <= new Date(startsAt))
    local.endsAt = 'Must be after the start';
  const m = useMutation({
    mutationFn: () => post('/v1/admin/announcements', payload),
    onSuccess: () => {
      toast.success('Announcement published.');
      setTitle('');
      setBody('');
      setEndsAt('');
      setTouched(false);
      void qc.invalidateQueries({ queryKey: ['announcements'] });
    },
  });
  const err = (f: string) =>
    (isApiError(m.error) ? m.error.field(f) : undefined) ?? (touched ? local[f] : undefined);
  return (
    <Card title="New announcement">
      <form
        className="flex flex-col gap-3"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          setTouched(true);
          if (Object.keys(local).length === 0) m.mutate();
        }}
      >
        <Field label="Title" required error={err('title')}>
          {(p) => (
            <Input
              {...p}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
            />
          )}
        </Field>
        <Field label="Message" required error={err('body')}>
          {(p) => (
            <Textarea
              {...p}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={2000}
              rows={4}
            />
          )}
        </Field>
        <Field label="Severity" required>
          {(p) => (
            <Select
              {...p}
              value={severity}
              onChange={(e) => setSeverity(e.target.value as typeof severity)}
            >
              <option value="INFO">Info</option>
              <option value="WARNING">Warning</option>
              <option value="CRITICAL">Critical</option>
            </Select>
          )}
        </Field>
        <Field label="Starts" required hint="Your browser’s time zone." error={err('startsAt')}>
          {(p) => (
            <Input
              {...p}
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
            />
          )}
        </Field>
        <Field label="Ends (optional)" error={err('endsAt')}>
          {(p) => (
            <Input
              {...p}
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
            />
          )}
        </Field>
        <FormError error={m.error} />
        <Button
          type="submit"
          variant="primary"
          loading={m.isPending}
          icon={<Megaphone className="size-4" aria-hidden />}
        >
          Publish announcement
        </Button>
      </form>
    </Card>
  );
}
