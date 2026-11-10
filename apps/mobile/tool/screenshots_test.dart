// Renders key screens to PNG for a visual review (not part of `flutter test`).
//
//   SHOTS_DIR=/tmp/shots flutter test tool/screenshots_test.dart --update-goldens
import 'dart:io';

import 'package:csp2all_mobile/app/app.dart';
import 'package:csp2all_mobile/state/providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import '../test/helpers.dart';

final _out = Platform.environment['SHOTS_DIR'] ?? '${Directory.systemTemp.path}/csp2all_shots';
const _sdkFonts = '/Users/sanjay/development/flutter/bin/cache/artifacts/material_fonts';

Future<void> _loadFonts() async {
  Future<void> load(String family, List<String> files) async {
    final l = FontLoader(family);
    for (final f in files) {
      final bytes = File(f).readAsBytesSync();
      l.addFont(Future.value(ByteData.view(Uint8List.fromList(bytes).buffer)));
    }
    await l.load();
  }

  await load('Roboto', ['$_sdkFonts/Roboto-Regular.ttf', '$_sdkFonts/Roboto-Medium.ttf', '$_sdkFonts/Roboto-Bold.ttf']);
  await load('MaterialIcons', ['$_sdkFonts/MaterialIcons-Regular.otf']);
}

Map<String, Object?> _dashboard() => {
      'date': '2026-11-06',
      'timezone': 'Asia/Kolkata',
      'scope': 'SHOP',
      'todayRecords': {'value': 14, 'range': {'from': '2026-11-06', 'to': '2026-11-06'}},
      'serviceVolume': {
        'items': [
          {'serviceCode': 'AEPS', 'count': 6, 'principalPaise': 3450000, 'customerFeePaise': 6000},
          {'serviceCode': 'DMT', 'count': 3, 'principalPaise': 1520050, 'customerFeePaise': 4500},
        ],
      },
      'pendingApplications': {'value': 2},
      'financial': {
        'customerFeesPaise': {'value': 18500},
        'cashInPaise': {'value': 1574550},
        'cashOutPaise': {'value': 3450000},
        'cashInHandPaise': {'value': 1234567},
        'outstandingDuesPaise': {'value': 45000},
        'pendingCommissionPaise': {'value': 8250},
      },
      'recentActivity': [
        {'id': 'r1', 'recordNo': 141, 'serviceCode': 'AEPS', 'customerName': 'Ramesh Kumar', 'txnDate': '2026-11-06', 'opStatus': 'SUCCESSFUL', 'principalPaise': 500000, 'customerFeePaise': 1000},
        {'id': 'r2', 'recordNo': 140, 'serviceCode': 'PAN', 'customerName': 'Sita Devi', 'txnDate': '2026-11-06', 'opStatus': 'SUBMITTED', 'principalPaise': 10700, 'customerFeePaise': 5000},
      ],
      'followUpsDue': [
        {'id': 'f1', 'title': 'Call about PAN card delivery', 'dueDate': '2026-11-06', 'customerName': 'Sita Devi', 'recordId': 'r2', 'version': 1},
      ],
      'checklist': {'firstCustomer': true, 'firstRecord': true, 'openingCash': false, 'staffInvited': false},
    };

