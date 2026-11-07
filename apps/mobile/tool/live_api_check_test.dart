// Scripted end-to-end check of the app's API layer against a running local API + Mailpit.
//
//   API_BASE_URL=http://localhost:4610 MAILPIT_URL=http://127.0.0.1:56626 \
//     flutter test tool/live_api_check_test.dart
//
// It signs up a fresh user via email OTP (code read from Mailpit), completes onboarding, creates
// a record through the offline SyncQueue, retries it with the same clientRef (expects ONE record),
// checks single-flight token refresh and refresh-token reuse detection. Not part of `flutter test`
// (lives in tool/) because it needs live services.
import 'dart:io';

import 'package:csp2all_mobile/core/dates.dart';
import 'package:csp2all_mobile/data/api/api_client.dart';
import 'package:csp2all_mobile/data/api/api_exception.dart';
import 'package:csp2all_mobile/data/api/auth_session.dart';
import 'package:csp2all_mobile/data/api/token_store.dart';
import 'package:csp2all_mobile/data/local/draft_store.dart';
import 'package:csp2all_mobile/data/local/sync_queue.dart';
import 'package:csp2all_mobile/data/models/auth_models.dart';
import 'package:csp2all_mobile/data/models/record_models.dart';
import 'package:csp2all_mobile/data/repositories/csp_api.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

final base = Platform.environment['API_BASE_URL'] ?? 'http://localhost:4610';
final mailpit = Platform.environment['MAILPIT_URL'] ?? 'http://127.0.0.1:56626';

void log(String s) => stdout.writeln('  • $s');

Future<String> otpFromMailpit(String email) async {
  final dio = Dio();
  for (var i = 0; i < 30; i++) {
    final res = await dio.get<Map<String, dynamic>>('$mailpit/api/v1/search', queryParameters: {'query': 'to:$email'});
    final msgs = (res.data?['messages'] as List?) ?? const [];
    if (msgs.isNotEmpty) {
      final subject = '${(msgs.first as Map)['Subject']}';
      final code = RegExp(r'^\d{6}').firstMatch(subject)?.group(0);
      if (code != null) return code;
    }
    await Future<void>.delayed(const Duration(milliseconds: 500));
  }
  throw StateError('No OTP email for $email');
}

