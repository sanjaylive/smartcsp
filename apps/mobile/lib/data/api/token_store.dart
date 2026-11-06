import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

@immutable
class TokenPair {
  const TokenPair({required this.accessToken, required this.refreshToken, required this.accessTokenExpiresAt});

  final String accessToken;
  final String refreshToken;
  final DateTime accessTokenExpiresAt;

  factory TokenPair.fromJson(Map<String, Object?> j) => TokenPair(
        accessToken: j['accessToken'] as String,
        refreshToken: j['refreshToken'] as String,
        accessTokenExpiresAt: DateTime.parse(j['accessTokenExpiresAt'] as String),
      );

  Map<String, Object> toJson() => {
        'accessToken': accessToken,
        'refreshToken': refreshToken,
        'accessTokenExpiresAt': accessTokenExpiresAt.toUtc().toIso8601String(),
      };

  bool expiresWithin(Duration d, {DateTime? now}) => accessTokenExpiresAt.isBefore((now ?? DateTime.now()).add(d));
}

/// Persists the token pair. Implementations must write both tokens atomically.
abstract class TokenStore {
  Future<TokenPair?> read();
  Future<void> write(TokenPair pair);
  Future<void> clear();
}

/// Tokens live ONLY in the platform keystore/keychain. The pair is stored as one JSON value under
/// one key, so an access token can never be paired with a stale refresh token.
class SecureTokenStore implements TokenStore {
  SecureTokenStore([FlutterSecureStorage? storage])
      : _storage = storage ??
            const FlutterSecureStorage(
              iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock_this_device),
            );

  static const _key = 'csp2all.tokens.v1';
  final FlutterSecureStorage _storage;

  @override
  Future<TokenPair?> read() async {
    try {
      final raw = await _storage.read(key: _key);
      if (raw == null) return null;
      return TokenPair.fromJson((jsonDecode(raw) as Map).cast<String, Object?>());
    } catch (_) {
      // Corrupt or unreadable (e.g. keystore reset after restore): treat as signed out.
      await clear();
      return null;
    }
  }

  @override
  Future<void> write(TokenPair pair) => _storage.write(key: _key, value: jsonEncode(pair.toJson()));

  @override
  Future<void> clear() async {
    try {
      await _storage.delete(key: _key);
    } catch (_) {}
  }
}

/// In-memory store for tests.
class MemoryTokenStore implements TokenStore {
  MemoryTokenStore([this._pair]);
  TokenPair? _pair;
  int writes = 0;

  @override
  Future<TokenPair?> read() async => _pair;

  @override
  Future<void> write(TokenPair pair) async {
    writes++;
    _pair = pair;
  }

  @override
  Future<void> clear() async => _pair = null;
}
