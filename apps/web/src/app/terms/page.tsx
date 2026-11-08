import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal';
import { TERMS } from '@/lib/legal-content';

export const metadata: Metadata = {
  title: 'Terms & Conditions',
  description: 'The terms for using the counter record-keeping app.',
  robots: { index: true, follow: true },
  alternates: { canonical: '/terms' },
};

export default function Page() {
  return <LegalPage doc={TERMS} />;
}
