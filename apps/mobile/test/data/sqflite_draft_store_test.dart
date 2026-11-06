import 'package:csp2all_mobile/data/local/draft_store.dart';
import 'package:csp2all_mobile/data/models/record_models.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

void main() {
  sqfliteFfiInit();

  test('SQLite draft store round-trips drafts and scopes them by shop + user', () async {
    final store = await SqfliteDraftStore.open(factory: databaseFactoryFfi, path: inMemoryDatabasePath);
    final now = DateTime(2026, 11, 6, 10);
    final d = LocalDraft(
      localId: 'local-0001-abcdef',
      tenantId: 't1',
      userId: 'u1',
      data: const RecordDraftData(
        serviceCode: 'AEPS',
        walkInName: 'Ramesh',
        txnDate: '2026-11-06',
        opStatus: 'SUCCESSFUL',
        principalPaise: 250000,
        customerFeePaise: 1000,
        details: {'operationType': 'CASH_WITHDRAWAL'},
      ),
      state: DraftState.failed,
      idempotencyKey: 'idem-0001',
      attempts: 2,
      nextAttemptAt: now,
      lastErrorCode: 'VALIDATION_FAILED',
      fieldErrors: const {'details.operationType': ['Invalid']},
      createdAt: now,
      updatedAt: now,
    );
    await store.upsert(d);
    await store.upsert(LocalDraft(
      localId: 'other-shop-draft',
      tenantId: 't2',
      userId: 'u1',
      data: const RecordDraftData(serviceCode: 'DMT', txnDate: '2026-11-06', opStatus: 'PENDING'),
      state: DraftState.syncing,
      idempotencyKey: 'idem-0002',
      createdAt: now,
      updatedAt: now,
    ));

    final back = (await store.list(tenantId: 't1', userId: 'u1')).single;
    expect(back.localId, d.localId);
    expect(back.state, DraftState.failed);
    expect(back.data.principalPaise, 250000);
    expect(back.data.details, {'operationType': 'CASH_WITHDRAWAL'});
    expect(back.fieldErrors, {'details.operationType': ['Invalid']});
    expect(back.attempts, 2);
    expect(back.nextAttemptAt, now);

    await store.resetSyncing();
    expect((await store.get('other-shop-draft'))!.state, DraftState.pending);

    expect(await store.deleteAll(), 2);
    expect(await store.list(tenantId: 't1', userId: 'u1'), isEmpty);
  });
}
