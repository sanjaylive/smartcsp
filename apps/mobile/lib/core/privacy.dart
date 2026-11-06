/// Guards against accidentally entering sensitive identifiers in free text — a port of
/// packages/shared/src/privacy.ts. CSP2All does not store Aadhaar numbers, card numbers, CVV,
/// PINs or biometric data. The API re-validates; this gives immediate feedback on the form.
library;

enum SensitiveKind { aadhaarNumber, cardNumber }

bool luhnValid(String digits) {
  var sum = 0;
  var dbl = false;
  for (var i = digits.length - 1; i >= 0; i--) {
    var d = digits.codeUnitAt(i) - 48;
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 == 0;
}

const _vd = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const _vp = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7], [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

/// Verhoeff checksum (used by Aadhaar numbers).
bool verhoeffValid(String digits) {
  var c = 0;
  final rev = digits.split('').reversed.toList();
  for (var i = 0; i < rev.length; i++) {
    c = _vd[c][_vp[i % 8][int.parse(rev[i])]];
  }
  return c == 0;
}

/// 12-digit groups (Aadhaar-like), optionally separated by spaces or hyphens.
final RegExp _aadhaarLike = RegExp(r'(?<!\d)[2-9]\d{3}[\s-]?\d{4}[\s-]?\d{4}(?!\d)');

/// 13–19 digit runs (card-like), optionally separated.
final RegExp _cardLike = RegExp(r'(?<!\d)(?:\d[\s-]?){13,19}(?!\d)');

/// Apply to free text (notes, names, custom text fields) — not to reference fields, since bank
/// RRN/UTR references are also 12 digits.
SensitiveKind? detectSensitiveNumber(String? text) {
  if (text == null || text.isEmpty) return null;
  for (final m in _aadhaarLike.allMatches(text)) {
    if (verhoeffValid(m.group(0)!.replaceAll(RegExp(r'\D'), ''))) return SensitiveKind.aadhaarNumber;
  }
  for (final m in _cardLike.allMatches(text)) {
    final digits = m.group(0)!.replaceAll(RegExp(r'\D'), '');
    if (digits.length >= 13 && digits.length <= 19 && luhnValid(digits)) return SensitiveKind.cardNumber;
  }
  return null;
}

/// "9876543210" -> "******3210"
String? maskIdentifier(String? value, {int visible = 4}) {
  if (value == null || value.isEmpty) return value;
  if (value.length <= visible) return '*' * value.length;
  final stars = value.length - visible < 6 ? value.length - visible : 6;
  return '*' * stars + value.substring(value.length - visible);
}

/// Masked values from the API contain asterisks.
bool looksMasked(Object? v) => v is String && v.contains('*');
