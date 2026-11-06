import 'package:csp2all_mobile/core/privacy.dart';
import 'package:csp2all_mobile/core/registry/field_validation.dart';
import 'package:csp2all_mobile/core/registry/services.dart';
import 'package:csp2all_mobile/core/status.dart';
import 'package:flutter_test/flutter_test.dart';

/// A Verhoeff-valid 12-digit number starting 2-9 (Aadhaar-like; synthetic test value).
String _aadhaarLike() {
  for (var n = 234123412340; n < 234123412360; n++) {
    if (verhoeffValid('$n')) return '$n';
  }
  throw StateError('no verhoeff number in range');
}

void main() {
  group('sensitive number guard (Aadhaar / card)', () {
    final aadhaar = _aadhaarLike();

    test('detects Verhoeff-valid Aadhaar-like numbers, with or without separators', () {
      expect(detectSensitiveNumber('id $aadhaar'), SensitiveKind.aadhaarNumber);
      final spaced = '${aadhaar.substring(0, 4)} ${aadhaar.substring(4, 8)} ${aadhaar.substring(8)}';
      expect(detectSensitiveNumber(spaced), SensitiveKind.aadhaarNumber);
      final dashed = spaced.replaceAll(' ', '-');
      expect(detectSensitiveNumber(dashed), SensitiveKind.aadhaarNumber);
    });

    test('ignores 12-digit numbers that fail the checksum and shorter numbers', () {
      final bad = '${aadhaar.substring(0, 11)}${(int.parse(aadhaar[11]) + 1) % 10}';
      expect(detectSensitiveNumber(bad), isNull);
      expect(detectSensitiveNumber('9876543210'), isNull); // mobile number
      expect(detectSensitiveNumber('Ramesh Kumar'), isNull);
    });

    test('detects Luhn-valid card numbers', () {
      expect(detectSensitiveNumber('4111 1111 1111 1111'), SensitiveKind.cardNumber);
      expect(detectSensitiveNumber('card 5500-0000-0000-0004 paid'), SensitiveKind.cardNumber);
      expect(detectSensitiveNumber('4111 1111 1111 1112'), isNull);
    });

    test('guarded text fields reject sensitive numbers with a translatable issue', () {
      final dmt = serviceRegistry['DMT']!;
      final sender = dmt.fields.firstWhere((f) => f.key == 'senderName');
      expect(validateField(sender, 'Ram $aadhaar'), const ValidationIssue('validation.aadhaar'));
      expect(validateField(sender, '4111111111111111'), const ValidationIssue('validation.card'));
      expect(validateField(sender, 'Ram Kumar'), isNull);
      // The Aadhaar reference field is guarded too.
      final ref = serviceRegistry['AADHAAR']!.fields.firstWhere((f) => f.key == 'referenceNo');
      expect(ref.guardSensitive, isTrue);
      expect(validateField(ref, aadhaar), const ValidationIssue('validation.aadhaar'));
    });

    test('free text (notes) guard via validateSafeText', () {
      expect(validateSafeText('customer aadhaar $aadhaar', max: 1000), const ValidationIssue('validation.aadhaar'));
      expect(validateSafeText('ok', max: 1000), isNull);
      expect(validateSafeText('x' * 81, max: 80), const ValidationIssue('validation.maxLength', {'max': 80}));
    });
  });

  group('typed field validators', () {
    test('10-digit Indian mobile', () {
      expect(validatePhone('9876543210'), isNull);
      expect(validatePhone('5876543210'), const ValidationIssue('validation.phone'));
      expect(validatePhone('987654321'), const ValidationIssue('validation.phone'));
      expect(validatePhone('+919876543210'), const ValidationIssue('validation.phone'));
      expect(validatePhone('', required: true), const ValidationIssue('common.required'));
      expect(validatePhone(''), isNull);
    });

    test('last 4 digits only', () {
      expect(validateLast4('1234'), isNull);
      expect(validateLast4('12345'), const ValidationIssue('validation.last4'));
      expect(validateLast4('12a4'), const ValidationIssue('validation.last4'));
      expect(validateLast4('', required: true), const ValidationIssue('common.required'));
    });

    test('IFSC (case-insensitive input)', () {
      expect(validateIfsc('SBIN0001234'), isNull);
      expect(validateIfsc('sbin0001234'), isNull);
      expect(validateIfsc('SBIN1001234'), const ValidationIssue('validation.ifsc'));
      expect(validateIfsc('SBI0001234'), const ValidationIssue('validation.ifsc'));
    });

    test('select must be one of the options; date must be ISO', () {
      final recharge = serviceRegistry['RECHARGE']!;
      final op = recharge.fields.firstWhere((f) => f.key == 'operator');
      expect(validateField(op, 'JIO'), isNull);
      expect(validateField(op, 'NOT_AN_OPERATOR'), const ValidationIssue('validation.option'));
      final due = serviceRegistry['BILL_PAYMENT']!.fields.firstWhere((f) => f.key == 'billDueDate');
      expect(validateField(due, '2026-11-31'), const ValidationIssue('validation.date'));
      expect(validateField(due, '2026-11-30'), isNull);
    });
  });

  group('details validation and JSON', () {
    test('DMT requires beneficiary, bank and last-4; reports each field', () {
      final dmt = serviceRegistry['DMT']!;
      final issues = validateDetails(dmt.fields, {'accountLast4': '123456'});
      expect(issues.keys, containsAll(['beneficiaryName', 'bankName', 'accountLast4']));
      expect(issues['accountLast4'], const ValidationIssue('validation.last4'));
    });

    test('buildDetailsJson keeps only known keys, drops empty optionals, normalises IFSC', () {
      final dmt = serviceRegistry['DMT']!;
      final json = buildDetailsJson(dmt.fields, {
        'beneficiaryName': '  Sita ',
        'bankName': 'Demo Bank',
        'accountLast4': '1234',
        'ifsc': 'sbin0001234',
        'senderMobile': '',
        'smuggled': 'x',
      });
      expect(json, {'beneficiaryName': 'Sita', 'bankName': 'Demo Bank', 'accountLast4': '1234', 'ifsc': 'SBIN0001234'});
    });

    test('checklist items are validated and serialised', () {
      final doc = serviceRegistry['DOCUMENT']!;
      final f = doc.fields.firstWhere((x) => x.key == 'checklist');
      expect(validateField(f, [const ChecklistItem('Photo', true)]), isNull);
      expect(validateField(f, [ChecklistItem('aadhaar ${_aadhaarLike()}', false)]), const ValidationIssue('validation.aadhaar'));
      expect(buildDetailsJson([f], {'checklist': [const ChecklistItem(' Photo ', true)]}), {
        'checklist': [
          {'label': 'Photo', 'done': true},
        ],
      });
    });

    test('custom service fields are bounded and guarded', () {
      final defs = customFieldsToFieldDefs([
        {'key': 'pages', 'label': 'Pages', 'type': 'number', 'required': true},
        {'key': 'note', 'label': 'Note', 'type': 'text'},
        {'key': 'evil', 'label': 'Eval', 'type': 'script'}, // unknown type is dropped
      ]);
      expect(defs.map((d) => d.key), ['pages', 'note']);
      expect(defs[1].guardSensitive, isTrue);
      expect(defs[1].literalLabel, isTrue);
      expect(validateField(defs[0], '-1'), const ValidationIssue('validation.number'));
      expect(buildDetailsJson(defs, {'pages': '12'}), {'pages': 12});
    });
  });

  group('registry & status rules', () {
    test('registry covers every service code with matching codes', () {
      for (final c in serviceCodes) {
        expect(serviceRegistry[c]?.code, c);
      }
    });

    test('AEPS principal direction follows the operation', () {
      final aeps = serviceRegistry['AEPS']!;
      expect(aeps.direction({'operationType': 'CASH_WITHDRAWAL'}), PrincipalDirection.payout);
      expect(aeps.direction({'operationType': 'CASH_DEPOSIT'}), PrincipalDirection.collect);
      expect(aeps.direction({'operationType': 'BALANCE_ENQUIRY'}), PrincipalDirection.none);
    });

    test('AEPS, MicroATM and Aadhaar carry privacy notices', () {
      expect(serviceRegistry['AEPS']!.noticeKey, 'notice.aeps');
      expect(serviceRegistry['MICRO_ATM']!.noticeKey, 'notice.microatm');
      expect(serviceRegistry['AADHAAR']!.noticeKey, 'notice.aadhaar');
    });

    test('transitions and reason rules mirror the server', () {
      expect(allowedTransitions(WorkflowType.transaction, 'SUCCESSFUL'), ['FAILED']);
      expect(allowedTransitions(WorkflowType.application, 'REJECTED'), ['SUBMITTED']);
      expect(transitionNeedsReason('SUCCESSFUL', 'FAILED'), isTrue);
      expect(transitionNeedsReason('PENDING', 'SUCCESSFUL'), isFalse);
      expect(transitionNeedsReason('SUBMITTED', 'CANCELLED'), isTrue);
    });

    test('receivable and cash effect mirror posting.ts', () {
      expect(receivableFor(PrincipalDirection.collect, 500000, 2000), 502000);
      expect(receivableFor(PrincipalDirection.payout, 500000, 2000), 2000);
      expect(
        cashEffect(direction: PrincipalDirection.payout, principal: 500000, collected: 2000, paymentMethod: 'CASH', principalMethod: 'CASH'),
        -498000,
      );
    });
  });
}
