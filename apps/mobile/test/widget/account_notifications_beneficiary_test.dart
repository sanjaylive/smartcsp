import 'package:csp2all_mobile/data/models/tenant_models.dart';
import 'package:csp2all_mobile/features/account/profile_sheet.dart';
import 'package:csp2all_mobile/features/notifications/notifications_sheet.dart';
import 'package:csp2all_mobile/features/records/record_form_screen.dart';
import 'package:csp2all_mobile/l10n/strings.dart';
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

Future<void> pumpApp(WidgetTester tester, FakeAdapter adapter, Widget home) async {
  tester.view.physicalSize = const Size(1200, 6000);
  tester.view.devicePixelRatio = 1.5;
  addTearDown(tester.view.reset);
  final services = await testServices(adapter, initialTokens: tokens('1'));
  final router = GoRouter(routes: [
    GoRoute(path: '/', builder: (_, _) => home),
    GoRoute(path: '/follow-ups', builder: (_, _) => const Scaffold(body: Text('follow-ups screen'))),
    GoRoute(path: '/records/:id', builder: (_, s) => Scaffold(body: Text('detail ${s.pathParameters['id']}'))),
  ]);
  await tester.pumpWidget(ProviderScope(
    overrides: [
      servicesProvider.overrideWithValue(services),
      tenantContextProvider.overrideWith((ref) async => TenantContext.fromJson(contextJson())),
    ],
    retry: (_, _) => null,
    child: MaterialApp.router(
      theme: AppTheme.light(),
      supportedLocales: AppStrings.supportedLocales,
      localizationsDelegates: const [AppStrings.delegate, GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate, GlobalCupertinoLocalizations.delegate],
      routerConfig: router,
    ),
  ));
  await pumpFor(tester);
}

Map<String, Object?> notif(String id, {String type = 'FOLLOWUPS_DUE', String? link, bool read = false, Duration ago = const Duration(minutes: 5)}) => {
      'id': id,
      'type': type,
      'title': 'Title $id',
      'body': 'Body $id',
      'link': link,
      'readAt': read ? DateTime.now().toUtc().toIso8601String() : null,
      'createdAt': DateTime.now().subtract(ago).toUtc().toIso8601String(),
    };

