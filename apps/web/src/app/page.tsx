import type { Metadata } from 'next';
import { LandingContent } from '@/components/landing';

const SITE = 'https://smart-outlet.in';
const NAME = 'Smart Outlet';
const TITLE = 'Smart Outlet — Records, cashbook & dues for your CSP counter';
const DESC =
  'Smart Outlet records every AEPS, DMT, PAN and recharge in seconds, keeps your cashbook tallied, and tracks every due — on any phone, even offline. An independent tool for CSP and Grahak Seva Kendra counters.';

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESC,
  keywords: [
    'CSP software',
    'Grahak Seva Kendra',
    'AEPS record keeping',
    'DMT register',
    'retailer cashbook',
    'CSP counter app',
    'customer service point',
    'kiosk banking records',
    'recharge PAN AEPS register',
    'offline shop ledger',
  ],
  alternates: { canonical: '/' },
  robots: { index: true, follow: true },
  openGraph: {
    type: 'website',
    url: SITE,
    siteName: NAME,
    title: TITLE,
    description: DESC,
    locale: 'en_IN',
  },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESC },
};

const FAQ = [
  ['q1', 'a1'],
  ['q2', 'a2'],
  ['q3', 'a3'],
  ['q4', 'a4'],
  ['q5', 'a5'],
  ['q6', 'a6'],
] as const;

// Structured data (English). Mirrors the on-page copy so rich results stay truthful.
const FAQ_TEXT: Record<string, string> = {
  q1: 'Is Smart Outlet affiliated with a bank or the government?',
  a1: 'No. Smart Outlet is an independent tool for keeping your own records. It is not affiliated with any bank, payment network or government body, and it does not process transactions.',
  q2: 'Do I need the internet all the time?',
  a2: 'No. You can record on a weak or dropped connection. Drafts stay on your device and sync automatically — the same record is never saved twice.',
  q3: 'Does it store Aadhaar or card numbers?',
  a3: 'No. Fields that look like an Aadhaar or card number are rejected at entry, so they are never stored.',
  q4: 'Can my staff use it with limited access?',
  a4: 'Yes. Add operators and grant exactly the permissions you choose. Every action is recorded in an audit trail.',
  q5: 'What does it cost?',
  a5: 'You can start free. If you need higher limits, staff or exports, you can upgrade — upgrades are reviewed and activated manually, with no automatic charges.',
  q6: 'Is it available in Hindi?',
  a6: 'Yes. Switch between Hindi and English anytime from the top of any screen.',
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE}/#org`,
      name: NAME,
      url: SITE,
      description: DESC,
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE}/#website`,
      url: SITE,
      name: NAME,
      publisher: { '@id': `${SITE}/#org` },
      inLanguage: ['en-IN', 'hi-IN'],
    },
    {
      '@type': 'SoftwareApplication',
      name: NAME,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web, Android',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'INR' },
      description: DESC,
    },
    {
      '@type': 'FAQPage',
      mainEntity: FAQ.map(([q, a]) => ({
        '@type': 'Question',
        name: FAQ_TEXT[q],
        acceptedAnswer: { '@type': 'Answer', text: FAQ_TEXT[a] },
      })),
    },
  ],
};

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <LandingContent />
    </>
  );
}
