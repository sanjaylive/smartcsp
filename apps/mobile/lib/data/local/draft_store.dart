import 'dart:convert';

import 'package:path/path.dart' as p;
import 'package:sqflite/sqflite.dart';

import '../models/json.dart';
import '../models/record_models.dart';

/// Sync state of a record draft kept on this device.
///
///   PENDING ──submit──▶ SYNCING ──201 / duplicate──▶ SYNCED
///      ▲                   │
///      └──network/5xx──────┤ (attempts++, backoff)
///                          └──422/403/409…──▶ FAILED ──user edits──▶ PENDING
enum DraftState { pending, syncing, failed, synced }

DraftState draftStateFrom(String s) => DraftState.values.firstWhere((e) => e.name == s, orElse: () => DraftState.pending);

class LocalDraft {
  const LocalDraft({
    required this.localId,
    required this.tenantId,
    required this.userId,
    required this.data,
    required this.state,
    required this.idempotencyKey,
    this.attempts = 0,
    this.nextAttemptAt,
    this.lastErrorCode,
    this.lastErrorMessage,
    this.fieldErrors = const {},
    this.serverRecordId,
    this.serverRecordNo,
    this.duplicate = false,
    required this.createdAt,
    required this.updatedAt,
  });

  /// Also used as the record's `clientRef`, so retries can never create two records.
  final String localId;
  final String tenantId;
  final String userId;
  final RecordDraftData data;
  final DraftState state;

  /// One key per submission; replaced when the user edits the draft.
  final String idempotencyKey;
  final int attempts;
  final DateTime? nextAttemptAt;
  final String? lastErrorCode;
  final String? lastErrorMessage;
  final Map<String, List<String>> fieldErrors;
  final String? serverRecordId;
  final int? serverRecordNo;
  final bool duplicate;
  final DateTime createdAt;
  final DateTime updatedAt;

  String get clientRef => localId;
  bool get isUnsynced => state != DraftState.synced;

  LocalDraft copyWith({
    RecordDraftData? data,
    DraftState? state,
    String? idempotencyKey,
    int? attempts,
    DateTime? Function()? nextAttemptAt,
    String? Function()? lastErrorCode,
    String? Function()? lastErrorMessage,
    Map<String, List<String>>? fieldErrors,
    String? serverRecordId,
    int? serverRecordNo,
    bool? duplicate,
    DateTime? updatedAt,
  }) =>
      LocalDraft(
        localId: localId,
        tenantId: tenantId,
        userId: userId,
        data: data ?? this.data,
        state: state ?? this.state,
        idempotencyKey: idempotencyKey ?? this.idempotencyKey,
        attempts: attempts ?? this.attempts,
        nextAttemptAt: nextAttemptAt != null ? nextAttemptAt() : this.nextAttemptAt,
        lastErrorCode: lastErrorCode != null ? lastErrorCode() : this.lastErrorCode,
        lastErrorMessage: lastErrorMessage != null ? lastErrorMessage() : this.lastErrorMessage,
        fieldErrors: fieldErrors ?? this.fieldErrors,
        serverRecordId: serverRecordId ?? this.serverRecordId,
        serverRecordNo: serverRecordNo ?? this.serverRecordNo,
        duplicate: duplicate ?? this.duplicate,
        createdAt: createdAt,
        updatedAt: updatedAt ?? this.updatedAt,
      );

  Map<String, Object?> toRow() => {
        'local_id': localId,
        'tenant_id': tenantId,
        'user_id': userId,
        'data': jsonEncode(data.toStorageJson()),
        'state': state.name,
        'idempotency_key': idempotencyKey,
        'attempts': attempts,
        'next_attempt_at': nextAttemptAt?.millisecondsSinceEpoch,
        'last_error_code': lastErrorCode,
        'last_error_message': lastErrorMessage,
        'field_errors': jsonEncode(fieldErrors),
        'server_record_id': serverRecordId,
        'server_record_no': serverRecordNo,
        'duplicate': duplicate ? 1 : 0,
        'created_at': createdAt.millisecondsSinceEpoch,
        'updated_at': updatedAt.millisecondsSinceEpoch,
      };

  factory LocalDraft.fromRow(Map<String, Object?> r) {
    final fe = <String, List<String>>{};
    final rawFe = r['field_errors'];
    if (rawFe is String && rawFe.isNotEmpty) {
      (jsonDecode(rawFe) as Map).forEach((k, v) => fe['$k'] = (v as List).map((e) => '$e').toList());
    }
    DateTime? ms(Object? v) => v is int ? DateTime.fromMillisecondsSinceEpoch(v) : null;
    return LocalDraft(
      localId: r['local_id'] as String,
      tenantId: r['tenant_id'] as String,
      userId: r['user_id'] as String,
      data: RecordDraftData.fromStorageJson(asJson(jsonDecode(r['data'] as String))),
      state: draftStateFrom(r['state'] as String),
      idempotencyKey: r['idempotency_key'] as String,
      attempts: (r['attempts'] as int?) ?? 0,
      nextAttemptAt: ms(r['next_attempt_at']),
      lastErrorCode: r['last_error_code'] as String?,
      lastErrorMessage: r['last_error_message'] as String?,
      fieldErrors: fe,
      serverRecordId: r['server_record_id'] as String?,
      serverRecordNo: r['server_record_no'] as int?,
      duplicate: r['duplicate'] == 1,
      createdAt: ms(r['created_at']) ?? DateTime.now(),
      updatedAt: ms(r['updated_at']) ?? DateTime.now(),
    );
  }
}

