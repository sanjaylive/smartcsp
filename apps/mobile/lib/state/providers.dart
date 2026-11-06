import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../config/env.dart';
import '../core/dates.dart';
import '../data/api/api_client.dart';
import '../data/api/api_exception.dart';
import '../data/api/auth_session.dart';
import '../data/api/token_store.dart';
import '../data/local/draft_store.dart';
import '../data/local/sync_queue.dart';
import '../data/models/auth_models.dart';
import '../data/models/money_models.dart';
import '../data/models/record_models.dart';
import '../data/models/tenant_models.dart';
import '../data/repositories/csp_api.dart';

/// Long-lived singletons created in main() (or in tests) and injected via ProviderScope overrides.
class AppServices {
  AppServices({required this.session, required this.api, required this.drafts, required this.queue, required this.prefs, this.connectivity});

  final AuthSession session;
  final CspApi api;
  final DraftStore drafts;
  final SyncQueue queue;
  final SharedPreferences prefs;

  /// Null in tests: the app then assumes it is online.
  final Connectivity? connectivity;
}

final servicesProvider = Provider<AppServices>((ref) => throw UnimplementedError('Override servicesProvider in main()'));

final apiProvider = Provider<CspApi>((ref) => ref.watch(servicesProvider).api);

// ------------------------------------------------------------------ settings

class AppSettings {
  const AppSettings({required this.languageCode, required this.themeMode});
  final String languageCode;
  final ThemeMode themeMode;

  Locale get locale => Locale(languageCode);
}

class SettingsNotifier extends Notifier<AppSettings> {
  static const _langKey = 'settings.language';
  static const _themeKey = 'settings.theme';

  SharedPreferences get _prefs => ref.read(servicesProvider).prefs;

  @override
  AppSettings build() {
    final lang = _prefs.getString(_langKey) ?? 'en';
    final theme = ThemeMode.values.firstWhere((m) => m.name == _prefs.getString(_themeKey), orElse: () => ThemeMode.system);
    return AppSettings(languageCode: lang == 'hi' ? 'hi' : 'en', themeMode: theme);
  }

  Future<void> setLanguage(String code) async {
    await _prefs.setString(_langKey, code);
    state = AppSettings(languageCode: code, themeMode: state.themeMode);
  }

  Future<void> setThemeMode(ThemeMode mode) async {
    await _prefs.setString(_themeKey, mode.name);
    state = AppSettings(languageCode: state.languageCode, themeMode: mode);
  }
}

final settingsProvider = NotifierProvider<SettingsNotifier, AppSettings>(SettingsNotifier.new);

// ------------------------------------------------------------------ auth

enum AuthStatus { unknown, signedOut, signedIn }

class AuthState {
  const AuthState({required this.status, this.me, this.offline = false});
  final AuthStatus status;
  final MeResponse? me;

  /// Signed in with stored tokens but the server could not be reached at start-up.
  final bool offline;

  String? get activeTenantId => me?.activeTenantId;
  String? get userId => me?.user.id;

  /// Where a signed-in user without an active shop should go.
  bool get needsOnboarding => me != null && me!.activeTenantId == null && me!.tenants.isEmpty;
  bool get needsShopSelection => me != null && me!.activeTenantId == null && me!.tenants.isNotEmpty;
}

class AuthNotifier extends Notifier<AuthState> {
  StreamSubscription<void>? _ended;

  AppServices get _svc => ref.read(servicesProvider);

  @override
  AuthState build() {
    _ended = _svc.session.onSessionEnded.listen((_) => _signedOut());
    ref.onDispose(() => _ended?.cancel());
    Future.microtask(bootstrap);
    return const AuthState(status: AuthStatus.unknown);
  }

  static const _meCacheKey = 'auth.lastMe';

  Future<void> bootstrap() async {
    final tokens = await _svc.session.load();
    if (tokens == null) {
      state = const AuthState(status: AuthStatus.signedOut);
      return;
    }
    try {
      await _setMe(await _svc.api.me());
    } on ApiException catch (e) {
      if (e.isNetwork || e.isTransient) {
        // Offline start: use the cached identity so drafts can still be captured.
        final cached = _cachedMe();
        if (cached != null) {
          state = AuthState(status: AuthStatus.signedIn, me: cached, offline: true);
          await _svc.queue.setScope(tenantId: cached.activeTenantId, userId: cached.user.id);
          return;
        }
      }
      if (e.isAuth) await _svc.session.clear();
      state = const AuthState(status: AuthStatus.signedOut);
    }
  }

