import 'package:csp2all_mobile/data/api/api_exception.dart';
import 'package:csp2all_mobile/data/local/draft_store.dart';
import 'package:csp2all_mobile/data/local/sync_queue.dart';
import 'package:csp2all_mobile/data/models/record_models.dart';
import 'package:csp2all_mobile/data/repositories/csp_api.dart';
import 'package:flutter_test/flutter_test.dart';

import '../helpers.dart';

/// Fake server: remembers clientRefs like the real API (`duplicate: true` on retries).
class FakeSubmitter implements RecordSubmitter {
  final List<({String clientRef, String idempotencyKey})> calls = [];
  final Map<String, ServiceRecord> byClientRef = {};
  final List<Object> script = []; // ApiException to throw, or 'ok'
  int nextNo = 100;

  @override
  Future<ServiceRecord> createRecord(RecordDraftData data, {required String clientRef, required String idempotencyKey}) async {
    calls.add((clientRef: clientRef, idempotencyKey: idempotencyKey));
    final step = script.isEmpty ? 'ok' : script.removeAt(0);
    if (step is ApiException) throw step;
    if (step == 'lost-response') {
      // Server commits the record but the response never arrives.
      byClientRef.putIfAbsent(clientRef, () => ServiceRecord.fromJson(recordJson(no: nextNo++)));
      throw ApiException(code: 'NETWORK', message: 'connection reset');
    }
    final existing = byClientRef[clientRef];
    if (existing != null) return ServiceRecord.fromJson({...recordJson(no: existing.recordNo, id: existing.id), 'duplicate': true});
    final rec = ServiceRecord.fromJson(recordJson(no: nextNo++, id: 'rec-$clientRef'));
    byClientRef[clientRef] = rec;
    return rec;
  }
}

RecordDraftData _data({String walkIn = 'Ramesh'}) => RecordDraftData(
      serviceCode: 'DMT',
      walkInName: walkIn,
      txnDate: '2026-11-06',
      opStatus: 'SUCCESSFUL',
      principalPaise: 500000,
      customerFeePaise: 2000,
      amountCollectedPaise: 502000,
      details: const {'beneficiaryName': 'Sita', 'bankName': 'Demo Bank', 'accountLast4': '1234'},
    );

