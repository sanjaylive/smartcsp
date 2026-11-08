import 'package:csp2all_mobile/core/privacy.dart';
import 'package:csp2all_mobile/data/local/draft_store.dart';
import 'package:csp2all_mobile/data/models/tenant_models.dart';
import 'package:csp2all_mobile/features/records/record_form_screen.dart';
import 'package:csp2all_mobile/l10n/strings.dart';
import 'package:csp2all_mobile/l10n/strings.g.dart';
import 'package:csp2all_mobile/state/providers.dart';
import 'package:csp2all_mobile/theme/app_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import '../helpers.dart';

Future<void> pumpFor(WidgetTester tester, [int frames = 10]) async {
  for (var i = 0; i < frames; i++) {
    await tester.pump(const Duration(milliseconds: 50));
  }
}

Future<AppServicesHarness> pumpForm(WidgetTester tester, FakeAdapter adapter, {String service = 'DMT', String lang = 'en'}) async {
  tester.view.physicalSize = const Size(1200, 6000);
  tester.view.devicePixelRatio = 1.5;
  addTearDown(tester.view.reset);
  final services = await testServices(adapter, initialTokens: tokens('1'), prefs: {'settings.language': lang});
  final router = GoRouter(routes: [
    GoRoute(path: '/', builder: (_, _) => RecordFormScreen(serviceCode: service)),
    GoRoute(path: '/records/:id', builder: (_, s) => Scaffold(body: Text('detail ${s.pathParameters['id']}'))),
    GoRoute(path: '/drafts', builder: (_, _) => const Scaffold(body: Text('drafts screen'))),
  ]);
  await tester.pumpWidget(ProviderScope(
    overrides: [
      servicesProvider.overrideWithValue(services),
      tenantContextProvider.overrideWith((ref) async => TenantContext.fromJson(contextJson())),
    ],
    retry: (_, _) => null,
    child: Consumer(builder: (context, ref, _) {
      final settings = ref.watch(settingsProvider);
      ref.watch(syncProvider); // as in CspApp: keeps the sync coordinator (and auth) alive
      return MaterialApp.router(
        theme: AppTheme.light(),
        locale: settings.locale,
        supportedLocales: AppStrings.supportedLocales,
        localizationsDelegates: const [AppStrings.delegate, GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate, GlobalCupertinoLocalizations.delegate],
        routerConfig: router,
      );
    }),
  ));
  await pumpFor(tester);
  return AppServicesHarness(services);
}

class AppServicesHarness {
  AppServicesHarness(this.services);
  final AppServices services;
}

String _aadhaarLike() {
  for (var n = 234123412340; n < 234123412360; n++) {
    if (verhoeffValid('$n')) return '$n';
  }
  throw StateError('none');
}

FakeAdapter _server({bool offline = false}) => FakeAdapter((req) {
      if (req.path == '/v1/auth/me') return FakeResponse(200, meJson());
      if (req.path == '/v1/records' && req.method == 'POST') {
        if (offline) return const FakeResponse(0, null);
        return FakeResponse(200, recordJson(no: 101, id: 'rec-101'));
      }
      return apiError(404, 'NOT_FOUND');
    });