void main() {
  setUpAll(_loadFonts);

  Future<void> shot(WidgetTester tester, String name, {String location = '/', Brightness b = Brightness.light, Future<void> Function()? act}) async {
    tester.view.physicalSize = const Size(1080, 2340);
    tester.view.devicePixelRatio = 2.75;
    addTearDown(tester.view.reset);
    final adapter = FakeAdapter((req) {
      switch (req.path) {
        case '/v1/auth/me':
          return FakeResponse(200, meJson());
        case '/v1/tenant/context':
          return FakeResponse(200, contextJson(permissions: const ['records.view', 'records.create', 'records.post', 'customers.view', 'customers.manage', 'cashbook.view', 'dues.view', 'followups.view', 'followups.manage', 'day.close']));
        case '/v1/dashboard':
          return FakeResponse(200, _dashboard());
        case '/v1/notifications':
          final now = DateTime.now().toUtc();
          Map<String, Object?> n(String id, String type, String title, String body, Duration ago, {String? link, bool read = false}) =>
              {'id': id, 'type': type, 'title': title, 'body': body, 'link': link, 'readAt': read ? now.toIso8601String() : null, 'createdAt': now.subtract(ago).toIso8601String()};
          final items = [
            n('n1', 'FOLLOWUPS_DUE', '3 follow-ups due today', 'Ramesh (PAN), Sita (DMT) and 1 more are waiting.', const Duration(minutes: 5), link: '/app/follow-ups'),
            n('n2', 'CLOSING_VARIANCE', 'Cash short by ₹250 at yesterday’s closing', 'Check the cashbook and record the reason.', const Duration(hours: 3), link: '/app/closing'),
            n('n3', 'EXPORT_READY', 'Your records export is ready', 'Download it from Reports within 7 days.', const Duration(days: 1)),
            n('n4', 'SUBSCRIPTION', 'Free plan: 80% of monthly records used', 'Upgrade to keep adding records without limits.', const Duration(days: 4), read: true),
          ];
          return FakeResponse(200, {'items': items, 'page': 1, 'pageSize': 15, 'total': 4, 'pages': 1, 'unread': 3});
        case '/v1/beneficiaries/verify':
          return const FakeResponse(200, {'available': false, 'mode': null, 'reason': 'NOT_CONFIGURED'});
        case '/v1/records/r1':
          return FakeResponse(200, {
            ...recordJson(no: 141, id: 'r1'),
            'serviceCode': 'AEPS',
            'principalDirection': 'PAYOUT',
            'details': {'operationType': 'CASH_WITHDRAWAL', 'bankLabel': 'Demo Gramin Bank'},
            'receivablePaise': 1000,
            'amountCollectedPaise': 1000,
            'postingStatus': 'POSTED',
            'allowedTransitions': ['FAILED'],
            'events': [
              {'id': 'e1', 'dimension': 'OPERATIONAL', 'fromStatus': null, 'toStatus': 'SUCCESSFUL', 'createdAt': '2026-11-06T05:00:00.000Z'},
              {'id': 'e2', 'dimension': 'POSTING', 'fromStatus': 'UNPOSTED', 'toStatus': 'POSTED', 'createdAt': '2026-11-06T05:00:01.000Z'},
            ],
          });
      }
      return apiError(404, 'NOT_FOUND');
    });
    final services = await testServices(adapter, initialTokens: tokens('1'), prefs: {'settings.theme': b == Brightness.dark ? 'dark' : 'light'});
    await tester.pumpWidget(ProviderScope(overrides: [servicesProvider.overrideWithValue(services)], retry: (_, _) => null, child: const CspApp()));
    for (var i = 0; i < 15; i++) {
      await tester.pump(const Duration(milliseconds: 50));
    }
    if (location != '/') {
      final ctx = tester.element(find.byType(Scaffold).first);
      GoRouterHelper(ctx).push(location);
      for (var i = 0; i < 15; i++) {
        await tester.pump(const Duration(milliseconds: 50));
      }
    }
    await act?.call();
    await expectLater(find.byType(CspApp), matchesGoldenFile('$_out/$name.png'));
    await tester.pumpWidget(const SizedBox());
  }

  testWidgets('home light', (t) => shot(t, 'home_light'));
  testWidgets('home dark', (t) => shot(t, 'home_dark', b: Brightness.dark));
  testWidgets('new AEPS record', (t) => shot(t, 'record_form_aeps', location: '/records/new?service=AEPS'));
  testWidgets('record detail', (t) => shot(t, 'record_detail', location: '/records/r1'));
  Future<void> settle(WidgetTester t) async {
    for (var i = 0; i < 20; i++) {
      await t.pump(const Duration(milliseconds: 50));
    }
  }

  testWidgets('profile sheet', (t) => shot(t, 'profile_sheet', act: () async {
        await t.tap(find.byKey(const Key('home.profile')));
        await settle(t);
      }));
  testWidgets('notifications sheet', (t) => shot(t, 'notifications_sheet', act: () async {
        await t.tap(find.byKey(const Key('home.notifications')));
        await settle(t);
      }));
  testWidgets('new DMT record', (t) => shot(t, 'record_form_dmt', location: '/records/new?service=DMT', act: () async {
        await t.enterText(find.byKey(const Key('field.accountNumber')), '32109876543210');
        await t.enterText(find.byKey(const Key('field.ifsc')), 'SBIN0004567');
        await settle(t);
        await Scrollable.ensureVisible(t.element(find.byKey(const Key('field.accountNumber'))), alignment: 0.15);
        await settle(t);
      }));
  testWidgets('bank picker', (t) => shot(t, 'bank_picker', location: '/records/new?service=DMT', act: () async {
        await Scrollable.ensureVisible(t.element(find.byKey(const Key('field.accountNumber'))), alignment: 0.15);
        await settle(t);
        await t.tap(find.byKey(const Key('ben.pickBank')));
        await settle(t);
      }));
}
