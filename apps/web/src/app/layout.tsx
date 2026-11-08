import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
// Self-hosted font files (bundled, served from 'self' — CSP-safe, and no build-time network fetch
// like next/font/google needs). The @font-face families are referenced from globals.css.
import '@fontsource-variable/inter';
import '@fontsource-variable/sora';
import type { Locale } from '@csp2all/shared';
import { Providers } from '@/components/providers';
import type { ThemePref } from '@/lib/theme';
import { getPublicConfig } from '@/lib/config';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const { brand } = await getPublicConfig();
  return {
    metadataBase: new URL('https://smart-outlet.in'),
    title: { default: brand.name, template: `%s · ${brand.name}` },
    description: 'Records, cashbook and dues for your CSP shop',
    // Default to noindex for the signed-in app; public pages opt back in per-route.
    robots: { index: false, follow: false },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#DC2626' },
    { media: '(prefers-color-scheme: dark)', color: '#0E1020' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const locale: Locale = jar.get('csp2all_locale')?.value === 'hi' ? 'hi' : 'en';
  const rawTheme = jar.get('csp2all_theme')?.value;
  const theme: ThemePref = rawTheme === 'dark' || rawTheme === 'light' ? rawTheme : 'system';
  const { brand } = await getPublicConfig();
  // Override the brand token with the configured accent (validated hex) for both themes.
  const accent =
    brand.primaryColor &&
    brand.primaryColor !== '#DC2626' &&
    /^#[0-9a-fA-F]{6}$/.test(brand.primaryColor)
      ? `:root,:root[data-theme='dark']{--brand:${brand.primaryColor};--brand-strong:${brand.primaryColor};--focus:${brand.primaryColor}}`
      : null;
  return (
    <html
      lang={locale}
      data-theme={theme === 'system' ? undefined : theme}
      suppressHydrationWarning
    >
      <body className="min-h-dvh antialiased">
        {accent && <style>{accent}</style>}
        <Providers locale={locale} theme={theme} brand={brand}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
