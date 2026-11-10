import 'package:csp2all_mobile/core/upi.dart';
import 'package:csp2all_mobile/data/models/tenant_models.dart';
import 'package:csp2all_mobile/features/payments/payment_accounts_screen.dart';
import 'package:csp2all_mobile/features/records/record_form_screen.dart';
import 'package:csp2all_mobile/l10n/strings.dart';
import 'package:csp2all_mobile/state/providers.dart';
import 'package:csp2all_mobile/theme/app_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../helpers.dart';

Future<void> pumpFor(WidgetTester tester, [int frames = 10]) async {
  for (var i = 0; i < frames; i++) {
    await tester.pump(const Duration(milliseconds: 50));
  }
}

const _upi = {
  'id': 'acc-upi-1',
  'kind': 'UPI',
  'label': 'PhonePe counter',
  'upiId': 'myshop@ybl',
  'upiApp': 'PHONEPE',
  'payeeName': 'My Shop',
  'qrAttachmentId': null,
  'isDefault': true,
  'active': true,
  'version': 0,
};
const _bank = {
  'id': 'acc-bank-1',
  'kind': 'BANK',
  'label': 'SBI current',
  'holderName': 'MY SHOP',
  'bankName': 'State Bank of India',
  'accountNumber': '309123456743',
  'ifsc': 'SBIN0001234',
  'accountType': 'CURRENT',
  'isDefault': true,
  'active': true,
  'version': 0,
};

Map<String, Object?> _context({bool rechargeLive = false}) {
  final j = contextJson(permissions: const ['records.view', 'records.create', 'records.post', 'customers.view', 'customers.manage', 'settings.manage']);
  j['services'] = [
    for (final s in (j['services'] as List).cast<Map<String, Object?>>())
      {...s, 'providerExecution': {'available': rechargeLive && s['code'] == 'RECHARGE', 'reason': null}},
  ];
  return j;
}

Future<void> pumpApp(WidgetTester tester, FakeAdapter adapter, Widget home, {bool rechargeLive = false}) async {
  tester.view.physicalSize = const Size(1200, 6000);
  tester.view.devicePixelRatio = 1.5;
  addTearDown(tester.view.reset);
  final services = await testServices(adapter, initialTokens: tokens('1'));
  final router = GoRouter(routes: [
    GoRoute(path: '/', builder: (_, _) => home),
    GoRoute(path: '/records/:id', builder: (_, s) => Scaffold(body: Text('detail ${s.pathParameters['id']}'))),
  ]);
  await tester.pumpWidget(ProviderScope(
    overrides: [
      servicesProvider.overrideWithValue(services),
      tenantContextProvider.overrideWith((ref) async => TenantContext.fromJson(_context(rechargeLive: rechargeLive))),
    ],
    retry: (_, _) => null,
    child: Consumer(builder: (context, ref, _) {
      ref.watch(syncProvider);
      return MaterialApp.router(
        theme: AppTheme.light(),
        supportedLocales: AppStrings.supportedLocales,
        localizationsDelegates: const [AppStrings.delegate, GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate, GlobalCupertinoLocalizations.delegate],
        routerConfig: router,
      );
    }),
  ));
  await pumpFor(tester);
}

Map<String, Object?> _record({String service = 'DMT'}) => {...recordJson(no: 7, id: 'rec-7'), 'serviceCode': service};

