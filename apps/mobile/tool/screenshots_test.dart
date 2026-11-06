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
}
