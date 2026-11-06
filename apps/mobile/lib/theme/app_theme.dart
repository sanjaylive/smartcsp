import 'package:flutter/material.dart';

import 'tokens.dart';

/// Material 3 theme built from the shared design tokens.
class AppTheme {
  AppTheme._();

  static ThemeData light() => _build(Tokens.light, Brightness.light);
  static ThemeData dark() => _build(Tokens.dark, Brightness.dark);

  static ThemeData _build(ColorTokens c, Brightness b) {
    final scheme = ColorScheme(
      brightness: b,
      primary: c.brand,
      onPrimary: c.onBrand,
      primaryContainer: b == Brightness.light ? const Color(0xFFE0E7FF) : const Color(0xFF26295A),
      onPrimaryContainer: b == Brightness.light ? const Color(0xFF3730A3) : const Color(0xFFC7D2FE),
      secondary: c.brandAlt,
      onSecondary: c.onBrand,
      secondaryContainer: b == Brightness.light ? const Color(0xFFEDE9FE) : const Color(0xFF2E2356),
      onSecondaryContainer: b == Brightness.light ? const Color(0xFF5B21B6) : const Color(0xFFDDD6FE),
      tertiary: c.info,
      onTertiary: c.onBrand,
      error: c.danger,
      onError: b == Brightness.light ? Colors.white : c.background,
      surface: c.surface,
      onSurface: c.text,
      onSurfaceVariant: c.textMuted,
      surfaceContainerLowest: c.surface,
      surfaceContainerLow: c.surface,
      surfaceContainer: c.surfaceMuted,
      surfaceContainerHigh: c.surfaceMuted,
      surfaceContainerHighest: c.surfaceMuted,
      outline: c.border,
      outlineVariant: c.border,
    );

    final base = ThemeData(useMaterial3: true, colorScheme: scheme, brightness: b);
    final text = base.textTheme.apply(bodyColor: c.text, displayColor: c.text);
    final radiusMd = BorderRadius.circular(Tokens.radiusMd);
    const minButton = Size(64, Tokens.touchTarget);

    return base.copyWith(
      scaffoldBackgroundColor: c.background,
      textTheme: text.copyWith(
        titleLarge: text.titleLarge?.copyWith(fontWeight: FontWeight.w700, fontSize: Tokens.fontXl),
        titleSmall: text.titleSmall?.copyWith(fontWeight: FontWeight.w600),
        bodySmall: text.bodySmall?.copyWith(color: c.textMuted),
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: c.background,
        foregroundColor: c.text,
        elevation: 0,
        scrolledUnderElevation: 0.5,
        centerTitle: false,
        titleTextStyle: text.titleLarge?.copyWith(fontWeight: FontWeight.w700, fontSize: Tokens.fontXl, color: c.text),
      ),
      cardTheme: CardThemeData(
        color: c.surface,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Tokens.radiusLg), side: BorderSide(color: c.border)),
      ),
      dividerTheme: DividerThemeData(color: c.border, space: 1, thickness: 1),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: c.surface,
        contentPadding: const EdgeInsets.symmetric(horizontal: Tokens.s4, vertical: Tokens.s3 + 2),
        border: OutlineInputBorder(borderRadius: radiusMd, borderSide: BorderSide(color: c.border)),
        enabledBorder: OutlineInputBorder(borderRadius: radiusMd, borderSide: BorderSide(color: c.border)),
        focusedBorder: OutlineInputBorder(borderRadius: radiusMd, borderSide: BorderSide(color: c.focus, width: 2)),
        errorBorder: OutlineInputBorder(borderRadius: radiusMd, borderSide: BorderSide(color: c.danger)),
        focusedErrorBorder: OutlineInputBorder(borderRadius: radiusMd, borderSide: BorderSide(color: c.danger, width: 2)),
        helperMaxLines: 3,
        errorMaxLines: 3,
        labelStyle: TextStyle(color: c.textMuted),
        hintStyle: TextStyle(color: c.textMuted),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: minButton,
          shape: RoundedRectangleBorder(borderRadius: radiusMd),
          textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: Tokens.fontMd),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: minButton,
          shape: RoundedRectangleBorder(borderRadius: radiusMd),
          side: BorderSide(color: c.border),
          textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: Tokens.fontMd),
        ),
      ),
      textButtonTheme: TextButtonThemeData(style: TextButton.styleFrom(minimumSize: const Size(48, Tokens.touchTarget))),
      iconButtonTheme: IconButtonThemeData(style: IconButton.styleFrom(minimumSize: const Size(Tokens.touchTarget, Tokens.touchTarget))),
      chipTheme: base.chipTheme.copyWith(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Tokens.radiusPill), side: BorderSide(color: c.border)),
        side: BorderSide(color: c.border),
        backgroundColor: c.surface,
        selectedColor: scheme.primaryContainer,
        labelStyle: TextStyle(color: c.text),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: c.surface,
        indicatorColor: scheme.primaryContainer,
        height: 68,
        labelTextStyle: WidgetStatePropertyAll(TextStyle(fontSize: Tokens.fontXs, fontWeight: FontWeight.w600, color: c.text)),
      ),
      listTileTheme: ListTileThemeData(minVerticalPadding: Tokens.s3, iconColor: c.textMuted, contentPadding: const EdgeInsets.symmetric(horizontal: Tokens.s4)),
      snackBarTheme: SnackBarThemeData(behavior: SnackBarBehavior.floating, shape: RoundedRectangleBorder(borderRadius: radiusMd)),
      floatingActionButtonTheme: FloatingActionButtonThemeData(
        backgroundColor: c.brand,
        foregroundColor: c.onBrand,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Tokens.radiusLg)),
      ),
      extensions: [AppColors(c)],
    );
  }
}

/// Access to the raw tokens (success/warning/info, muted text…) from widgets.
class AppColors extends ThemeExtension<AppColors> {
  const AppColors(this.c);
  final ColorTokens c;

  @override
  AppColors copyWith({ColorTokens? c}) => AppColors(c ?? this.c);

  @override
  AppColors lerp(ThemeExtension<AppColors>? other, double t) => other is AppColors && t > 0.5 ? other : this;
}

extension ThemeTokens on BuildContext {
  ColorTokens get tokens => Theme.of(this).extension<AppColors>()?.c ?? Tokens.light;
  Brightness get brightness => Theme.of(this).brightness;
}

/// Tabular figures so amounts line up in lists.
const moneyFeatures = [FontFeature.tabularFigures()];
