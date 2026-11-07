import type { MetadataRoute } from 'next';

const SITE = 'https://smart-outlet.in';

// Only the public marketing page and legal pages are indexable; the signed-in app is not.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/app/', '/onboarding', '/select-shop', '/login'],
    },
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
