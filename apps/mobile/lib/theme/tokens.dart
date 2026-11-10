// Mirrors packages/shared/src/tokens.ts — keep the values in sync.
// Every text colour pair below meets WCAG AA (4.5:1) on its intended surface.
import 'package:flutter/material.dart';

@immutable
class ColorTokens {
  const ColorTokens({
    required this.background,
    required this.surface,
    required this.surfaceMuted,
    required this.border,
    required this.text,
    required this.textMuted,
    required this.brand,
    required this.brandStrong,
    required this.brandAlt,
    required this.onBrand,
    required this.success,
    required this.warning,
    required this.danger,
    required this.info,
    required this.focus,
  });

  final Color background;
  final Color surface;
  final Color surfaceMuted;
  final Color border;
  final Color text;
  final Color textMuted;
  final Color brand;
  final Color brandStrong;
  final Color brandAlt;
  final Color onBrand;
  final Color success;
  final Color warning;
  final Color danger;
  final Color info;
  final Color focus;
}

class Tokens {
  Tokens._();

  static const light = ColorTokens(
    background: Color(0xFFF6F7FB),
    surface: Color(0xFFFFFFFF),
    surfaceMuted: Color(0xFFEEF0F7),
    border: Color(0xFFDDE1EC),
    text: Color(0xFF161A2E),
    textMuted: Color(0xFF525A75),
    brand: Color(0xFFDC2626),
    brandStrong: Color(0xFFB91C1C),
    brandAlt: Color(0xFFEA580C),
    onBrand: Color(0xFFFFFFFF),
    success: Color(0xFF15803D),
    warning: Color(0xFFB45309),
    danger: Color(0xFFB91C1C),
    info: Color(0xFF1D4ED8),
    focus: Color(0xFFEF4444),
  );

  static const dark = ColorTokens(
    background: Color(0xFF0E1020),
    surface: Color(0xFF171A2E),
    surfaceMuted: Color(0xFF20243B),
    border: Color(0xFF2E3352),
    text: Color(0xFFECEEF8),
    textMuted: Color(0xFFA3A9C7),
    brand: Color(0xFFF87171),
    brandStrong: Color(0xFFFCA5A5),
    brandAlt: Color(0xFFFB923C),
    onBrand: Color(0xFF0E1020),
    success: Color(0xFF4ADE80),
    warning: Color(0xFFFBBF24),
    danger: Color(0xFFF87171),
    info: Color(0xFF60A5FA),
    focus: Color(0xFFFCA5A5),
  );

  /// Service accents: `bg` is a card tint, `fg` is AA-contrast text/icon on that tint.
  static const Map<String, AccentTokens> accents = {
    'indigo': AccentTokens(Color(0xFFE0E7FF), Color(0xFF3730A3), Color(0xFF26295A), Color(0xFFC7D2FE)),
    'violet': AccentTokens(Color(0xFFEDE9FE), Color(0xFF5B21B6), Color(0xFF2E2356), Color(0xFFDDD6FE)),
    'teal': AccentTokens(Color(0xFFCCFBF1), Color(0xFF115E59), Color(0xFF12343A), Color(0xFF99F6E4)),
    'blue': AccentTokens(Color(0xFFDBEAFE), Color(0xFF1E40AF), Color(0xFF1A2A4F), Color(0xFFBFDBFE)),
    'amber': AccentTokens(Color(0xFFFEF3C7), Color(0xFF92400E), Color(0xFF3B2A12), Color(0xFFFDE68A)),
    'coral': AccentTokens(Color(0xFFFFE4DC), Color(0xFF9A3412), Color(0xFF3D2118), Color(0xFFFED7AA)),
    'green': AccentTokens(Color(0xFFDCFCE7), Color(0xFF166534), Color(0xFF15301F), Color(0xFFBBF7D0)),
    'sky': AccentTokens(Color(0xFFE0F2FE), Color(0xFF075985), Color(0xFF132E40), Color(0xFFBAE6FD)),
    'rose': AccentTokens(Color(0xFFFFE4E6), Color(0xFF9F1239), Color(0xFF3A1824), Color(0xFFFECDD3)),
    'slate': AccentTokens(Color(0xFFE2E8F0), Color(0xFF334155), Color(0xFF252B38), Color(0xFFCBD5E1)),
  };

  static AccentTokens accent(String name) => accents[name] ?? accents['slate']!;

  // radius
  static const double radiusSm = 6;
  static const double radiusMd = 10;
  static const double radiusLg = 14;
  static const double radiusXl = 20;
  static const double radiusPill = 999;

  // spacing
  static const double s1 = 4;
  static const double s2 = 8;
  static const double s3 = 12;
  static const double s4 = 16;
  static const double s5 = 20;
  static const double s6 = 24;
  static const double s8 = 32;
  static const double s10 = 40;

  // font sizes
  static const double fontXs = 12;
  static const double fontSm = 14;
  static const double fontMd = 16;
  static const double fontLg = 18;
  static const double fontXl = 22;
  static const double fontXxl = 28;

  /// Web uses 44px; Android/Material guidance is 48dp, which we use on mobile.
  static const double touchTarget = 48;

  static const List<BoxShadow> cardShadow = [
    BoxShadow(color: Color(0x0F161A2E), offset: Offset(0, 1), blurRadius: 2),
    BoxShadow(color: Color(0x14161A2E), offset: Offset(0, 1), blurRadius: 3),
  ];
}

@immutable
class AccentTokens {
  const AccentTokens(this.bg, this.fg, this.darkBg, this.darkFg);
  final Color bg;
  final Color fg;
  final Color darkBg;
  final Color darkFg;

  Color background(Brightness b) => b == Brightness.dark ? darkBg : bg;
  Color foreground(Brightness b) => b == Brightness.dark ? darkFg : fg;
}
