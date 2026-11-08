import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal';
import { PRIVACY } from '@/lib/legal-content';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'What data we collect, how we use and protect it, and your rights.',
  robots: { index: true, follow: true },
  alternates: { canonical: '/privacy' },
};

export default function Page() {
  return <LegalPage doc={PRIVACY} />;
}