void main() {
  test('UPI link carries payee, amount and currency', () {
    expect(upiPaymentUri(upiId: 'my.shop@ybl', payeeName: 'My Shop', amountPaise: 19950),
        'upi://pay?pa=my.shop%40ybl&pn=My%20Shop&am=199.50&cu=INR');
    expect(upiIdPattern.hasMatch('9876543210@paytm'), isTrue);
    expect(upiIdPattern.hasMatch('not-an-upi'), isFalse);
  });

  testWidgets('collecting by UPI shows the shop QR with the amount and saves the account on the record', (tester) async {
    final adapter = FakeAdapter((req) {
      if (req.path == '/v1/auth/me') return FakeResponse(200, meJson());
      if (req.path == '/v1/payment-accounts') return FakeResponse(200, {'items': [_upi, _bank]});
      if (req.path == '/v1/records' && req.method == 'POST') return FakeResponse(200, _record());
      return apiError(404, 'NOT_FOUND');
    });
    await pumpApp(tester, adapter, const RecordFormScreen(serviceCode: 'DMT'));

    await tester.enterText(find.byKey(const Key('field.beneficiaryName')), 'Sita Devi');
    await tester.enterText(find.byKey(const Key('field.bankName')), 'Demo Bank');
    await tester.enterText(find.byKey(const Key('field.accountNumber')), '501002345674321');
    await tester.enterText(find.byKey(const Key('record.principalPaise')), '1000');
    await tester.enterText(find.byKey(const Key('record.customerFeePaise')), '10');
    await tester.tap(find.byKey(const Key('record.paymentMethod')));
    await pumpFor(tester, 4);
    await tester.tap(find.text('UPI').last);
    await pumpFor(tester, 10);

    expect(find.byKey(const Key('record.collectPanel')), findsOneWidget);
    expect(find.byType(QrImageView), findsOneWidget);
    final qr = tester.widget<QrImageView>(find.byType(QrImageView));
    expect(qr.semanticsLabel, isNotNull);
    expect(find.text('myshop@ybl'), findsOneWidget);

    await tester.tap(find.byKey(const Key('record.save')));
    await pumpFor(tester, 20);
    final body = adapter.to('POST', '/v1/records').single.data as Map;
    expect(body['paymentMethod'], 'UPI');
    expect(body['amountCollectedPaise'], 101000);
    expect(body['paymentAccountId'], 'acc-upi-1');
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('Live recharge: number finds the operator, confirm sends it to Pay2All, result opens the record', (tester) async {
    final adapter = FakeAdapter((req) {
      if (req.path == '/v1/auth/me') return FakeResponse(200, meJson());
      if (req.path == '/v1/payment-accounts') return FakeResponse(200, {'items': <Object>[]});
      if (req.path == '/v1/pay2all/providers') {
        return FakeResponse(200, {
          'services': [
            {
              'service_id': 1,
              'service': 'Prepaid Mobile',
              'providers': [
                {'provider_id': 11, 'name': 'Jio'},
                {'provider_id': 12, 'name': 'Airtel'},
              ],
            },
          ],
        });
      }
      if (req.path == '/v1/pay2all/lookup') return FakeResponse(200, {'provider_id': 12, 'provider_name': 'Airtel', 'circle_id': '5', 'circle_name': 'Bihar'});
      if (req.path == '/v1/provider-operations' && req.method == 'POST') {
        return FakeResponse(200, {
          'id': 'op-1',
          'mode': 'LIVE',
          'status': 'CONFIRMED',
          'outcomeKnown': true,
          'message': null,
          'providerRef': 'P2A99',
          'record': _record(service: 'RECHARGE'),
        });
      }
      return apiError(404, 'NOT_FOUND');
    });
    await pumpApp(tester, adapter, const RecordFormScreen(serviceCode: 'RECHARGE'), rechargeLive: true);

    expect(find.byKey(const Key('record.liveSwitch')), findsOneWidget);
    expect(find.byKey(const Key('record.status')), findsNothing); // the provider decides the status

    await tester.enterText(find.byKey(const Key('live.number')), '7012345678');
    await pumpFor(tester, 10);
    expect(find.text('Detected: Airtel · Bihar'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('record.principalPaise')), '199');
    await pumpFor(tester, 2);

    await tester.tap(find.byKey(const Key('live.send')));
    await pumpFor(tester, 6);
    expect(adapter.to('POST', '/v1/provider-operations'), isEmpty); // confirmation first
    await tester.tap(find.byKey(const Key('live.confirm')));
    await pumpFor(tester, 10);

    final posts = adapter.to('POST', '/v1/provider-operations');
    expect(posts, hasLength(1));
    final body = posts.single.data as Map;
    expect(body['confirmed'], true);
    expect(body['principalPaise'], 19900);
    expect(body['live'], {'providerId': 12, 'mobile': '7012345678'});
    expect((body['details'] as Map)['operator'], 'AIRTEL');
    expect((body['details'] as Map)['subscriberNumber'], '7012345678');
    expect(body.containsKey('post'), isFalse);
    expect(posts.single.headers['Idempotency-Key'], isNotEmpty);

    expect(find.byKey(const Key('live.result')), findsOneWidget);
    expect(find.text('Pay2All ref P2A99'), findsOneWidget);
    await tester.tap(find.text('View record #7'));
    await pumpFor(tester, 10);
    expect(find.text('detail rec-7'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('Payment accounts: lists UPI and bank; adds a UPI ID', (tester) async {
    final adapter = FakeAdapter((req) {
      if (req.path == '/v1/auth/me') return FakeResponse(200, meJson());
      if (req.path == '/v1/payment-accounts' && req.method == 'GET') return FakeResponse(200, {'items': [_upi, _bank]});
      if (req.path == '/v1/payment-accounts' && req.method == 'POST') return FakeResponse(200, {..._upi, 'id': 'acc-upi-2', 'label': 'Paytm'});
      if (req.path == '/v1/beneficiaries/verify') return FakeResponse(200, {'available': false});
      return apiError(404, 'NOT_FOUND');
    });
    await pumpApp(tester, adapter, const PaymentAccountsScreen());

    expect(find.text('PhonePe counter'), findsOneWidget);
    expect(find.text('SBI current'), findsOneWidget);
    expect(find.text('••••6743 · SBIN0001234'), findsOneWidget);

    await tester.tap(find.byKey(const Key('pay.addUpi')));
    await pumpFor(tester, 10);
    await tester.tap(find.text('Paytm'));
    await tester.enterText(find.byKey(const Key('pay.upiId')), 'bad id');
    await tester.tap(find.byKey(const Key('pay.save')));
    await pumpFor(tester, 4);
    expect(find.text('Enter a valid UPI ID, e.g. myshop@ybl'), findsOneWidget);
    expect(adapter.to('POST', '/v1/payment-accounts'), isEmpty);

    await tester.enterText(find.byKey(const Key('pay.upiId')), 'Shop@Paytm');
    await tester.tap(find.byKey(const Key('pay.save')));
    await pumpFor(tester, 10);
    final body = adapter.to('POST', '/v1/payment-accounts').single.data as Map;
    expect(body, containsPair('kind', 'UPI'));
    expect(body, containsPair('upiId', 'shop@paytm'));
    expect(body, containsPair('upiApp', 'PAYTM'));
    expect(body, containsPair('label', 'Paytm'));
    await tester.pumpWidget(const SizedBox());
  });
}