void main() {
  test('live API: login → onboarding → record with clientRef twice → one record → refresh', () async {
    final email = 'mobile-check-${DateTime.now().millisecondsSinceEpoch}@example.com';
    final store = MemoryTokenStore();
    final refreshCalls = <String>[];
    final realRefresh = ApiClient.refreshCallFor(base);
    final session = AuthSession(store: store, refreshCall: (rt) {
      refreshCalls.add(rt);
      return realRefresh(rt);
    });
    final api = CspApi(ApiClient(baseUrl: base, session: session));

    // ---- sign in
    final ch = await api.requestOtp(email);
    log('OTP requested: challenge ${ch.challengeId.substring(0, 8)}…, resend after ${ch.resendAfterSeconds}s');
    final code = await otpFromMailpit(email);
    final verified = await api.verifyOtp(challengeId: ch.challengeId, email: email, code: code, deviceName: 'live-check');
    await session.setTokens(verified.tokens);
    expect(verified.me.activeTenantId, isNull);
    expect(verified.me.onboardingStep, isNotNull);
    log('Signed in as ${verified.me.user.email}; onboarding step ${verified.me.onboardingStep}');

    // ---- onboarding
    final ob = await api.onboarding();
    log('Onboarding: plan ${ob.planName}, limit ${ob.enabledServiceLimit}, available ${ob.availableServices.length}');
    await api.saveShop(const ShopSetup(shopName: 'Live Check Seva Kendra', ownerName: 'Test Owner', state: 'Rajasthan', district: 'Jaipur', preferredLanguage: 'hi'));
    final wanted = ['DMT', 'AEPS', 'RECHARGE', 'AADHAAR'].where(ob.availableServices.contains).take(ob.enabledServiceLimit ?? 4).toList();
    await api.saveServices(wanted);
    final me = await api.completeOnboarding();
    expect(me.activeTenantId, isNotNull);
    final again = await api.completeOnboarding(); // idempotent
    expect(again.activeTenantId, me.activeTenantId);
    log('Shop created ${me.activeTenantId} with $wanted (complete is idempotent)');

    final ctx = await api.tenantContext();
    expect(ctx.quickActions, containsAll(wanted));
    final dash = await api.dashboard();
    log('Context: role ${ctx.role}, ${ctx.permissions.length} permissions, quick actions ${ctx.quickActions}; dashboard ${dash.date} scope ${dash.scope}');

    // ---- record through the offline queue, then a retry with the same clientRef
    final drafts = MemoryDraftStore();
    final queue = SyncQueue(store: drafts, submitter: api);
    await queue.setScope(tenantId: me.activeTenantId, userId: me.user.id);
    final data = RecordDraftData(
      serviceCode: 'DMT',
      walkInName: 'Ramesh Kumar',
      txnDate: todayIso(ctx.tenant.timezone),
      opStatus: 'SUCCESSFUL',
      principalPaise: 500050,
      customerFeePaise: 2000,
      amountCollectedPaise: 502050,
      details: const {'beneficiaryName': 'Sita Devi', 'bankName': 'Demo Gramin Bank', 'accountLast4': '4321', 'ifsc': 'SBIN0001234', 'senderMobile': '9876543210'},
      post: true,
    );
    final preview = await api.postingPreview(data);
    log('Posting preview: receivable ${preview.receivablePaise}, due ${preview.amountDuePaise}, cash ${preview.cashEffectPaise}, ${preview.lines.length} lines');
    final draft = await queue.saveDraft(data);
    final r1 = await queue.runOnce();
    expect(r1.synced, 1, reason: '$r1 ${queue.drafts.first.lastErrorCode} ${queue.drafts.first.lastErrorMessage}');
    final synced = (await drafts.get(draft.localId))!;
    log('Draft synced as record #${synced.serverRecordNo} (${synced.serverRecordId})');

    // Same clientRef, NEW idempotency key (e.g. app restarted after a lost response).
    final dup = await api.createRecord(data, clientRef: draft.clientRef, idempotencyKey: newIdempotencyKey());
    expect(dup.duplicate, isTrue);
    expect(dup.id, synced.serverRecordId);
    // Same clientRef and SAME idempotency key → replayed response.
    final replay = await api.createRecord(data, clientRef: draft.clientRef, idempotencyKey: draft.idempotencyKey);
    expect(replay.id, synced.serverRecordId);
    final list = await api.records(const RecordFilters(service: 'DMT'));
    expect(list.total, 1, reason: 'exactly one record for the clientRef');
    log('Retries returned duplicate=${dup.duplicate} / replay ${replay.id == synced.serverRecordId}; DMT records on server: ${list.total}');

    final detail = await api.record(synced.serverRecordId!);
    expect(detail.source, 'MOBILE_SYNC');
    expect(detail.isManual, isTrue);
    log('Detail: status ${detail.opStatus}, posting ${detail.postingStatus}, payment ${detail.paymentStatus}, '
        'allowed ${detail.allowedTransitions}, events ${detail.events.length}, senderMobile=${detail.details['senderMobile']}');

    // Validation error mapping (bad last-4) is a FAILED draft with field errors.
    final bad = await queue.saveDraft(RecordDraftData(
      serviceCode: 'DMT',
      txnDate: todayIso(),
      opStatus: 'SUCCESSFUL',
      details: const {'beneficiaryName': 'X', 'bankName': 'Y', 'accountLast4': '12345'},
    ));
    await queue.runOnce();
    final failed = (await drafts.get(bad.localId))!;
    expect(failed.state, DraftState.failed);
    log('Invalid draft → ${failed.state.name} ${failed.lastErrorCode} ${failed.fieldErrors}');

    // ---- transition, customers, money screens
    final tr = await api.transition(detail.id, version: detail.version, to: 'FAILED', reason: 'Provider reversed', reversePosting: true);
    log('Transition SUCCESSFUL→FAILED with reversal: ${tr.opStatus} / ${tr.postingStatus}');
    final cust = await api.createCustomer(name: 'Geeta Sharma', phone: '9812345678');
    final found = await api.customers(q: 'geeta');
    expect(found.items.map((c) => c.id), contains(cust.id));
    final dues = await api.dues();
    final cash = await api.cashbook(todayIso(ctx.tenant.timezone));
    final closing = await api.closingPreview(todayIso(ctx.tenant.timezone));
    final notes = await api.notifications();
    final follow = await api.followUps();
    log('Customers ok; dues ${dues.totalDuePaise}; cash open ${cash.openingBalancePaise} in ${cash.totalInPaise} out ${cash.totalOutPaise} (${cash.dayStatus}); '
        'closing expected ${closing.expectedCashPaise}; notifications ${notes.total}; follow-ups ${follow.total}');

    // ---- token refresh: concurrent callers share one refresh
    final stale = session.current!.accessToken;
    final pairs = await Future.wait([for (var i = 0; i < 3; i++) session.refresh(staleAccessToken: stale)]);
    expect(refreshCalls, hasLength(1));
    expect(pairs.map((p) => p!.accessToken).toSet(), hasLength(1));
    final me2 = await api.me();
    expect(me2.activeTenantId, me.activeTenantId);
    log('Single-flight refresh: ${refreshCalls.length} server call for 3 callers; /me works with the new token');

    // Old (rotated) access token is rejected.
    try {
      await Dio(BaseOptions(baseUrl: base)).get<Object?>('/v1/auth/me', options: Options(headers: {'Authorization': 'Bearer $stale'}));
      fail('old access token still works');
    } on DioException catch (e) {
      log('Old access token after rotation → ${e.response?.statusCode} ${ApiException.fromDio(e).code}');
    }

    final sessions = await api.sessions();
    expect(sessions.any((s) => s.current && s.kind == 'MOBILE'), isTrue);

    // ---- refresh-token reuse detection: presenting the spent token revokes the session.
    // The API accepts a just-used token for a short grace window (REFRESH_REUSE_GRACE_MS = 30s in
    // apps/api/src/modules/auth/session.service.ts) so a lost response can be retried; that replay
    // is covered by the API integration tests. Reuse after the window is theft, so wait it out.
    const reuseGrace = Duration(seconds: 30);
    log('Waiting ${reuseGrace.inSeconds + 2}s for the refresh-token reuse grace window to pass…');
    await Future<void>.delayed(reuseGrace + const Duration(seconds: 2));
    try {
      await realRefresh(refreshCalls.first);
      fail('reused refresh token accepted');
    } on ApiException catch (e) {
      log('Reusing a spent refresh token → ${e.code}');
    }
    try {
      await api.me();
      fail('session should be revoked after reuse');
    } on ApiException catch (e) {
      expect(e.isAuth, isTrue);
      log('Session revoked after reuse (→ ${e.code}); app returns to sign-in');
    }
    expect(session.isSignedIn, isFalse);
  }, timeout: const Timeout(Duration(minutes: 3)));
}
