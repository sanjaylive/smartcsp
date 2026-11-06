import 'package:csp2all_mobile/app/router.dart';
import 'package:csp2all_mobile/data/models/auth_models.dart';
import 'package:csp2all_mobile/state/providers.dart';
import 'package:flutter_test/flutter_test.dart';

import '../helpers.dart';

void main() {
  test('unknown → splash; signed out → login', () {
    expect(authRedirect(const AuthState(status: AuthStatus.unknown), '/'), '/splash');
    expect(authRedirect(const AuthState(status: AuthStatus.signedOut), '/records'), '/login');
    expect(authRedirect(const AuthState(status: AuthStatus.signedOut), '/login'), isNull);
  });

  test('signed in without shops → onboarding; with shops but none active → shop selection', () {
    final noShop = AuthState(status: AuthStatus.signedIn, me: MeResponse.fromJson(meJson(activeTenantId: null, withTenant: false)));
    expect(authRedirect(noShop, '/'), '/onboarding');
    final pick = AuthState(status: AuthStatus.signedIn, me: MeResponse.fromJson(meJson(activeTenantId: null)));
    expect(authRedirect(pick, '/'), '/select-shop');
  });

  test('signed in with an active shop leaves auth screens for home and allows app routes', () {
    final ok = AuthState(status: AuthStatus.signedIn, me: MeResponse.fromJson(meJson()));
    expect(authRedirect(ok, '/login'), '/');
    expect(authRedirect(ok, '/onboarding'), '/');
    expect(authRedirect(ok, '/records/new'), isNull);
    expect(authRedirect(ok, '/select-shop'), isNull); // switching shops
  });
}
