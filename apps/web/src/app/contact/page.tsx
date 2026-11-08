import type { Metadata } from 'next';
import { ContactContent } from '@/components/contact-content';

export const metadata: Metadata = {
  title: 'Contact us',
  description: 'Get help with setup, billing or your data — on WhatsApp, phone or email.',
  robots: { index: true, follow: true },
  alternates: { canonical: '/contact' },
};

export default function Page() {
  return <ContactContent />;
}
