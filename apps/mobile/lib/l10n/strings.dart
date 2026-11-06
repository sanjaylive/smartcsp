import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';

import '../core/registry/field_validation.dart';
import 'strings.g.dart';

/// Translations backed by lib/l10n/app_{en,hi}.arb (generated into strings.g.dart by
/// tool/sync_l10n.dart). Keys are the shared dotted keys (`service.AEPS.name`), so registry-driven
/// UI can look labels up dynamically.
class AppStrings {
  AppStrings(this.locale) : _dict = locale.languageCode == 'hi' ? stringsHi : stringsEn;

  final Locale locale;
  final Map<String, String> _dict;

  static const supportedLocales = [Locale('en'), Locale('hi')];
  static const delegate = _AppStringsDelegate();

  static AppStrings of(BuildContext context) =>
      Localizations.of<AppStrings>(context, AppStrings) ?? AppStrings(const Locale('en'));

  bool has(String key) => _dict.containsKey(key) || stringsEn.containsKey(key);

  /// Translate with `{placeholder}` interpolation. Unknown keys fall back to English, then to the
  /// key itself (custom-service labels are literal text).
  String t(String key, [Map<String, Object?> vars = const {}]) {
    var s = _dict[key] ?? stringsEn[key] ?? key;
    vars.forEach((k, v) => s = s.replaceAll('{$k}', '${v ?? ''}'));
    return s;
  }

  String issue(ValidationIssue i) => t(i.key, i.vars);

  /// Label for a registry option or field: translation key, or literal text for custom services.
  String label(String keyOrLiteral, {bool literal = false}) => literal ? keyOrLiteral : t(keyOrLiteral);
}

class _AppStringsDelegate extends LocalizationsDelegate<AppStrings> {
  const _AppStringsDelegate();

  @override
  bool isSupported(Locale locale) => ['en', 'hi'].contains(locale.languageCode);

  @override
  Future<AppStrings> load(Locale locale) => SynchronousFuture(AppStrings(locale));

  @override
  bool shouldReload(_AppStringsDelegate old) => false;
}

extension AppStringsContext on BuildContext {
  AppStrings get s => AppStrings.of(this);
}
