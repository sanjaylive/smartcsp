/**
 * CSP2All design tokens. The web (apps/web/src/app/globals.css) and Flutter
 * (apps/mobile/lib/theme/tokens.dart) themes mirror these values; keep them in sync.
 * Contrast: every *text* token pair below meets WCAG AA (4.5:1) on its intended surface.
 */
export const tokens = {
  color: {
    light: {
      background: '#F6F7FB',
      surface: '#FFFFFF',
      surfaceMuted: '#EEF0F7',
      border: '#DDE1EC',
      text: '#161A2E',
      textMuted: '#525A75',
      brand: '#DC2626', // red-600
      brandStrong: '#B91C1C',
      brandAlt: '#EA580C', // orange-600
      onBrand: '#FFFFFF',
      success: '#15803D',
      warning: '#B45309',
      danger: '#B91C1C',
      info: '#1D4ED8',
      focus: '#EF4444',
    },
    dark: {
      background: '#0E1020',
      surface: '#171A2E',
      surfaceMuted: '#20243B',
      border: '#2E3352',
      text: '#ECEEF8',
      textMuted: '#A3A9C7',
      brand: '#F87171',
      brandStrong: '#FCA5A5',
      brandAlt: '#FB923C',
      onBrand: '#0E1020',
      success: '#4ADE80',
      warning: '#FBBF24',
      danger: '#F87171',
      info: '#60A5FA',
      focus: '#FCA5A5',
    },
    /** Service accents: `bg` is a tint for cards, `fg` is AA-contrast text/icon on that tint. */
    accent: {
      indigo: { bg: '#E0E7FF', fg: '#3730A3', darkBg: '#26295A', darkFg: '#C7D2FE' },
      violet: { bg: '#EDE9FE', fg: '#5B21B6', darkBg: '#2E2356', darkFg: '#DDD6FE' },
      teal: { bg: '#CCFBF1', fg: '#115E59', darkBg: '#12343A', darkFg: '#99F6E4' },
      blue: { bg: '#DBEAFE', fg: '#1E40AF', darkBg: '#1A2A4F', darkFg: '#BFDBFE' },
      amber: { bg: '#FEF3C7', fg: '#92400E', darkBg: '#3B2A12', darkFg: '#FDE68A' },
      coral: { bg: '#FFE4DC', fg: '#9A3412', darkBg: '#3D2118', darkFg: '#FED7AA' },
      green: { bg: '#DCFCE7', fg: '#166534', darkBg: '#15301F', darkFg: '#BBF7D0' },
      sky: { bg: '#E0F2FE', fg: '#075985', darkBg: '#132E40', darkFg: '#BAE6FD' },
      rose: { bg: '#FFE4E6', fg: '#9F1239', darkBg: '#3A1824', darkFg: '#FECDD3' },
      slate: { bg: '#E2E8F0', fg: '#334155', darkBg: '#252B38', darkFg: '#CBD5E1' },
    },
  },
  radius: { sm: 6, md: 10, lg: 14, xl: 20, pill: 999 },
  space: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40 },
  font: {
    family: "'Inter', 'Noto Sans Devanagari', system-ui, sans-serif",
    numeric: "'Inter', system-ui, sans-serif", // used with tabular-nums for money
    size: { xs: 12, sm: 14, md: 16, lg: 18, xl: 22, xxl: 28 },
  },
  touchTarget: 44,
  shadow: {
    card: '0 1px 2px rgba(22,26,46,0.06), 0 1px 3px rgba(22,26,46,0.08)',
  },
} as const;

export type AccentName = keyof typeof tokens.color.accent;
