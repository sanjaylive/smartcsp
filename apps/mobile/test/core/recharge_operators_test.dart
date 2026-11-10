import 'package:csp2all_mobile/core/registry/services.dart';
import 'package:csp2all_mobile/widgets/operator_badge.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final operator = getService('RECHARGE')!.fields.firstWhere((f) => f.key == 'operator');
  List<String> codes(Map<String, Object?> values) => [for (final o in visibleOptions(operator, values)) o.value];

  test('operator list follows the recharge type', () {
    expect(codes({'rechargeType': 'PREPAID'}), ['AIRTEL', 'JIO', 'VI', 'BSNL', 'OTHER']);
    expect(codes({'rechargeType': 'DTH'}), ['TATA_PLAY', 'DISH_TV', 'AIRTEL_DTH', 'SUN_DIRECT', 'D2H', 'OTHER']);
    expect(codes({'rechargeType': 'FASTAG'}), ['OTHER']);
    expect(codes({}), hasLength(10)); // no type chosen yet: everything
  });

  test('operator badges match registry codes and Pay2All names', () {
    expect(operatorMark('AIRTEL').text, 'A');
    expect(operatorMark('Airtel Digital TV').bg, operatorMark('AIRTEL_DTH').bg);
    expect(operatorMark('Vodafone Idea').text, 'Vi');
    expect(operatorMark('Videocon d2h').text, 'd2h');
    expect(operatorMark('OTHER').text, isEmpty);
    expect(operatorMark('Zing Mobile').text, 'Z');
  });
}
