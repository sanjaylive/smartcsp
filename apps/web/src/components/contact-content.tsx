'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Clock, FileText, Mail, MessageSquare, Phone, Send, ShieldCheck } from 'lucide-react';
import { MarketingShell, PageHero } from '@/components/marketing-chrome';
import { Reveal } from '@/components/landing-motion';
import { Button, Field, Input, Select, Textarea } from '@/components/ui';
import { useBrand } from '@/lib/brand';

const TOPICS = [
  ['setup', 'Help setting up my counter'],
  ['billing', 'Plans, billing or refund'],
  ['bug', 'Something is not working'],
  ['data', 'My data / privacy request'],
  ['other', 'Something else'],
] as const;

/** Digits only, with India's 91 prefix for 10-digit numbers — the format wa.me expects. */
function waNumber(phone: string) {
  const d = phone.replace(/\D/g, '');
  return d.length === 10 ? `91${d}` : d;
}

export function ContactContent() {
  const brand = useBrand();
  const email = brand.supportEmail || 'support@smart-outlet.in';
  const phone = brand.supportPhone;

  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [shop, setShop] = useState('');
  const [topic, setTopic] = useState<string>(TOPICS[0][0]);
  const [message, setMessage] = useState('');
  const [sentVia, setSentVia] = useState<'whatsapp' | 'email' | null>(null);

  const compose = () => {
    const topicLabel = TOPICS.find(([k]) => k === topic)?.[1] ?? topic;
    return [
      `Topic: ${topicLabel}`,
      `Name: ${name}`,
      `Mobile: ${mobile}`,
      ...(shop ? [`Shop: ${shop}`] : []),
      '',
      message,
    ].join('\n');
  };

  const send = (via: 'whatsapp' | 'email') => {
    const text = compose();
    const url =
      via === 'whatsapp' && phone
        ? `https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(text)}`
        : `mailto:${email}?subject=${encodeURIComponent(`[${brand.name}] ${TOPICS.find(([k]) => k === topic)?.[1] ?? 'Enquiry'}`)}&body=${encodeURIComponent(text)}`;
    window.open(url, via === 'whatsapp' ? '_blank' : '_self', 'noopener');
    setSentVia(via);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    send(phone ? 'whatsapp' : 'email');
  };

  return (
    <MarketingShell>
      <PageHero
        eyebrow="Contact us"
        title="We're here to help your counter run smoothly"
        sub="Questions about setup, billing or your data? Reach us the way that suits you — in Hindi or English."
      />

      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-12 lg:px-8 lg:py-16">
        {/* channels */}
        <div className="space-y-4 lg:col-span-5">
          {phone && (
            <Reveal className="pro-card p-6">
              <div className="flex items-center gap-3.5">
                <span className="grid size-11 place-items-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/70 dark:text-emerald-400">
                  <MessageSquare className="size-5" />
                </span>
                <div>
                  <h2 className="font-display font-extrabold text-fg">WhatsApp & phone</h2>
                  <p className="text-xs text-fg-muted">Fastest for active operators</p>
                </div>
              </div>
              <p className="mt-4 font-display text-lg font-extrabold text-fg">{phone}</p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <a
                  href={`https://wa.me/${waNumber(phone)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-bold text-white transition hover:bg-emerald-700"
                >
                  <MessageSquare className="size-4" /> WhatsApp
                </a>
                <a
                  href={`tel:${phone.replace(/\s+/g, '')}`}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border text-sm font-bold text-fg transition hover:border-brand/40"
                >
                  <Phone className="size-4" /> Call
                </a>
              </div>
            </Reveal>
          )}

          <Reveal delay={100} className="pro-card p-6">
            <div className="flex items-center gap-3.5">
              <span className="grid size-11 place-items-center rounded-xl bg-brand-bg text-brand">
                <Mail className="size-5" />
              </span>
              <div>
                <h2 className="font-display font-extrabold text-fg">Email</h2>
                <p className="text-xs text-fg-muted">Support, billing and privacy requests</p>
              </div>
            </div>
            <a
              href={`mailto:${email}`}
              className="mt-4 block break-all font-semibold text-brand hover:underline"
            >
              {email}
            </a>
            <p className="mt-1 text-xs text-fg-muted">We reply within 2 working days.</p>
          </Reveal>

          <Reveal delay={200} className="pro-card p-6">
            <div className="flex items-center gap-3.5">
              <span className="grid size-11 place-items-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400">
                <Clock className="size-5" />
              </span>
              <div>
                <h2 className="font-display font-extrabold text-fg">Support hours</h2>
                <p className="text-xs text-fg-muted">Monday to Saturday, 10 am – 7 pm IST</p>
              </div>
            </div>
            <ul className="mt-4 space-y-2 text-sm">
              {[
                ['/refund-policy', 'Refund & Cancellation Policy'],
                ['/privacy', 'Privacy Policy'],
                ['/terms', 'Terms & Conditions'],
              ].map(([href, label]) => (
                <li key={href}>
                  <Link
                    href={href!}
                    className="inline-flex items-center gap-2 text-fg-muted hover:text-brand"
                  >
                    <FileText className="size-4" /> {label}
                  </Link>
                </li>
              ))}
            </ul>
          </Reveal>

          <div className="flex items-start gap-3 rounded-2xl border border-border bg-surface-muted/50 p-4 text-xs text-fg-muted">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-emerald-600" />
            <p>
              <strong className="text-fg">Stay safe:</strong> our team will never ask for your bank
              password, PIN, OTP or fingerprint.
            </p>
          </div>
        </div>

        {/* form */}
        <Reveal delay={120} className="pro-card p-6 sm:p-8 lg:col-span-7">
          <h2 className="font-display text-2xl font-extrabold text-fg">Send us a message</h2>
          <p className="mt-1 text-sm text-fg-muted">
            {phone
              ? 'Fill this in and it opens WhatsApp with your message ready to send.'
              : 'Fill this in and it opens your email app with your message ready to send.'}
          </p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Your name" required>
                {({ id }) => (
                  <Input
                    id={id}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                    required
                  />
                )}
              </Field>
              <Field label="Mobile number" required>
                {({ id }) => (
                  <Input
                    id={id}
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value)}
                    required
                  />
                )}
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Shop name (optional)">
                {({ id }) => (
                  <Input
                    id={id}
                    value={shop}
                    onChange={(e) => setShop(e.target.value)}
                    autoComplete="organization"
                  />
                )}
              </Field>
              <Field label="What is it about?" required>
                {({ id }) => (
                  <Select id={id} value={topic} onChange={(e) => setTopic(e.target.value)}>
                    {TOPICS.map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
            <Field label="Message" required>
              {({ id }) => (
                <Textarea
                  id={id}
                  rows={5}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  required
                />
              )}
            </Field>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button type="submit">
                <Send className="size-4" /> {phone ? 'Send on WhatsApp' : 'Send by email'}
              </Button>
              {phone && (
                <button
                  type="button"
                  onClick={(e) => {
                    const form = (e.currentTarget as HTMLButtonElement).form;
                    if (form?.reportValidity()) send('email');
                  }}
                  className="text-sm font-semibold text-fg-muted underline-offset-2 hover:text-fg hover:underline"
                >
                  or send by email
                </button>
              )}
            </div>

            {sentVia && (
              <p
                role="status"
                className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
              >
                {sentVia === 'whatsapp' ? 'WhatsApp' : 'Your email app'} should now be open with
                your message. Press send there to reach us.
              </p>
            )}
          </form>
        </Reveal>
      </div>
    </MarketingShell>
  );
}
