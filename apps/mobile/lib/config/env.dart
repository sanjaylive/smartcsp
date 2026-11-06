import 'package:flutter/foundation.dart';

/// Build-time configuration. Override with `--dart-define=API_BASE_URL=https://api.example.com`.
class Env {
  Env._();

  static const String _apiBaseUrlDefine = String.fromEnvironment('API_BASE_URL');

  /// Device label sent at sign-in so users can recognise this session in "Active sessions".
  static const String deviceName = String.fromEnvironment('DEVICE_NAME', defaultValue: 'CSP2All mobile');

  /// The API base URL without a trailing slash.
  ///
  /// Defaults for local development: the Android emulator reaches the host machine at
  /// 10.0.2.2; the iOS simulator shares the host network, so localhost works there.
  static String get apiBaseUrl {
    final v = _apiBaseUrlDefine.isNotEmpty ? _apiBaseUrlDefine : _platformDefault();
    return v.endsWith('/') ? v.substring(0, v.length - 1) : v;
  }

  static String _platformDefault() {
    if (kIsWeb) return 'http://localhost:4610';
    return defaultTargetPlatform == TargetPlatform.android ? 'http://10.0.2.2:4610' : 'http://localhost:4610';
  }
}