void main() {
  group('notification links', () {
    test('web links map to mobile screens; unknown or external links do not', () {
      expect(mobileRouteFor('/app/follow-ups?date=2026-11-08'), '/follow-ups');
      expect(mobileRouteFor('/app/closing'), '/closing');
      expect(mobileRouteFor('/app/cashbook'), '/cash');
      expect(mobileRouteFor('/app/records/0190a000-0000-7000-8000-00000000r001'), '/records/0190a000-0000-7000-8000-00000000r001');
      expect(mobileRouteFor('/app/subscription'), isNull);
      expect(mobileRouteFor('https://evil.example/app/closing'), isNull);
      expect(mobileRouteFor(null), isNull);
    });
  });

  testWidgets('notifications panel: lists, marks read on tap, filters unread and marks all', (tester) async {
    final adapter = FakeAdapter((req) {
      if (req.path == '/v1/auth/me') return FakeResponse(200, meJson());
      if (req.path == '/v1/notifications' && req.method == 'GET') {
        final unreadOnly = req.queryParameters['unread'] == 'true';
        final items = [
          notif('n1'),
          notif('n2', type: 'EXPORT_READY', ago: const Duration(days: 2)),
          if (!unreadOnly) notif('n3', type: 'SUBSCRIPTION', read: true, ago: const Duration(days: 9)),
        ];
        return FakeResponse(200, {'items': items, 'page': 1, 'pageSize': 15, 'total': items.length, 'pages': 1, 'unread': 2});
      }
      if (req.method == 'POST' && req.path.startsWith('/v1/notifications/')) return const FakeResponse(200, {'ok': true});
      return apiError(404, 'NOT_FOUND');
    });
    await pumpApp(tester, adapter, const Scaffold(body: NotificationsPanel()));

    expect(find.text('Title n1'), findsOneWidget);
    expect(find.text('Title n3'), findsOneWidget);
    expect(find.text('2 unread'), findsOneWidget);
    expect(find.text('TODAY'), findsOneWidget);
    expect(find.text('EARLIER'), findsOneWidget);

    // No link → tapping just marks it read.
    await tester.tap(find.byKey(const Key('notification.n2')));
    await pumpFor(tester);
    expect(adapter.to('POST', '/v1/notifications/n2/read'), hasLength(1));
    expect(find.text('1 unread'), findsOneWidget);

    await tester.tap(find.text('Unread · 1'));
    await pumpFor(tester);
    expect(adapter.requests.last.queryParameters['unread'], 'true');
    expect(find.text('Title n3'), findsNothing);

    await tester.tap(find.byKey(const Key('notifications.markAll')));
    await pumpFor(tester);
    expect(adapter.to('POST', '/v1/notifications/read-all'), hasLength(1));
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('profile sheet: shows identity and shop, saves a new name', (tester) async {
    final adapter = FakeAdapter((req) {
      if (req.path == '/v1/auth/me' && req.method == 'GET') return FakeResponse(200, meJson());
      if (req.path == '/v1/auth/me' && req.method == 'PATCH') {
        final m = meJson();
        (m['user'] as Map)['displayName'] = (req.data as Map)['displayName'];
        return FakeResponse(200, m);
      }
      return apiError(404, 'NOT_FOUND');
    });
    await pumpApp(tester, adapter, const Scaffold(body: ProfileSheet()));

    expect(find.text('owner@example.com'), findsWidgets);
    expect(find.text('Asha Digital Seva'), findsOneWidget);
    expect(find.text('Jaipur, Rajasthan'), findsOneWidget);

    await tester.tap(find.byKey(const Key('profile.editName')));
    await pumpFor(tester);
    await tester.enterText(find.byKey(const Key('profile.name')), 'Asha Kumari');
    await tester.tap(find.byKey(const Key('profile.saveName')));
    await pumpFor(tester);

    final patches = adapter.to('PATCH', '/v1/auth/me');
    expect(patches, hasLength(1));
    expect((patches.single.data as Map)['displayName'], 'Asha Kumari');
    expect(find.text('Asha Kumari'), findsWidgets);
    await tester.pumpWidget(const SizedBox());
  });

  group('DMT beneficiary', () {
    FakeAdapter server({required bool verifyAvailable}) => FakeAdapter((req) {
          if (req.path == '/v1/auth/me') return FakeResponse(200, meJson());
          if (req.path == '/v1/beneficiaries/verify' && req.method == 'GET') {
            return FakeResponse(200, {'available': verifyAvailable, 'mode': verifyAvailable ? 'SIMULATOR' : null, 'reason': null});
          }
          if (req.path == '/v1/beneficiaries/verify' && req.method == 'POST') {
            return const FakeResponse(200, {'verified': true, 'name': 'SITA DEVI', 'mode': 'SIMULATOR'});
          }
          return apiError(404, 'NOT_FOUND');
        });

    testWidgets('IFSC picks the bank; Verify stays off without a connected provider', (tester) async {
      final adapter = server(verifyAvailable: false);
      await pumpApp(tester, adapter, const RecordFormScreen(serviceCode: 'DMT'));

      await tester.enterText(find.byKey(const Key('field.accountNumber')), '501002345674321');
      await tester.enterText(find.byKey(const Key('field.ifsc')), 'sbin0001234');
      await pumpFor(tester);
      expect(tester.widget<TextField>(find.byKey(const Key('field.bankName'))).controller!.text, 'State Bank of India');

      final verify = tester.widget<TextButton>(find.byKey(const Key('ben.verify')));
      expect(verify.onPressed, isNull);
      expect(find.textContaining('connected Pay2All account'), findsOneWidget);
      expect(adapter.to('POST', '/v1/beneficiaries/verify'), isEmpty);
      await tester.pumpWidget(const SizedBox());
    });

    testWidgets('a typed bank the app does not know is kept when the IFSC is entered', (tester) async {
      await pumpApp(tester, server(verifyAvailable: false), const RecordFormScreen(serviceCode: 'DMT'));
      await tester.enterText(find.byKey(const Key('field.bankName')), 'Demo Gramin Bank');
      await tester.enterText(find.byKey(const Key('field.ifsc')), 'SBIN0001234');
      await pumpFor(tester);
      expect(tester.widget<TextField>(find.byKey(const Key('field.bankName'))).controller!.text, 'Demo Gramin Bank');
      await tester.pumpWidget(const SizedBox());
    });

    testWidgets('Verify fills the holder name when a provider is connected', (tester) async {
      final adapter = server(verifyAvailable: true);
      await pumpApp(tester, adapter, const RecordFormScreen(serviceCode: 'DMT'));

      await tester.enterText(find.byKey(const Key('field.accountNumber')), '501002345674321');
      await tester.enterText(find.byKey(const Key('field.ifsc')), 'SBIN0001234');
      await pumpFor(tester);
      await tester.tap(find.byKey(const Key('ben.verify')));
      await pumpFor(tester);

      final posts = adapter.to('POST', '/v1/beneficiaries/verify');
      expect(posts, hasLength(1));
      expect(posts.single.data, {'accountNumber': '501002345674321', 'ifsc': 'SBIN0001234'});
      expect(tester.widget<TextField>(find.byKey(const Key('field.beneficiaryName'))).controller!.text, 'SITA DEVI');
      expect(find.text('Name verified with the bank'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
    });
  });
}
