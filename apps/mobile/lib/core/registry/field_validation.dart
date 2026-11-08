// Client-side mirror of `buildDetailsSchema` in packages/shared/src/services.ts. The API is
// authoritative; this only gives the operator early, translated feedback.
import 'package:flutter/foundation.dart';

import '../dates.dart';
import '../privacy.dart';
import 'services.dart';

@immutable
class ValidationIssue {
  const ValidationIssue(this.key, [this.vars = const {}]);

  /// Translation key, e.g. `validation.phone`.
  final String key;
  final Map<String, Object> vars;

  @override
  bool operator ==(Object other) => other is ValidationIssue && other.key == key && mapEquals(other.vars, vars);

  @override
  int get hashCode => Object.hash(key, Object.hashAll(vars.entries.map((e) => '${e.key}=${e.value}')));

  @override
  String toString() => 'ValidationIssue($key, $vars)';
}

final RegExp phonePattern = RegExp(r'^[6-9]\d{9}$');
final RegExp accountNumberPattern = RegExp(r'^\d{9,18}$');
final RegExp ifscPattern = RegExp(r'^[A-Z]{4}0[A-Z0-9]{6}$');
final RegExp emailPattern = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]{2,}$');

/// Free-text guard shared by names, notes and guarded fields.
ValidationIssue? sensitiveIssue(String? text) => switch (detectSensitiveNumber(text)) {
      SensitiveKind.aadhaarNumber => const ValidationIssue('validation.aadhaar'),
      SensitiveKind.cardNumber => const ValidationIssue('validation.card'),
      null => null,
    };

ValidationIssue? validatePhone(String? v, {bool required = false}) {
  final s = (v ?? '').trim();
  if (s.isEmpty) return required ? const ValidationIssue('common.required') : null;
  return phonePattern.hasMatch(s) ? null : const ValidationIssue('validation.phone');
}

ValidationIssue? validateAccountNumber(String? v, {bool required = false}) {
  final s = (v ?? '').replaceAll(RegExp(r'[\s-]'), '');
  if (s.isEmpty) return required ? const ValidationIssue('common.required') : null;
  return accountNumberPattern.hasMatch(s) ? null : const ValidationIssue('validation.accountNumber');
}

ValidationIssue? validateIfsc(String? v, {bool required = false}) {
  final s = (v ?? '').trim().toUpperCase();
  if (s.isEmpty) return required ? const ValidationIssue('common.required') : null;
  return ifscPattern.hasMatch(s) ? null : const ValidationIssue('validation.ifsc');
}

ValidationIssue? validateEmail(String? v) {
  final s = (v ?? '').trim();
  if (s.isEmpty || s.length > 254 || !emailPattern.hasMatch(s)) return const ValidationIssue('validation.email');
  return null;
}

/// Free text with a max length and the Aadhaar/card guard (shared `safeText`).
ValidationIssue? validateSafeText(String? v, {int max = 120, int min = 0, bool required = false}) {
  final s = (v ?? '').trim();
  if (s.isEmpty) return required || min > 0 ? const ValidationIssue('common.required') : null;
  if (s.length < min) return ValidationIssue('validation.minLength', {'min': min});
  if (s.length > max) return ValidationIssue('validation.maxLength', {'max': max});
  return sensitiveIssue(s);
}

bool _isEmpty(Object? v) => v == null || (v is String && v.trim().isEmpty) || (v is List && v.isEmpty);

/// Validates one field value as entered on the form.
ValidationIssue? validateField(FieldDef f, Object? value) {
  if (_isEmpty(value)) {
    if (f.type == FieldType.boolean || f.type == FieldType.checklist) return null;
    return f.required ? const ValidationIssue('common.required') : null;
  }
  switch (f.type) {
    case FieldType.text:
      final s = value.toString().trim();
      final max = f.maxLength ?? 120;
      if (s.length > max) return ValidationIssue('validation.maxLength', {'max': max});
      return f.guardSensitive ? sensitiveIssue(s) : null;
    case FieldType.number:
      final n = value is num ? value : num.tryParse(value.toString().trim());
      if (n == null || n.isNaN || n.isInfinite || n < 0 || n > 1e12) return const ValidationIssue('validation.number');
      return null;
    case FieldType.date:
      return isIsoDate(value.toString()) ? null : const ValidationIssue('validation.date');
    case FieldType.select:
      return f.options.any((o) => o.value == value) ? null : const ValidationIssue('validation.option');
    case FieldType.phone:
      return validatePhone(value.toString(), required: f.required);
    case FieldType.account:
      return validateAccountNumber(value.toString(), required: f.required);
    case FieldType.ifsc:
      return validateIfsc(value.toString(), required: f.required);
    case FieldType.checklist:
      if (value is! List) return const ValidationIssue('validation.option');
      if (value.length > 20) return const ValidationIssue('validation.maxLength', {'max': 20});
      for (final item in value) {
        final label = item is ChecklistItem ? item.label : (item is Map ? item['label']?.toString() : null);
        final issue = validateSafeText(label, max: 60, required: true);
        if (issue != null) return issue;
      }
      return null;
    case FieldType.boolean:
      return value is bool ? null : const ValidationIssue('validation.option');
  }
}

@immutable
class ChecklistItem {
  const ChecklistItem(this.label, this.done);
  final String label;
  final bool done;

  Map<String, Object> toJson() => {'label': label.trim(), 'done': done};

  static ChecklistItem fromJson(Object? j) =>
      j is Map ? ChecklistItem(j['label']?.toString() ?? '', j['done'] == true) : const ChecklistItem('', false);
}

/// Validates all fields; returns issues keyed by field key (empty when valid).
Map<String, ValidationIssue> validateDetails(List<FieldDef> fields, Map<String, Object?> values) {
  final out = <String, ValidationIssue>{};
  for (final f in fields) {
    final issue = validateField(f, values[f.key]);
    if (issue != null) out[f.key] = issue;
  }
  return out;
}

/// Builds the `details` JSON object for the API: only known keys, empty optionals omitted,
/// values normalised to the types the strict server schema expects.
Map<String, Object?> buildDetailsJson(List<FieldDef> fields, Map<String, Object?> values) {
  final out = <String, Object?>{};
  for (final f in fields) {
    final v = values[f.key];
    if (_isEmpty(v) && f.type != FieldType.boolean) continue;
    switch (f.type) {
      case FieldType.text:
      case FieldType.phone:
      case FieldType.date:
      case FieldType.select:
        out[f.key] = v.toString().trim();
      case FieldType.account:
        out[f.key] = v.toString().replaceAll(RegExp(r'[\s-]'), '');
      case FieldType.ifsc:
        out[f.key] = v.toString().trim().toUpperCase();
      case FieldType.number:
        out[f.key] = v is num ? v : num.tryParse(v.toString().trim());
      case FieldType.checklist:
        out[f.key] = [
          for (final i in (v as List)) (i is ChecklistItem ? i : ChecklistItem.fromJson(i)).toJson(),
        ];
      case FieldType.boolean:
        if (v is bool) out[f.key] = v;
    }
  }
  return out;
}