void main() {
  testWidgets('renders registry fields + notice; validates last-4 and the Aadhaar guard before any API call', (tester) async {
    final adapter = _server();
    await pumpForm(tester, adapter);

    expect(find.text('New Money Transfer (DMT) record'), findsOneWidget);
    expect(find.byKey(const Key('field.beneficiaryName')), findsOneWidget);
    expect(find.byKey(const Key('field.accountNumber')), findsOneWidget);
    expect(find.byKey(const Key('field.ifsc')), findsOneWidget);

    await tester.enterText(find.byKey(const Key('field.senderName')), 'Ram ${_aadhaarLike()}');
    await tester.enterText(find.byKey(const Key('field.accountNumber')), '12');
    await tester.tap(find.byKey(const Key('record.save')));
    await pumpFor(tester);

    expect(find.text('Do not enter Aadhaar numbers. CSP2All does not store them.'), findsOneWidget);
    expect(find.text('Enter the full account number (9–18 digits)'), findsOneWidget);
    expect(find.text('Required'), findsNWidgets(2)); // beneficiary + bank
    expect(adapter.to('POST', '/v1/records'), isEmpty);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('valid submit sends paise, clientRef and Idempotency-Key once, then opens the record', (tester) async {
    final adapter = _server();
    await pumpForm(tester, adapter);

    await tester.enterText(find.byKey(const Key('record.walkIn')), 'Ramesh');
    await tester.enterText(find.byKey(const Key('field.beneficiaryName')), 'Sita Devi');
    await tester.enterText(find.byKey(const Key('field.bankName')), 'Demo Gramin Bank');
    await tester.enterText(find.byKey(const Key('field.accountNumber')), '501002345674321');
    await tester.enterText(find.byKey(const Key('field.ifsc')), 'sbin0001234');
    await tester.enterText(find.byKey(const Key('record.principalPaise')), '5,000.50');
    await tester.enterText(find.byKey(const Key('record.customerFeePaise')), '20');
    await pumpFor(tester, 2);
    // "Amount collected now" follows what the customer owes: 5000.50 + 20.
    expect(find.text('₹5,020.50'), findsWidgets);

    await tester.tap(find.byKey(const Key('record.save')));
    await pumpFor(tester, 20);

    final posts = adapter.to('POST', '/v1/records');
    expect(posts, hasLength(1));
    final body = posts.single.data as Map;
    expect(body['serviceCode'], 'DMT');
    expect(body['principalPaise'], 500050);
    expect(body['customerFeePaise'], 2000);
    expect(body['amountCollectedPaise'], 502050);
    expect(body['opStatus'], 'SUCCESSFUL');
    expect(body['walkInName'], 'Ramesh');
    expect(body['details'], {'beneficiaryName': 'Sita Devi', 'bankName': 'Demo Gramin Bank', 'accountNumber': '501002345674321', 'ifsc': 'SBIN0001234'});
    expect((body['clientRef'] as String).length, greaterThanOrEqualTo(8));
    expect(posts.single.headers['Idempotency-Key'], isNotEmpty);
    expect(find.text('detail rec-101'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('network failure keeps the work as a device draft with the same clientRef', (tester) async {
    final adapter = _server(offline: true);
    final h = await pumpForm(tester, adapter);

    await tester.enterText(find.byKey(const Key('field.beneficiaryName')), 'Sita');
    await tester.enterText(find.byKey(const Key('field.bankName')), 'Demo Bank');
    await tester.enterText(find.byKey(const Key('field.accountNumber')), '123456789012');
    await tester.enterText(find.byKey(const Key('record.customerFeePaise')), '10');
    await tester.tap(find.byKey(const Key('record.save')));
    await pumpFor(tester, 20);

    final sentRef = (adapter.to('POST', '/v1/records').first.data as Map)['clientRef'];
    final drafts = await h.services.drafts.list(tenantId: tenantId, userId: userId);
    expect(drafts, hasLength(1));
    expect(drafts.single.localId, sentRef, reason: 'retries must reuse the clientRef of the first attempt');
    expect(drafts.single.state, isNot(DraftState.synced), reason: 'never shown as a confirmed server record');
    expect(find.text('drafts screen'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('Hindi: labels and validation messages are translated', (tester) async {
    await pumpForm(tester, _server(), service: 'AEPS', lang: 'hi');
    expect(find.text(stringsHi['record.manualNotice']!), findsOneWidget);
    expect(find.text(stringsHi['mobile.record.save']!), findsOneWidget);
    await tester.tap(find.byKey(const Key('record.save')));
    await pumpFor(tester);
    expect(find.text('आवश्यक'), findsWidgets); // "Required"
    await tester.pumpWidget(const SizedBox());
  });
}
