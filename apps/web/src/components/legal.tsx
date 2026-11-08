'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CalendarDays, FileText, Mail, Printer } from 'lucide-react';
import { MarketingShell, PageHero, POLICY_LINKS } from '@/components/marketing-chrome';
import { Reveal } from '@/components/landing-motion';
import { useBrand } from '@/lib/brand';
import type { Block, LegalDoc } from '@/lib/legal-content';

const SITE = 'smart-outlet.in';

function useFill() {
  const brand = useBrand();
  const email = brand.supportEmail || `support@${SITE}`;
  return {
    email,
    fill: (s: string) =>
      s.replaceAll('{brand}', brand.name).replaceAll('{email}', email).replaceAll('{site}', SITE),
  };
}

/** Highlights the section currently being read in the table of contents. */
function useActiveSection(ids: string[]) {
  const [active, setActive] = useState(ids[0]);
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (hit) setActive(hit.target.id);
      },
      { rootMargin: '-90px 0px -65% 0px' },
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, [ids]);
  return active;
}

function Body({ blocks, fill }: { blocks: Block[]; fill: (s: string) => string }) {
  return (
    <>
      {blocks.map((b, i) =>
        typeof b === 'string' ? (
          <p key={i} className="mt-3 leading-relaxed text-fg-muted">
            {fill(b)}
          </p>
        ) : (
          <ul key={i} className="mt-3 space-y-2">
            {b.list.map((li) => (
              <li key={li} className="flex gap-3 leading-relaxed text-fg-muted">
                <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-brand" />
                <span>{fill(li)}</span>
              </li>
            ))}
          </ul>
        ),
      )}
    </>
  );
}

export function LegalPage({ doc }: { doc: LegalDoc }) {
  const { fill, email } = useFill();
  const ids = doc.sections.map((s) => s.id);
  const active = useActiveSection(ids);
  const others = POLICY_LINKS.filter((l) => l.href !== `/${doc.slug}`);

  return (
    <MarketingShell>
      <PageHero eyebrow={doc.eyebrow} title={doc.title} sub={fill(doc.summary)}>
        <div
          className="animate-rise mt-6 flex flex-wrap items-center gap-3 text-sm"
          style={{ animationDelay: '240ms' }}
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3.5 py-1.5 font-semibold text-fg-muted">
            <CalendarDays className="size-4 text-brand" /> Last updated {doc.updated}
          </span>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3.5 py-1.5 font-semibold text-fg-muted transition hover:border-brand/40 hover:text-fg print:hidden"
          >
            <Printer className="size-4" /> Print / save PDF
          </button>
        </div>
      </PageHero>

      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[260px_1fr] lg:px-8 lg:py-16">
        {/* table of contents */}
        <aside className="print:hidden">
          <nav aria-label="On this page" className="lg:sticky lg:top-24">
            <p className="text-xs font-bold uppercase tracking-widest text-fg">On this page</p>
            <ol className="mt-4 space-y-1 border-l border-border">
              {doc.sections.map((s, i) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    aria-current={active === s.id ? 'location' : undefined}
                    className="-ml-px block border-l-2 border-transparent py-1.5 pl-4 text-sm text-fg-muted transition hover:text-fg aria-[current=location]:border-brand aria-[current=location]:font-semibold aria-[current=location]:text-brand"
                  >
                    {i + 1}. {s.h}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </aside>

        <div className="min-w-0 max-w-3xl">
          {doc.sections.map((s, i) => (
            <section
              key={s.id}
              id={s.id}
              className="scroll-mt-24 border-b border-border/70 py-8 first:pt-0 last:border-0"
            >
              <h2 className="flex items-baseline gap-3 font-display text-xl font-extrabold text-fg sm:text-2xl">
                <span className="font-mono text-sm font-bold text-brand">
                  {String(i + 1).padStart(2, '0')}
                </span>
                {s.h}
              </h2>
              <Body blocks={s.body} fill={fill} />
            </section>
          ))}

          <Reveal className="mt-6 flex flex-col items-start justify-between gap-4 rounded-2xl bg-brand-bg p-6 sm:flex-row sm:items-center">
            <div>
              <p className="font-display text-lg font-extrabold text-fg">
                Questions about this policy?
              </p>
              <p className="mt-1 text-sm text-fg-muted">
                Write to{' '}
                <a
                  className="font-semibold text-brand underline-offset-2 hover:underline"
                  href={`mailto:${email}`}
                >
                  {email}
                </a>{' '}
                — we reply within 2 working days.
              </p>
            </div>
            <Link
              href="/contact"
              className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-brand px-5 text-sm font-bold text-on-brand transition hover:bg-brand-strong"
            >
              <Mail className="size-4" /> Contact us
            </Link>
          </Reveal>

          <div className="mt-10 print:hidden">
            <p className="text-xs font-bold uppercase tracking-widest text-fg">Other policies</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {others.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="group flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3.5 text-sm font-semibold text-fg transition hover:border-brand/40"
                >
                  <span className="flex items-center gap-2.5">
                    <FileText className="size-4 text-brand" /> {l.label}
                  </span>
                  <ArrowRight className="size-4 text-fg-muted transition group-hover:translate-x-0.5 group-hover:text-brand" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </MarketingShell>
  );
}
