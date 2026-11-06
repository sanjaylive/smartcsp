import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:uuid/uuid.dart';

import '../api/api_exception.dart';
import '../models/record_models.dart';
import '../repositories/csp_api.dart';
import 'draft_store.dart';

const _uuid = Uuid();

/// Exponential backoff: 5s, 10s, 20s … capped at 15 minutes.
Duration syncBackoff(int attempts) {
  final seconds = 5 * math.pow(2, math.max(0, attempts - 1)).toInt();
  return Duration(seconds: math.min(seconds, 15 * 60));
}

class SyncReport {
  int synced = 0;
  int duplicates = 0;
  int failed = 0;
  int retrying = 0;
  bool stoppedOffline = false;
  bool stoppedAuth = false;

  @override
  String toString() => 'SyncReport(synced=$synced, duplicates=$duplicates, failed=$failed, retrying=$retrying, offline=$stoppedOffline, auth=$stoppedAuth)';
}

/// Submits device drafts to the server as manual records.
///
/// Guarantees:
///  * every submission carries `clientRef` = draft id, so the server returns the original record
///    (`duplicate: true`) instead of creating a second one, even across app restarts;
///  * an `Idempotency-Key` per submission, reused on automatic retries;
///  * network / 5xx / rate-limit errors retry with backoff; validation, permission and business
///    errors mark the draft FAILED with the reason so the user can edit it;
///  * drafts are never shown as server records until the server confirms them.
///  * only manual records are created — provider execution is never queued.
class SyncQueue extends ChangeNotifier {
  SyncQueue({required this.store, required this.submitter, DateTime Function()? clock}) : _clock = clock ?? DateTime.now;

  final DraftStore store;
  final RecordSubmitter submitter;
  final DateTime Function() _clock;

  String? _tenantId;
  String? _userId;
  Future<SyncReport>? _running;
  List<LocalDraft> _drafts = const [];

  /// Drafts for the active (tenant, user) scope, newest first.
  List<LocalDraft> get drafts => _drafts;
  int get pendingCount => _drafts.where((d) => d.state == DraftState.pending || d.state == DraftState.syncing).length;
  int get failedCount => _drafts.where((d) => d.state == DraftState.failed).length;
  int get unsyncedCount => _drafts.where((d) => d.isUnsynced).length;
  bool get isRunning => _running != null;

  Future<void> setScope({required String? tenantId, required String? userId}) async {
    _tenantId = tenantId;
    _userId = userId;
    await store.resetSyncing();
    await store.purgeSynced(const Duration(days: 1));
    await refresh();
  }

  Future<void> refresh() async {
    final t = _tenantId, u = _userId;
    _drafts = (t == null || u == null) ? const [] : await store.list(tenantId: t, userId: u);
    notifyListeners();
  }

  /// Saves a new draft (or replaces an edited one) as PENDING with a fresh Idempotency-Key.
  ///
  /// Pass [localId] to edit an existing draft, or to create a draft whose clientRef equals the
  /// clientRef of an online attempt that may already have reached the server.
  Future<LocalDraft> saveDraft(RecordDraftData data, {String? localId}) async {
    final t = _tenantId, u = _userId;
    if (t == null || u == null) throw StateError('No active shop');
    final now = _clock();
    final existing = localId == null ? null : await store.get(localId);
    final draft = existing != null
        ? existing.copyWith(
            data: data,
            state: DraftState.pending,
            idempotencyKey: _uuid.v4(),
            attempts: 0,
            nextAttemptAt: () => null,
            lastErrorCode: () => null,
            lastErrorMessage: () => null,
            fieldErrors: const {},
            updatedAt: now,
          )
        : LocalDraft(
            localId: localId ?? _uuid.v4(),
            tenantId: t,
            userId: u,
            data: data,
            state: DraftState.pending,
            idempotencyKey: _uuid.v4(),
            createdAt: now,
            updatedAt: now,
          );
    await store.upsert(draft);
    await refresh();
    return draft;
  }

  Future<void> deleteDraft(String localId) async {
    await store.delete(localId);
    await refresh();
  }

