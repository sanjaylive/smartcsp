import type { Metadata } from 'next';
import { LandingContent } from '@/components/landing';
import { getPublicConfig } from '@/lib/config';

const SITE = 'https://smart-outlet.in';
const titleFor = (name: string) => `${name} — Records, cashbook & dues for your CSP counter`;
const descFor = (name: string) =>
  `${name} records every AEPS, DMT, PAN and recharge in seconds, keeps your cashbook tallied, and tracks every due — on any phone, even offline. An independent tool for CSP and Grahak Seva Kendra counters.`;

export async function generateMetadata(): Promise<Metadata> {
  const { brand } = await getPublicConfig();
  const NAME = brand.name;
  const TITLE = titleFor(NAME);
  const DESC = descFor(NAME);
  return {
    title: { absolute: TITLE },
    description: DESC,
    keywords: KEYWORDS,
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
}

const KEYWORDS = [
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
];

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

function jsonLdFor(name: string) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${SITE}/#org`,
        name,
        url: SITE,
        description: descFor(name),
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE}/#website`,
        url: SITE,
        name,
        publisher: { '@id': `${SITE}/#org` },
        inLanguage: ['en-IN', 'hi-IN'],
      },
      {
        '@type': 'SoftwareApplication',
        name,
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web, Android',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'INR' },
        description: descFor(name),
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
}

export default async function Page() {
  const { brand } = await getPublicConfig();
  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdFor(brand.name)) }}
      />
      <LandingContent />
    </>
  );
}
