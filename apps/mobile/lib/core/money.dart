/// Money is always integer paise (1 INR = 100 paise). Doubles are never used for money.
library;

/// ₹1 lakh crore — far above any CSP value, well inside 2^53 (safe for JSON numbers).
const int maxPaise = 10000000000000; // 1e13 paise

bool isValidPaise(Object? v) => v is int && v >= 0 && v <= maxPaise;

final RegExp _amountPattern = RegExp(r'^\d{1,13}(\.\d{0,2})?$');

/// Parses user input such as "1,23,456.5", "₹ 500", "Rs. 500.05" into paise using string
/// arithmetic. Returns null for invalid input, negative values or more than 2 decimals.
int? parseRupeesToPaise(String input) {
  var cleaned = input.replaceAll(RegExp(r'[₹,\s]'), '');
  cleaned = cleaned.replaceFirst(RegExp(r'^Rs\.?', caseSensitive: false), '');
  if (!_amountPattern.hasMatch(cleaned)) return null;
  final parts = cleaned.split('.');
  final whole = int.parse(parts[0]);
  final frac = parts.length > 1 ? '${parts[1]}00'.substring(0, 2) : '00';
  final paise = whole * 100 + int.parse(frac);
  return paise <= maxPaise ? paise : null;
}

String _groupIndian(String whole) {
  if (whole.length <= 3) return whole;
  final last3 = whole.substring(whole.length - 3);
  var rest = whole.substring(0, whole.length - 3);
  final groups = <String>[];
  while (rest.length > 2) {
    groups.insert(0, rest.substring(rest.length - 2));
    rest = rest.substring(0, rest.length - 2);
  }
  if (rest.isNotEmpty) groups.insert(0, rest);
  return '${groups.join(',')},$last3';
}

/// formatInr(12345678) => "₹1,23,456.78". Negative values use a true minus sign (U+2212).
String formatInr(int paise, {bool symbol = true, bool decimals = true, bool signed = false}) {
  final neg = paise < 0;
  final abs = neg ? -paise : paise;
  final whole = (abs ~/ 100).toString();
  final frac = (abs % 100).toString().padLeft(2, '0');
  final body = _groupIndian(whole) + (decimals || frac != '00' ? '.$frac' : '');
  final sign = neg ? '−' : (signed && paise > 0 ? '+' : '');
  return '$sign${symbol ? '₹' : ''}$body';
}

/// Plain editable value for a text field: 12345 => "123.45", 10000 => "100".
String paiseToInput(int paise) {
  if (paise == 0) return '';
  final whole = paise ~/ 100;
  final frac = paise % 100;
  return frac == 0 ? '$whole' : '$whole.${frac.toString().padLeft(2, '0')}';
}

int sumPaise(Iterable<int> values) => values.fold(0, (a, b) => a + b);