  /// Makes a FAILED or backing-off draft eligible immediately (user tapped "Sync now").
  Future<void> retryNow() async {
    for (final d in _drafts.where((d) => d.state == DraftState.pending)) {
      await store.upsert(d.copyWith(nextAttemptAt: () => null));
    }
    await refresh();
  }

  /// Processes due drafts once. Concurrent callers share the same run.
  Future<SyncReport> runOnce() {
    final running = _running;
    if (running != null) return running;
    final f = _run();
    _running = f;
    return f.whenComplete(() {
      _running = null;
      notifyListeners();
    });
  }

  Future<SyncReport> _run() async {
    final report = SyncReport();
    final t = _tenantId, u = _userId;
    if (t == null || u == null) return report;
    final now = _clock();
    final due = (await store.list(tenantId: t, userId: u))
        .where((d) => d.state == DraftState.pending && (d.nextAttemptAt == null || !d.nextAttemptAt!.isAfter(now)))
        .toList()
      ..sort((a, b) => a.createdAt.compareTo(b.createdAt)); // oldest first

    for (final draft in due) {
      // Guard against a scope change (sign-out / shop switch) mid-run.
      if (_tenantId != t || _userId != u) break;
      final syncing = draft.copyWith(state: DraftState.syncing, updatedAt: _clock());
      await store.upsert(syncing);
      await refresh();
      try {
        final rec = await submitter.createRecord(draft.data, clientRef: draft.clientRef, idempotencyKey: draft.idempotencyKey);
        await store.upsert(syncing.copyWith(
          // Keep only a non-sensitive summary once the server holds the record.
          data: RecordDraftData(
            serviceCode: draft.data.serviceCode,
            customServiceId: draft.data.customServiceId,
            txnDate: draft.data.txnDate,
            opStatus: rec.opStatus,
            principalPaise: draft.data.principalPaise,
            customerFeePaise: draft.data.customerFeePaise,
            customerName: draft.data.customerName,
            walkInName: draft.data.walkInName,
          ),
          state: DraftState.synced,
          serverRecordId: rec.id,
          serverRecordNo: rec.recordNo,
          duplicate: rec.duplicate,
          lastErrorCode: () => null,
          lastErrorMessage: () => null,
          fieldErrors: const {},
          updatedAt: _clock(),
        ));
        rec.duplicate ? report.duplicates++ : report.synced++;
      } on ApiException catch (e) {
        if (e.isAuth) {
          // Session ended; keep the draft pending for the next sign-in of this user.
          await store.upsert(syncing.copyWith(state: DraftState.pending, updatedAt: _clock()));
          report.stoppedAuth = true;
          break;
        }
        if (e.isTransient) {
          final attempts = draft.attempts + 1;
          await store.upsert(syncing.copyWith(
            state: DraftState.pending,
            attempts: attempts,
            nextAttemptAt: () => _clock().add(syncBackoff(attempts)),
            lastErrorCode: () => e.code,
            lastErrorMessage: () => e.message,
            updatedAt: _clock(),
          ));
          report.retrying++;
          if (e.isNetwork) {
            report.stoppedOffline = true;
            break; // no point trying the rest while offline
          }
          continue;
        }
        // Validation, permission, quota, service availability, closed day…: needs the user.
        await store.upsert(syncing.copyWith(
          state: DraftState.failed,
          attempts: draft.attempts + 1,
          lastErrorCode: () => e.code,
          lastErrorMessage: () => e.message,
          fieldErrors: e.fields,
          updatedAt: _clock(),
        ));
        report.failed++;
      } catch (e) {
        // Unexpected client-side error: keep the data, ask the user.
        await store.upsert(syncing.copyWith(
          state: DraftState.failed,
          lastErrorCode: () => 'INTERNAL_ERROR',
          lastErrorMessage: () => '$e',
          updatedAt: _clock(),
        ));
        report.failed++;
      }
    }
    await refresh();
    return report;
  }

  /// Wipes all device drafts (sign-out). Returns how many were removed.
  Future<int> clearAll() async {
    final n = await store.deleteAll();
    await refresh();
    return n;
  }
}
