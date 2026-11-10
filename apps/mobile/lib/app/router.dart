import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/auth/login_screen.dart';
import '../features/auth/select_shop_screen.dart';
import '../features/customers/customers_screen.dart';
import '../features/home/home_screen.dart';
import '../features/money/cash_screen.dart';
import '../features/money/dues_screen.dart';
import '../features/money/followups_screen.dart';
import '../features/onboarding/onboarding_screen.dart';
import '../features/payments/integrations_screen.dart';
import '../features/payments/payment_accounts_screen.dart';
import '../features/records/drafts_screen.dart';
import '../features/records/record_detail_screen.dart';
import '../features/records/record_form_screen.dart';
import '../features/records/records_list_screen.dart';
import '../features/settings/settings_screens.dart';
import '../l10n/strings.dart';
import '../state/providers.dart';
import '../widgets/brand.dart';

final _rootKey = GlobalKey<NavigatorState>(debugLabel: 'root');

/// Pure redirect rule (unit-testable): where should [location] go for this auth state?
String? authRedirect(AuthState auth, String location) {
  const preAuth = {'/splash', '/login'};
  switch (auth.status) {
    case AuthStatus.unknown:
      return location == '/splash' ? null : '/splash';
    case AuthStatus.signedOut:
      return location == '/login' ? null : '/login';
    case AuthStatus.signedIn:
      if (auth.needsOnboarding) return location == '/onboarding' ? null : '/onboarding';
      if (auth.needsShopSelection) return location == '/select-shop' ? null : '/select-shop';
      if (preAuth.contains(location) || location == '/onboarding') return '/';
      return null;
  }
}

final routerProvider = Provider<GoRouter>((ref) {
  final refresh = ValueNotifier<int>(0);
  ref.listen(authProvider, (_, _) => refresh.value++);
  ref.onDispose(refresh.dispose);

  GoRoute page(String path, Widget Function(GoRouterState s) build) =>
      GoRoute(path: path, parentNavigatorKey: _rootKey, builder: (_, s) => build(s));

  final router = GoRouter(
    navigatorKey: _rootKey,
    initialLocation: '/splash',
    refreshListenable: refresh,
    redirect: (context, state) => authRedirect(ref.read(authProvider), state.matchedLocation),
    routes: [
      page('/splash', (_) => const SplashScreen()),
      page('/login', (_) => const LoginScreen()),
      page('/onboarding', (_) => const OnboardingScreen()),
      page('/select-shop', (_) => const SelectShopScreen()),
      page('/records/new', (s) => RecordFormScreen(
            serviceCode: s.uri.queryParameters['service'] ?? 'CUSTOM',
            customServiceId: s.uri.queryParameters['custom'],
            draftId: s.uri.queryParameters['draft'],
          )),
      page('/records/:id', (s) => RecordDetailScreen(id: s.pathParameters['id']!)),
      page('/customers/pick', (_) => const CustomersScreen(pickMode: true)),
      page('/drafts', (_) => const DraftsScreen()),
      page('/dues', (_) => const DuesScreen()),
      page('/follow-ups', (_) => const FollowUpsScreen()),
      page('/cash', (_) => const CashScreen()),
      page('/closing', (s) => ClosingScreen(initialDate: s.uri.queryParameters['date'])),
      page('/notifications', (_) => const NotificationsScreen()),
      page('/settings', (_) => const SettingsScreen()),
      page('/settings/sessions', (_) => const SessionsScreen()),
      page('/settings/payments', (_) => const PaymentAccountsScreen()),
      page('/settings/integrations', (_) => const IntegrationsScreen()),
      StatefulShellRoute.indexedStack(
        builder: (context, state, shell) => _Shell(shell: shell),
        branches: [
          StatefulShellBranch(routes: [GoRoute(path: '/', builder: (_, _) => const HomeScreen())]),
          StatefulShellBranch(routes: [GoRoute(path: '/records', builder: (_, s) => RecordsListScreen(initialService: s.uri.queryParameters['service']))]),
          StatefulShellBranch(routes: [GoRoute(path: '/customers', builder: (_, _) => const CustomersScreen())]),
          StatefulShellBranch(routes: [GoRoute(path: '/more', builder: (_, _) => const MoreScreen())]),
        ],
      ),
    ],
  );
  ref.onDispose(router.dispose);
  return router;
});

class _Shell extends ConsumerWidget {
  const _Shell({required this.shell});
  final StatefulNavigationShell shell;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = context.s;
    final unsynced = ref.watch(syncProvider.select((x) => x.unsynced));
    return Scaffold(
      body: shell,
      bottomNavigationBar: NavigationBar(
        selectedIndex: shell.currentIndex,
        onDestinationSelected: (i) => shell.goBranch(i, initialLocation: i == shell.currentIndex),
        destinations: [
          NavigationDestination(icon: const Icon(Icons.home_outlined), selectedIcon: const Icon(Icons.home_rounded), label: s.t('mobile.nav.home')),
          NavigationDestination(icon: const Icon(Icons.receipt_long_outlined), selectedIcon: const Icon(Icons.receipt_long_rounded), label: s.t('nav.records')),
          NavigationDestination(icon: const Icon(Icons.people_outline_rounded), selectedIcon: const Icon(Icons.people_rounded), label: s.t('nav.customers')),
          NavigationDestination(
            icon: Badge(isLabelVisible: unsynced > 0, label: Text('$unsynced'), child: const Icon(Icons.more_horiz_rounded)),
            label: s.t('nav.more'),
          ),
        ],
      ),
    );
  }
}
