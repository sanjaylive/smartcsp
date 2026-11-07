'use client';

import { createContext, useContext, type ReactNode } from 'react';

export interface Brand {
  name: string;
  tagline: string;
  supportEmail: string;
  supportPhone: string;
  primaryColor: string;
  logoUrl: string;
}

export const BRAND_DEFAULTS: Brand = {
  name: 'Smart Outlet',
  tagline: '',
  supportEmail: '',
  supportPhone: '',
  primaryColor: '#DC2626',
  logoUrl: '',
};

const BrandContext = createContext<Brand>(BRAND_DEFAULTS);

export function BrandProvider({ brand, children }: { brand: Brand; children: ReactNode }) {
  return <BrandContext.Provider value={brand}>{children}</BrandContext.Provider>;
}

export function useBrand(): Brand {
  return useContext(BrandContext);
}
