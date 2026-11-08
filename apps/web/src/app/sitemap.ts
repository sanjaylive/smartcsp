import type { MetadataRoute } from 'next';

const SITE = 'https://smart-outlet.in';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${SITE}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE}/terms`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE}/about`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE}/contact`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE}/refund-policy`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE}/shipping-policy`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE}/disclaimer`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
  ];
}
