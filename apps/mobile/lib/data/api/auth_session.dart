import 'dart:async';

import 'api_exception.dart';
import 'token_store.dart';

typedef RefreshCall = Future<TokenPair> Function(String refreshToken);

/// Owns the current token pair and performs refreshes.
///
/// Each refresh token works ONCE; presenting a used one revokes the whole session. So refreshes
/// are single-flight: concurrent callers that hit a 401 share one in-flight refresh, and a caller
/// whose failing token is already stale simply gets the newer pair without refreshing again.
/// The new pair is persisted before it is handed out.
class AuthSession {
  AuthSession({required this.store, required this.refreshCall});

  final TokenStore store;
  final RefreshCall refreshCall;

  TokenPair? _current;
  Future<TokenPair?>? _inFlight;
  bool _loaded = false;
  final _endedController = StreamController<void>.broadcast();

  /// Emits when the session can no longer be used (refresh rejected). The UI returns to sign-in.
  Stream<void> get onSessionEnded => _endedController.stream;

  TokenPair? get current => _current;
  bool get isSignedIn => _current != null;

  Future<TokenPair?> load() async {
    if (!_loaded) {
      _current = await store.read();
      _loaded = true;
    }
    return _current;
  }

  Future<void> setTokens(TokenPair pair) async {
    await store.write(pair);
    _current = pair;
    _loaded = true;
  }

  Future<void> clear() async {
    _current = null;
    _loaded = true;
    await store.clear();
  }

  /// Returns a usable access token, refreshing proactively when it is about to expire.
  Future<String?> accessToken() async {
    await load();
    final c = _current;
    if (c == null) return null;
    if (c.expiresWithin(const Duration(seconds: 30))) {
      try {
        final fresh = await refresh(staleAccessToken: c.accessToken);
        return fresh?.accessToken;
      } on ApiException catch (e) {
        // Offline: send the old token anyway; the request fails with a network error.
        if (e.isNetwork) return c.accessToken;
        rethrow;
      }
    }
    return c.accessToken;
  }

  /// Refreshes once for everyone. If [staleAccessToken] is no longer the current access token,
  /// another caller already refreshed: return the current pair without calling the server.
  ///
  /// Returns null when the session is over (no tokens, or the server rejected the refresh).
  /// Throws [ApiException] with a network code when the server could not be reached; tokens are
  /// kept so a later attempt can succeed.
  Future<TokenPair?> refresh({String? staleAccessToken}) {
    final inFlight = _inFlight;
    if (inFlight != null) return inFlight;
    final c = _current;
    if (c == null) return Future.value(null);
    if (staleAccessToken != null && c.accessToken != staleAccessToken) return Future.value(c);

    final future = _doRefresh(c);
    _inFlight = future;
    return future.whenComplete(() => _inFlight = null);
  }

  Future<TokenPair?> _doRefresh(TokenPair c) async {
    try {
      final next = await refreshCall(c.refreshToken);
      await store.write(next); // persist before use: a crash must not lose the only valid token
      _current = next;
      return next;
    } on ApiException catch (e) {
      if (e.isNetwork || e.isTransient && !e.isAuth) rethrow;
      // Rejected (expired, revoked, reused): the session is over.
      await clear();
      _endedController.add(null);
      return null;
    }
  }

  Future<void> dispose() => _endedController.close();
}
