import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app/app.dart';
import 'config/env.dart';
import 'data/api/token_store.dart';
import 'data/local/draft_store.dart';
import 'state/providers.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Release builds must talk to the API over HTTPS (Android/iOS also block cleartext in release).
  if (kReleaseMode && !Env.apiBaseUrl.startsWith('https://')) {
    runApp(const _ConfigErrorApp());
    return;
  }

  final prefs = await SharedPreferences.getInstance();
  final drafts = await SqfliteDraftStore.open();
  final services = await createAppServices(prefs: prefs, drafts: drafts, tokenStore: SecureTokenStore.new);
  runApp(ProviderScope(
    overrides: [servicesProvider.overrideWithValue(services)],
    // Network calls surface errors to the UI (with a retry button) instead of retrying silently.
    retry: (_, _) => null,
    child: const CspApp(),
  ));
}

class _ConfigErrorApp extends StatelessWidget {
  const _ConfigErrorApp();

  @override
  Widget build(BuildContext context) => const MaterialApp(
        home: Scaffold(
          body: Center(
            child: Padding(
              padding: EdgeInsets.all(24),
              child: Text(
                'This build is misconfigured: API_BASE_URL must be an https:// URL for release builds.\n'
                'Rebuild with --dart-define=API_BASE_URL=https://your-api-host',
                textAlign: TextAlign.center,
              ),
            ),
          ),
        ),
      );
}
