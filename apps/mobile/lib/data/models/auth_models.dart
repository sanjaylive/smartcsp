import '../api/token_store.dart';
import 'json.dart';

class AppUser {
  const AppUser({required this.id, required this.email, this.displayName, this.locale});
  final String id;
  final String email;
  final String? displayName;
  final String? locale;

  factory AppUser.fromJson(Json j) =>
      AppUser(id: str(j, 'id'), email: str(j, 'email'), displayName: strOrNull(j, 'displayName'), locale: strOrNull(j, 'locale'));
}

class TenantMembership {
  const TenantMembership({
    required this.tenantId,
    required this.name,
    required this.role,
    required this.status,
    required this.tenantStatus,
    this.district,
    this.state,
  });

  final String tenantId;
  final String name;
  final String role;
  final String status;
  final String tenantStatus;
  final String? district;
  final String? state;

  String get place => [district, state].whereType<String>().where((s) => s.isNotEmpty).join(', ');

  factory TenantMembership.fromJson(Json j) => TenantMembership(
        tenantId: str(j, 'tenantId'),
        name: str(j, 'name'),
        role: str(j, 'role'),
        status: str(j, 'status'),
        tenantStatus: str(j, 'tenantStatus'),
        district: strOrNull(j, 'district'),
        state: strOrNull(j, 'state'),
      );
}

/// `GET /v1/auth/me`, also returned by verify / select-tenant / onboarding complete.
class MeResponse {
  const MeResponse({required this.user, required this.activeTenantId, required this.tenants, this.onboardingStep});

  final AppUser user;
  final String? activeTenantId;
  final List<TenantMembership> tenants;

  /// Non-null while onboarding is incomplete (e.g. `SHOP`, `SERVICES`).
  final String? onboardingStep;

  TenantMembership? get activeTenant {
    for (final t in tenants) {
      if (t.tenantId == activeTenantId) return t;
    }
    return null;
  }

  factory MeResponse.fromJson(Json j) => MeResponse(
        user: AppUser.fromJson(asJson(j['user'])),
        activeTenantId: strOrNull(j, 'activeTenantId'),
        tenants: asJsonList(j['tenants']).map(TenantMembership.fromJson).toList(),
        onboardingStep: j['onboarding'] is Map ? strOrNull(asJson(j['onboarding']), 'step') : null,
      );
}

class OtpChallenge {
  const OtpChallenge({required this.challengeId, required this.expiresInSeconds, required this.resendAfterSeconds});
  final String challengeId;
  final int expiresInSeconds;
  final int resendAfterSeconds;

  factory OtpChallenge.fromJson(Json j) => OtpChallenge(
        challengeId: str(j, 'challengeId'),
        expiresInSeconds: intOf(j, 'expiresInSeconds', 600),
        resendAfterSeconds: intOf(j, 'resendAfterSeconds', 60),
      );
}

class VerifyResult {
  const VerifyResult({required this.me, required this.tokens});
  final MeResponse me;
  final TokenPair tokens;

  factory VerifyResult.fromJson(Json j) => VerifyResult(me: MeResponse.fromJson(j), tokens: TokenPair.fromJson(asJson(j['tokens'])));
}

class SessionInfo {
  const SessionInfo({required this.id, required this.kind, this.deviceName, this.userAgent, this.createdAt, this.lastSeenAt, required this.current});
  final String id;
  final String kind;
  final String? deviceName;
  final String? userAgent;
  final String? createdAt;
  final String? lastSeenAt;
  final bool current;

  factory SessionInfo.fromJson(Json j) => SessionInfo(
        id: str(j, 'id'),
        kind: str(j, 'kind'),
        deviceName: strOrNull(j, 'deviceName'),
        userAgent: strOrNull(j, 'userAgent'),
        createdAt: strOrNull(j, 'createdAt'),
        lastSeenAt: strOrNull(j, 'lastSeenAt'),
        current: boolOf(j, 'current'),
      );
}

class ShopSetup {
  const ShopSetup({
    required this.shopName,
    required this.ownerName,
    this.contactPhone,
    required this.state,
    required this.district,
    this.address,
    this.preferredLanguage = 'en',
    this.timezone = 'Asia/Kolkata',
  });

  final String shopName;
  final String ownerName;
  final String? contactPhone;
  final String state;
  final String district;
  final String? address;
  final String preferredLanguage;
  final String timezone;

  factory ShopSetup.fromJson(Json j) => ShopSetup(
        shopName: str(j, 'shopName'),
        ownerName: str(j, 'ownerName'),
        contactPhone: strOrNull(j, 'contactPhone'),
        state: str(j, 'state'),
        district: str(j, 'district'),
        address: strOrNull(j, 'address'),
        preferredLanguage: str(j, 'preferredLanguage', 'en'),
        timezone: str(j, 'timezone', 'Asia/Kolkata'),
      );

  Json toJson() => {
        'shopName': shopName.trim(),
        'ownerName': ownerName.trim(),
        'contactPhone': (contactPhone ?? '').trim().isEmpty ? null : contactPhone!.trim(),
        'state': state.trim(),
        'district': district.trim(),
        'address': (address ?? '').trim().isEmpty ? null : address!.trim(),
        'preferredLanguage': preferredLanguage,
        'timezone': timezone,
      };
}

class OnboardingState {
  const OnboardingState({
    required this.step,
    this.shop,
    required this.services,
    this.completedTenantId,
    required this.availableServices,
    required this.planName,
    this.enabledServiceLimit,
  });

  final String step;
  final ShopSetup? shop;
  final List<String> services;
  final String? completedTenantId;
  final List<String> availableServices;
  final String planName;
  final int? enabledServiceLimit;

  factory OnboardingState.fromJson(Json j) {
    final plan = asJson(j['startingPlan']);
    return OnboardingState(
      step: str(j, 'step', 'SHOP'),
      shop: j['shop'] is Map ? ShopSetup.fromJson(asJson(j['shop'])) : null,
      services: strList(j, 'services'),
      completedTenantId: strOrNull(j, 'completedTenantId'),
      availableServices: strList(j, 'availableServices'),
      planName: str(plan, 'name'),
      enabledServiceLimit: intOrNull(plan, 'enabledServiceLimit'),
    );
  }
}
