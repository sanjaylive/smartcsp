import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { Inter, Sora } from 'next/font/google';
import type { Locale } from '@csp2all/shared';
import { Providers } from '@/components/providers';
import type { ThemePref } from '@/lib/theme';
import './globals.css';

// Self-hosted at build time (next/font) so the strict CSP `font-src 'self'` still holds.
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const sora = Sora({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-sora',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://smart-outlet.in'),
  title: { default: 'CSP2All', template: '%s · CSP2All' },
  description: 'Records, cashbook and dues for your CSP shop',
  // Default to noindex for the signed-in app; the public landing page opts back in per-route.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#4F46E5' },
    { media: '(prefers-color-scheme: dark)', color: '#0E1020' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const locale: Locale = jar.get('csp2all_locale')?.value === 'hi' ? 'hi' : 'en';
  const rawTheme = jar.get('csp2all_theme')?.value;
  const theme: ThemePref = rawTheme === 'dark' || rawTheme === 'light' ? rawTheme : 'system';
  return (
    <html
      lang={locale}
      data-theme={theme === 'system' ? undefined : theme}
      className={`${inter.variable} ${sora.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-dvh antialiased">
        <Providers locale={locale} theme={theme}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
