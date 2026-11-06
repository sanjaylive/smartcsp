import 'package:csp2all_mobile/core/dates.dart';
import 'package:csp2all_mobile/core/money.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('parseRupeesToPaise', () {
    test('parses plain, grouped, symbol and decimal input with string arithmetic', () {
      expect(parseRupeesToPaise('500'), 50000);
      expect(parseRupeesToPaise('500.5'), 50050);
      expect(parseRupeesToPaise('500.05'), 50005);
      expect(parseRupeesToPaise('1,23,456.78'), 12345678);
      expect(parseRupeesToPaise('₹ 1,000'), 100000);
      expect(parseRupeesToPaise('Rs. 99.99'), 9999);
      expect(parseRupeesToPaise('rs 10'), 1000);
      expect(parseRupeesToPaise('0'), 0);
      expect(parseRupeesToPaise('.5'), isNull);
      expect(parseRupeesToPaise('10.'), 1000);
    });

    test('never introduces floating point error', () {
      // 0.1 + 0.2 style values that break doubles.
      expect(parseRupeesToPaise('0.29'), 29);
      expect(parseRupeesToPaise('1.13'), 113);
      expect(parseRupeesToPaise('4.35'), 435);
      expect(parseRupeesToPaise('1000000.07'), 100000007);
    });

    test('rejects invalid input', () {
      for (final bad in ['', ' ', 'abc', '-5', '1.234', '1.2.3', '1e5', '12a', '₹']) {
        expect(parseRupeesToPaise(bad), isNull, reason: bad);
      }
      expect(parseRupeesToPaise('99999999999999'), isNull); // > 13 integer digits
    });
  });

  group('formatInr', () {
    test('uses Indian digit grouping', () {
      expect(formatInr(0), '₹0.00');
      expect(formatInr(5), '₹0.05');
      expect(formatInr(100), '₹1.00');
      expect(formatInr(99999), '₹999.99');
      expect(formatInr(100000), '₹1,000.00');
      expect(formatInr(12345678), '₹1,23,456.78');
      expect(formatInr(123456789), '₹12,34,567.89');
      expect(formatInr(10000000000), '₹10,00,00,000.00');
    });

    test('options: no symbol, signed, negative with true minus, compact decimals', () {
      expect(formatInr(123456, symbol: false), '1,234.56');
      expect(formatInr(50000, signed: true), '+₹500.00');
      expect(formatInr(-50000), '−₹500.00');
      expect(formatInr(50000, decimals: false), '₹500');
      expect(formatInr(50050, decimals: false), '₹500.50');
    });

    test('round-trips with the parser', () {
      for (final p in [0, 1, 99, 100, 123456, 987654321, maxPaise]) {
        expect(parseRupeesToPaise(formatInr(p)), p);
        expect(parseRupeesToPaise(paiseToInput(p).isEmpty ? '0' : paiseToInput(p)), p);
      }
    });
  });

  group('dates', () {
    test('isIsoDate validates calendar dates', () {
      expect(isIsoDate('2026-11-06'), isTrue);
      expect(isIsoDate('2024-02-29'), isTrue);
      expect(isIsoDate('2026-02-29'), isFalse);
      expect(isIsoDate('2026-13-01'), isFalse);
      expect(isIsoDate('06-11-2026'), isFalse);
    });

    test('formatDate shows "06 Nov 2026"', () {
      expect(formatDate('2026-11-06'), '06 Nov 2026');
      expect(formatDate('2026-01-31'), '31 Jan 2026');
      expect(formatDate('not a date'), 'not a date');
    });

    test('business dates use Asia/Kolkata (UTC+05:30)', () {
      // 20:00 UTC on 5 Nov is 01:30 on 6 Nov in India.
      expect(localDate(DateTime.utc(2026, 11, 5, 20, 0)), '2026-11-06');
      expect(localDate(DateTime.utc(2026, 11, 5, 18, 29)), '2026-11-05');
      expect(formatDateTime('2026-11-06T08:35:00.000Z'), '06 Nov 2026, 14:05');
    });

    test('addDays crosses month and year boundaries', () {
      expect(addDays('2026-12-31', 1), '2027-01-01');
      expect(addDays('2026-03-01', -1), '2026-02-28');
    });
  });
}
