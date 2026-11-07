import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import { Providers } from '@/lib/session';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'CSP2All Admin', template: '%s · CSP2All Admin' },
  description: 'CSP2All platform administration console',
  robots: { index: false, follow: false },
  icons: { icon: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/icon.svg` },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F6F7FB' },
    { media: '(prefers-color-scheme: dark)', color: '#0E1020' },
  ],
};

// Every page is rendered per request so the CSP nonce from middleware applies.
export const dynamic = 'force-dynamic';

/** Applies the saved (or OS) theme before first paint to avoid a flash. */
const THEME_SCRIPT = `try{var t=localStorage.getItem('csp2all-admin-theme');var d=t?t==='dark':matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d)}catch(e){}`;

export default async function RootLayout({ children }: { children: ReactNode }) {
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Browsers blank the nonce attribute after parsing, so skip the hydration attribute check. */}
        <script
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }}
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
