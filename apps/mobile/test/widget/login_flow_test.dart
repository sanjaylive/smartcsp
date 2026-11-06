import 'package:csp2all_mobile/app/app.dart';
import 'package:csp2all_mobile/state/providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import '../helpers.dart';

Map<String, Object?> dashboardJson() => {
      'date': '2026-11-06',
      'timezone': 'Asia/Kolkata',
      'scope': 'SHOP',
      'todayRecords': {'value': 3, 'range': {'from': '2026-11-06', 'to': '2026-11-06'}, 'meaning': 'Records dated today (excluding drafts).'},
      'serviceVolume': {'meaning': 'Transaction value processed for customers. This is NOT income.', 'items': []},
      'pendingApplications': {'value': 1, 'meaning': ''},
      'financial': null,
      'recentActivity': [],
      'followUpsDue': [],
      'checklist': {'firstCustomer': true, 'firstRecord': true, 'openingCash': true, 'staffInvited': null},
    };

Future<void> pumpFor(WidgetTester tester, [int frames = 10]) async {
  for (var i = 0; i < frames; i++) {
    await tester.pump(const Duration(milliseconds: 50));
  }
}

void main() {
  testWidgets('email OTP sign-in: consent required, code auto-submits, lands on home', (tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 2.5;
    addTearDown(tester.view.reset);

    final adapter = FakeAdapter((req) {
      switch (req.path) {
        case '/v1/auth/otp/request':
          return const FakeResponse(202, {'challengeId': '0190a000-0000-7000-8000-0000000000c1', 'expiresInSeconds': 600, 'resendAfterSeconds': 60});
        case '/v1/auth/otp/verify':
          final body = req.data as Map;
          if (body['code'] != '123456') return apiError(400, 'OTP_INVALID');
          return FakeResponse(200, {...meJson(), 'tokens': tokens('1').toJson()});
        case '/v1/tenant/context':
          return FakeResponse(200, contextJson());
        case '/v1/dashboard':
          return FakeResponse(200, dashboardJson());
      }
      return apiError(404, 'NOT_FOUND');
    });
    final services = await testServices(adapter);

    await tester.pumpWidget(ProviderScope(
      overrides: [servicesProvider.overrideWithValue(services)],
      retry: (_, _) => null,
      child: const CspApp(),
    ));
    await pumpFor(tester);

    expect(find.text('Sign in or create your shop'), findsOneWidget);

    // Consent is required.
    await tester.enterText(find.byKey(const Key('login.email')), 'Owner@Example.com');
    await tester.tap(find.byKey(const Key('login.send')));
    await pumpFor(tester, 3);
    expect(find.text('Please accept the terms and privacy notice'), findsOneWidget);
    expect(adapter.to('POST', '/v1/auth/otp/request'), isEmpty);

    await tester.tap(find.byKey(const Key('login.consent')));
    await tester.tap(find.byKey(const Key('login.send')));
    await pumpFor(tester);
    expect(adapter.to('POST', '/v1/auth/otp/request').single.data, {'email': 'owner@example.com', 'consent': true});
    expect(find.text('Enter the code'), findsOneWidget);
    expect(find.textContaining('Resend in'), findsOneWidget); // cooldown from resendAfterSeconds

    // Wrong code shows a translated error and stays on the OTP step.
    await tester.enterText(find.byKey(const Key('login.code')), '000000');
    await pumpFor(tester);
    expect(find.text('That code is not correct.'), findsOneWidget);

    // Entering 6 digits auto-submits.
    await tester.enterText(find.byKey(const Key('login.code')), '123456');
    await pumpFor(tester, 20);
    final verify = adapter.to('POST', '/v1/auth/otp/verify').last.data as Map;
    expect(verify['client'], 'mobile');
    expect(verify['email'], 'owner@example.com');
    expect(services.session.current?.accessToken, tokens('1').accessToken);

    // Home: shop name, quick entry tiles from quickActions, precise metric labels.
    expect(find.text('Asha Digital Seva'), findsWidgets);
    expect(find.text('Quick entry'), findsOneWidget);
    expect(find.byKey(const Key('service.AEPS')), findsOneWidget);
    expect(find.text("Today's records"), findsOneWidget);

    await tester.pumpWidget(const SizedBox()); // dispose providers & timers
  });
}