  MeResponse? _cachedMe() {
    final userId = _svc.prefs.getString('$_meCacheKey.userId');
    final email = _svc.prefs.getString('$_meCacheKey.email');
    final tenantId = _svc.prefs.getString('$_meCacheKey.tenantId');
    final tenantName = _svc.prefs.getString('$_meCacheKey.tenantName') ?? '';
    final role = _svc.prefs.getString('$_meCacheKey.role') ?? '';
    if (userId == null || email == null || tenantId == null) return null;
    return MeResponse(
      user: AppUser(id: userId, email: email),
      activeTenantId: tenantId,
      tenants: [TenantMembership(tenantId: tenantId, name: tenantName, role: role, status: 'ACTIVE', tenantStatus: 'ACTIVE')],
    );
  }

  Future<void> _setMe(MeResponse me) async {
    state = AuthState(status: AuthStatus.signedIn, me: me);
    final p = _svc.prefs;
    await p.setString('$_meCacheKey.userId', me.user.id);
    await p.setString('$_meCacheKey.email', me.user.email);
    final active = me.activeTenant;
    if (active != null) {
      await p.setString('$_meCacheKey.tenantId', active.tenantId);
      await p.setString('$_meCacheKey.tenantName', active.name);
      await p.setString('$_meCacheKey.role', active.role);
    } else {
      await p.remove('$_meCacheKey.tenantId');
    }
    await _svc.queue.setScope(tenantId: me.activeTenantId, userId: me.user.id);
  }

  Future<void> completeSignIn(VerifyResult r) async {
    await _svc.session.setTokens(r.tokens);
    await _setMe(r.me);
  }

  Future<void> reloadMe() async => _setMe(await _svc.api.me());

  Future<void> applyMe(MeResponse me) => _setMe(me);

  Future<void> selectTenant(String tenantId) async => _setMe(await _svc.api.selectTenant(tenantId));

  Future<void> logout({bool allDevices = false}) async {
    try {
      allDevices ? await _svc.api.logoutAll() : await _svc.api.logout();
    } on ApiException catch (_) {
      // Sign out locally even if the server is unreachable; the token expires on its own.
    }
    await _signedOut();
  }

  Future<void> _signedOut() async {
    await _svc.session.clear();
    // Drafts belong to the signed-in user; never leave them for the next person on this device.
    await _svc.queue.clearAll();
    await _svc.queue.setScope(tenantId: null, userId: null);
    for (final k in _svc.prefs.getKeys().where((k) => k.startsWith(_meCacheKey)).toList()) {
      await _svc.prefs.remove(k);
    }
    state = const AuthState(status: AuthStatus.signedOut);
  }
}

final authProvider = NotifierProvider<AuthNotifier, AuthState>(AuthNotifier.new);

final activeTenantIdProvider = Provider<String?>((ref) => ref.watch(authProvider.select((a) => a.activeTenantId)));

// ------------------------------------------------------------------ connectivity & sync

final onlineProvider = StreamProvider<bool>((ref) async* {
  final c = ref.watch(servicesProvider).connectivity;
  if (c == null) {
    yield true;
    return;
  }
  bool isOnline(List<ConnectivityResult> r) => r.any((x) => x != ConnectivityResult.none);
  yield isOnline(await c.checkConnectivity());
  yield* c.onConnectivityChanged.map(isOnline).distinct();
});

class SyncSnapshot {
  const SyncSnapshot({required this.drafts, required this.pending, required this.failed, required this.running});
  final List<LocalDraft> drafts;
  final int pending;
  final int failed;
  final bool running;

  int get unsynced => drafts.where((d) => d.isUnsynced).length;
}

