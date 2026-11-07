import 'server-only';
import { BRAND_DEFAULTS, type Brand } from './brand';

const API_URL = process.env.API_URL ?? 'http://localhost:4610';
const HEX = /^#[0-9a-fA-F]{6}$/;

export interface PublicConfig {
  brand: Brand;
  signupsEnabled: boolean;
}

/** Server-side fetch of public branding/config. Cached 60s; falls back to defaults on any error. */
export async function getPublicConfig(): Promise<PublicConfig> {
  try {
    const res = await fetch(`${API_URL}/v1/public/config`, { next: { revalidate: 60 } });
    if (!res.ok) throw new Error(String(res.status));
    const j = (await res.json()) as { brand?: Partial<Brand>; signupsEnabled?: boolean };
    const b = j.brand ?? {};
    return {
      brand: {
        name: b.name?.trim() || BRAND_DEFAULTS.name,
        tagline: b.tagline ?? '',
        supportEmail: b.supportEmail ?? '',
        supportPhone: b.supportPhone ?? '',
        primaryColor:
          b.primaryColor && HEX.test(b.primaryColor) ? b.primaryColor : BRAND_DEFAULTS.primaryColor,
        logoUrl: b.logoUrl ?? '',
      },
      signupsEnabled: j.signupsEnabled !== false,
    };
  } catch {
    return { brand: BRAND_DEFAULTS, signupsEnabled: true };
  }
}