void main() {
  late MemoryDraftStore store;
  late FakeSubmitter server;
  late SyncQueue queue;
  late DateTime now;

  setUp(() async {
    store = MemoryDraftStore();
    server = FakeSubmitter();
    now = DateTime(2026, 11, 6, 10);
    queue = SyncQueue(store: store, submitter: server, clock: () => now);
    await queue.setScope(tenantId: tenantId, userId: userId);
  });

  test('success: PENDING → SYNCED with the server record number; clientRef = draft id', () async {
    final d = await queue.saveDraft(_data());
    expect(queue.drafts.single.state, DraftState.pending);
    final report = await queue.runOnce();
    expect(report.synced, 1);
    final synced = (await store.get(d.localId))!;
    expect(synced.state, DraftState.synced);
    expect(synced.serverRecordNo, 100);
    expect(server.calls.single.clientRef, d.localId);
    expect(server.calls.single.idempotencyKey, d.idempotencyKey);
    // Sensitive details are dropped from the device once the server has the record.
    expect(synced.data.details, isEmpty);
    expect(queue.pendingCount, 0);
  });

  test('duplicate: server already has the clientRef → marked SYNCED (duplicate), no second record', () async {
    final d = await queue.saveDraft(_data());
    server.script.add('lost-response'); // first attempt commits but the reply is lost
    final r1 = await queue.runOnce();
    expect(r1.stoppedOffline, isTrue);
    expect((await store.get(d.localId))!.state, DraftState.pending);

    now = now.add(const Duration(minutes: 1)); // past the backoff
    final r2 = await queue.runOnce();
    expect(r2.duplicates, 1);
    final s = (await store.get(d.localId))!;
    expect(s.state, DraftState.synced);
    expect(s.duplicate, isTrue);
    expect(server.byClientRef.length, 1, reason: 'exactly one record exists on the server');
    // Both attempts used the same clientRef and the same Idempotency-Key (automatic retry).
    expect(server.calls.map((c) => c.clientRef).toSet(), {d.localId});
    expect(server.calls.map((c) => c.idempotencyKey).toSet(), {d.idempotencyKey});
  });

  test('422 validation: FAILED with reason and field errors; editing resubmits with a new key', () async {
    final d = await queue.saveDraft(_data());
    server.script.add(ApiException(
      code: 'VALIDATION_FAILED',
      message: 'Validation failed',
      status: 422,
      fields: {'details.accountLast4': ['Enter only the last 4 digits']},
    ));
    final r = await queue.runOnce();
    expect(r.failed, 1);
    final f = (await store.get(d.localId))!;
    expect(f.state, DraftState.failed);
    expect(f.lastErrorCode, 'VALIDATION_FAILED');
    expect(f.fieldErrors['details.accountLast4'], ['Enter only the last 4 digits']);
    expect(queue.failedCount, 1);

    // A FAILED draft is not retried automatically.
    now = now.add(const Duration(hours: 1));
    await queue.runOnce();
    expect(server.calls, hasLength(1));

    // User edits → PENDING again, same clientRef, fresh Idempotency-Key, errors cleared.
    final edited = await queue.saveDraft(_data(walkIn: 'Ramesh K'), localId: d.localId);
    expect(edited.state, DraftState.pending);
    expect(edited.fieldErrors, isEmpty);
    expect(edited.idempotencyKey, isNot(d.idempotencyKey));
    final r2 = await queue.runOnce();
    expect(r2.synced, 1);
    expect(server.calls.last.clientRef, d.localId);
    expect(server.calls.last.idempotencyKey, edited.idempotencyKey);
  });

  test('permission / business errors also need the user (FAILED), never silently dropped', () async {
    for (final code in ['PERMISSION_DENIED', 'SERVICE_NOT_AVAILABLE', 'QUOTA_EXCEEDED', 'DAY_CLOSED']) {
      await queue.saveDraft(_data());
      server.script.add(ApiException(code: code, message: code, status: code == 'QUOTA_EXCEEDED' ? 402 : 403));
    }
    final r = await queue.runOnce();
    expect(r.failed, 4);
    expect(queue.drafts.every((d) => d.state == DraftState.failed), isTrue);
    expect(queue.drafts.map((d) => d.lastErrorCode).toSet(), {'PERMISSION_DENIED', 'SERVICE_NOT_AVAILABLE', 'QUOTA_EXCEEDED', 'DAY_CLOSED'});
  });

  test('network errors retry with exponential backoff and stop the run while offline', () async {
    final a = await queue.saveDraft(_data());
    now = now.add(const Duration(seconds: 1));
    final b = await queue.saveDraft(_data(walkIn: 'Second'));
    server.script.add(ApiException(code: 'NETWORK', message: 'offline'));

    final r1 = await queue.runOnce();
    expect(r1.retrying, 1);
    expect(r1.stoppedOffline, isTrue);
    expect(server.calls, hasLength(1), reason: 'stops after the first network failure');
    final a1 = (await store.get(a.localId))!;
    expect(a1.state, DraftState.pending);
    expect(a1.attempts, 1);
    expect(a1.nextAttemptAt, now.add(syncBackoff(1)));
    expect((await store.get(b.localId))!.attempts, 0);

    // Before the backoff elapses only the untouched draft is due.
    server.script.add(ApiException(code: 'NETWORK', message: 'offline'));
    await queue.runOnce();
    expect(server.calls.last.clientRef, b.localId);

    // After backoff both go through.
    now = now.add(const Duration(minutes: 5));
    final r3 = await queue.runOnce();
    expect(r3.synced, 2);
    expect(queue.drafts.every((d) => d.state == DraftState.synced), isTrue);
  });

  test('5xx is transient: retried later, other drafts continue', () async {
    await queue.saveDraft(_data());
    now = now.add(const Duration(seconds: 1));
    await queue.saveDraft(_data(walkIn: 'B'));
    server.script.add(ApiException(code: 'INTERNAL_ERROR', message: 'boom', status: 500));
    final r = await queue.runOnce();
    expect(r.retrying, 1);
    expect(r.synced, 1);
    expect(r.stoppedOffline, isFalse);
  });

  test('auth failure keeps drafts pending and stops', () async {
    final d = await queue.saveDraft(_data());
    server.script.add(ApiException(code: 'UNAUTHENTICATED', message: 'Sign in', status: 401));
    final r = await queue.runOnce();
    expect(r.stoppedAuth, isTrue);
    final x = (await store.get(d.localId))!;
    expect(x.state, DraftState.pending);
    expect(x.attempts, 0);
  });

  test('backoff grows exponentially and is capped', () {
    expect(syncBackoff(1), const Duration(seconds: 5));
    expect(syncBackoff(2), const Duration(seconds: 10));
    expect(syncBackoff(4), const Duration(seconds: 40));
    expect(syncBackoff(30), const Duration(minutes: 15));
  });

  test('crash recovery: SYNCING drafts become PENDING on start-up', () async {
    final d = await queue.saveDraft(_data());
    await store.upsert(d.copyWith(state: DraftState.syncing));
    await queue.setScope(tenantId: tenantId, userId: userId);
    expect((await store.get(d.localId))!.state, DraftState.pending);
  });

  test('drafts are scoped per shop and user; concurrent runs share one pass', () async {
    await queue.saveDraft(_data());
    await queue.setScope(tenantId: 'other-tenant', userId: userId);
    expect(queue.drafts, isEmpty);
    await queue.runOnce();
    expect(server.calls, isEmpty, reason: "another shop's drafts are never submitted");

    await queue.setScope(tenantId: tenantId, userId: userId);
    final results = await Future.wait([queue.runOnce(), queue.runOnce()]);
    expect(identical(results[0], results[1]), isTrue);
    expect(server.calls, hasLength(1));
  });
}