/// Mirrors the [SyncQueue] into Riverpod and drives automatic syncing: on start, when the device
/// comes back online, every minute while the app is open, and after each new draft.
class SyncNotifier extends Notifier<SyncSnapshot> {
  Timer? _timer;

  SyncQueue get _queue => ref.read(servicesProvider).queue;

  @override
  SyncSnapshot build() {
    final q = _queue;
    void onChange() => state = _snap(q);
    q.addListener(onChange);
    _timer = Timer.periodic(const Duration(minutes: 1), (_) => trigger());
    ref.listen<AsyncValue<bool>>(onlineProvider, (prev, next) {
      if (next.value == true && prev?.value != true) trigger();
    });
    // Listening also guarantees the auth notifier exists, which sets the queue's (shop, user) scope.
    ref.listen<String?>(activeTenantIdProvider, (_, _) => trigger());
    ref.onDispose(() {
      q.removeListener(onChange);
      _timer?.cancel();
    });
    return _snap(q);
  }

  SyncSnapshot _snap(SyncQueue q) => SyncSnapshot(drafts: q.drafts, pending: q.pendingCount, failed: q.failedCount, running: q.isRunning);

  Future<SyncReport?> trigger({bool force = false}) async {
    if (ref.read(authProvider).status != AuthStatus.signedIn) return null;
    if (force) await _queue.retryNow();
    final report = await _queue.runOnce();
    if (report.synced + report.duplicates > 0) {
      ref.invalidate(dashboardProvider);
      ref.invalidate(tenantContextProvider);
    }
    return report;
  }

  Future<LocalDraft> saveDraft(RecordDraftData data, {String? localId}) async {
    final d = await _queue.saveDraft(data, localId: localId);
    unawaited(trigger());
    return d;
  }

  Future<void> delete(String localId) => _queue.deleteDraft(localId);
}

final syncProvider = NotifierProvider<SyncNotifier, SyncSnapshot>(SyncNotifier.new);

// ------------------------------------------------------------------ shop data

final tenantContextProvider = FutureProvider<TenantContext>((ref) async {
  final tenantId = ref.watch(activeTenantIdProvider);
  if (tenantId == null) throw StateError('No active shop');
  return ref.watch(apiProvider).tenantContext();
});

final dashboardProvider = FutureProvider<Dashboard>((ref) async {
  final tenantId = ref.watch(activeTenantIdProvider);
  if (tenantId == null) throw StateError('No active shop');
  return ref.watch(apiProvider).dashboard();
});

/// The shop timezone, falling back to Asia/Kolkata.
final shopTimezoneProvider = Provider<String>((ref) => ref.watch(tenantContextProvider).value?.tenant.timezone ?? defaultTimezone);

final recordDetailProvider = FutureProvider.autoDispose.family<ServiceRecord, String>((ref, id) => ref.watch(apiProvider).record(id));

final duesProvider = FutureProvider.autoDispose<DuesSummary>((ref) => ref.watch(apiProvider).dues());

final followUpsProvider = FutureProvider.autoDispose((ref) => ref.watch(apiProvider).followUps());

final notificationsProvider = FutureProvider.autoDispose((ref) => ref.watch(apiProvider).notifications());

final sessionsProvider = FutureProvider.autoDispose((ref) => ref.watch(apiProvider).sessions());

final cashbookProvider = FutureProvider.autoDispose.family<Cashbook, String>((ref, date) => ref.watch(apiProvider).cashbook(date));

final closingPreviewProvider = FutureProvider.autoDispose.family<ClosingPreview, String>((ref, date) => ref.watch(apiProvider).closingPreview(date));

/// Builds the production [AppServices].
Future<AppServices> createAppServices({required SharedPreferences prefs, required DraftStore drafts, required TokenStoreFactory tokenStore}) async {
  final base = Env.apiBaseUrl;
  final session = AuthSession(store: tokenStore(), refreshCall: ApiClient.refreshCallFor(base));
  final api = CspApi(ApiClient(baseUrl: base, session: session));
  final queue = SyncQueue(store: drafts, submitter: api);
  return AppServices(session: session, api: api, drafts: drafts, queue: queue, prefs: prefs, connectivity: Connectivity());
}

typedef TokenStoreFactory = TokenStore Function();