/// Persistence for drafts. Every draft is scoped to (tenantId, userId) so a different shop or
/// user on the same device never sees or syncs someone else's drafts.
abstract class DraftStore {
  Future<List<LocalDraft>> list({required String tenantId, required String userId});
  Future<LocalDraft?> get(String localId);
  Future<void> upsert(LocalDraft d);
  Future<void> delete(String localId);

  /// Deletes every draft on the device (sign-out).
  Future<int> deleteAll();

  /// Crash recovery: a draft left in SYNCING is retried (its clientRef prevents duplicates).
  Future<void> resetSyncing();

  /// Removes synced summaries older than [age].
  Future<void> purgeSynced(Duration age);
}

class SqfliteDraftStore implements DraftStore {
  SqfliteDraftStore(this._db);
  final Database _db;

  static Future<SqfliteDraftStore> open({DatabaseFactory? factory, String? path}) async {
    final f = factory ?? databaseFactory;
    final dbPath = path ?? p.join(await f.getDatabasesPath(), 'csp2all_drafts.db');
    final db = await f.openDatabase(
      dbPath,
      options: OpenDatabaseOptions(
        version: 1,
        onCreate: (db, _) async {
          await db.execute('''
            CREATE TABLE drafts (
              local_id TEXT PRIMARY KEY,
              tenant_id TEXT NOT NULL,
              user_id TEXT NOT NULL,
              data TEXT NOT NULL,
              state TEXT NOT NULL,
              idempotency_key TEXT NOT NULL,
              attempts INTEGER NOT NULL DEFAULT 0,
              next_attempt_at INTEGER,
              last_error_code TEXT,
              last_error_message TEXT,
              field_errors TEXT,
              server_record_id TEXT,
              server_record_no INTEGER,
              duplicate INTEGER NOT NULL DEFAULT 0,
              created_at INTEGER NOT NULL,
              updated_at INTEGER NOT NULL
            )''');
          await db.execute('CREATE INDEX drafts_scope ON drafts (tenant_id, user_id, state)');
        },
      ),
    );
    return SqfliteDraftStore(db);
  }

  @override
  Future<List<LocalDraft>> list({required String tenantId, required String userId}) async {
    final rows = await _db.query('drafts', where: 'tenant_id = ? AND user_id = ?', whereArgs: [tenantId, userId], orderBy: 'created_at DESC');
    return rows.map(LocalDraft.fromRow).toList();
  }

  @override
  Future<LocalDraft?> get(String localId) async {
    final rows = await _db.query('drafts', where: 'local_id = ?', whereArgs: [localId], limit: 1);
    return rows.isEmpty ? null : LocalDraft.fromRow(rows.first);
  }

  @override
  Future<void> upsert(LocalDraft d) => _db.insert('drafts', d.toRow(), conflictAlgorithm: ConflictAlgorithm.replace);

  @override
  Future<void> delete(String localId) => _db.delete('drafts', where: 'local_id = ?', whereArgs: [localId]);

  @override
  Future<int> deleteAll() => _db.delete('drafts');

  @override
  Future<void> resetSyncing() => _db.update('drafts', {'state': DraftState.pending.name}, where: 'state = ?', whereArgs: [DraftState.syncing.name]);

  @override
  Future<void> purgeSynced(Duration age) => _db.delete('drafts',
      where: 'state = ? AND updated_at < ?', whereArgs: [DraftState.synced.name, DateTime.now().subtract(age).millisecondsSinceEpoch]);
}

class MemoryDraftStore implements DraftStore {
  final Map<String, LocalDraft> rows = {};

  @override
  Future<List<LocalDraft>> list({required String tenantId, required String userId}) async =>
      rows.values.where((d) => d.tenantId == tenantId && d.userId == userId).toList()..sort((a, b) => b.createdAt.compareTo(a.createdAt));

  @override
  Future<LocalDraft?> get(String localId) async => rows[localId];

  @override
  Future<void> upsert(LocalDraft d) async => rows[d.localId] = d;

  @override
  Future<void> delete(String localId) async => rows.remove(localId);

  @override
  Future<int> deleteAll() async {
    final n = rows.length;
    rows.clear();
    return n;
  }

  @override
  Future<void> resetSyncing() async {
    for (final e in rows.entries.toList()) {
      if (e.value.state == DraftState.syncing) rows[e.key] = e.value.copyWith(state: DraftState.pending);
    }
  }

  @override
  Future<void> purgeSynced(Duration age) async {
    final cutoff = DateTime.now().subtract(age);
    rows.removeWhere((_, d) => d.state == DraftState.synced && d.updatedAt.isBefore(cutoff));
  }
}
