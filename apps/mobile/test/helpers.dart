import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:csp2all_mobile/data/api/api_client.dart';
import 'package:csp2all_mobile/data/api/auth_session.dart';
import 'package:csp2all_mobile/data/api/token_store.dart';
import 'package:csp2all_mobile/data/local/draft_store.dart';
import 'package:csp2all_mobile/data/local/sync_queue.dart';
import 'package:csp2all_mobile/data/repositories/csp_api.dart';
import 'package:csp2all_mobile/state/providers.dart';
import 'package:dio/dio.dart';
import 'package:shared_preferences/shared_preferences.dart';

class FakeResponse {
  const FakeResponse(this.status, this.body, {this.delay = Duration.zero});
  final int status;
  final Object? body;
  final Duration delay;
}

typedef FakeHandler = FutureOr<FakeResponse> Function(RequestOptions req);

/// In-memory HTTP adapter for Dio: routes requests to [handler] and records them.
class FakeAdapter implements HttpClientAdapter {
  FakeAdapter(this.handler);
  FakeHandler handler;
  final List<RequestOptions> requests = [];

  List<RequestOptions> to(String method, String path) => requests.where((r) => r.method == method && r.path == path).toList();

  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    requests.add(options);
    final res = await handler(options);
    if (res.delay > Duration.zero) await Future<void>.delayed(res.delay);
    if (res.status == 0) {
      throw DioException.connectionError(requestOptions: options, reason: 'offline (fake)');
    }
    return ResponseBody.fromString(jsonEncode(res.body), res.status, headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType],
    });
  }

  @override
  void close({bool force = false}) {}
}

FakeResponse apiError(int status, String code, {Map<String, List<String>>? fields, Map<String, Object?>? details}) => FakeResponse(status, {
      'error': {'code': code, 'message': code, 'requestId': 'req-test', 'fields': ?fields, 'details': ?details},
    });

TokenPair tokens(String n, {Duration ttl = const Duration(minutes: 15)}) =>
    TokenPair(accessToken: 'access-$n-xxxxxxxxxxxxxxxxxxxx', refreshToken: 'refresh-$n-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', accessTokenExpiresAt: DateTime.now().add(ttl));

Map<String, Object?> tokenJson(TokenPair p) => p.toJson();

const testBase = 'http://api.test';

Future<AppServices> testServices(FakeAdapter adapter, {TokenPair? initialTokens, Map<String, Object> prefs = const {}}) async {
  SharedPreferences.setMockInitialValues(prefs);
  final p = await SharedPreferences.getInstance();
  final session = AuthSession(store: MemoryTokenStore(initialTokens), refreshCall: ApiClient.refreshCallFor(testBase, adapter: adapter));
  final api = CspApi(ApiClient(baseUrl: testBase, session: session, adapter: adapter));
  final drafts = MemoryDraftStore();
  return AppServices(session: session, api: api, drafts: drafts, queue: SyncQueue(store: drafts, submitter: api), prefs: p);
}

// ------------------------------------------------------------------ canned API payloads

const userId = '0190a000-0000-7000-8000-000000000001';
const tenantId = '0190a000-0000-7000-8000-0000000000aa';

Map<String, Object?> meJson({String? activeTenantId = tenantId, bool withTenant = true}) => {
      'user': {'id': userId, 'email': 'owner@example.com', 'displayName': 'Asha', 'locale': 'en'},
      'activeTenantId': activeTenantId,
      'tenants': withTenant
          ? [
              {'tenantId': tenantId, 'name': 'Asha Digital Seva', 'role': 'OWNER', 'status': 'ACTIVE', 'tenantStatus': 'ACTIVE', 'district': 'Jaipur', 'state': 'Rajasthan'},
            ]
          : [],
      'onboarding': withTenant ? null : {'step': 'SHOP'},
    };

Map<String, Object?> contextJson({List<String> permissions = const ['records.view', 'records.create', 'records.post', 'customers.view', 'customers.manage']}) => {
      'tenant': {'id': tenantId, 'name': 'Asha Digital Seva', 'status': 'ACTIVE', 'timezone': 'Asia/Kolkata', 'preferredLanguage': 'en', 'version': 1},
      'membership': {'role': 'OWNER', 'permissions': permissions},
      'services': [
        for (final c in ['RECHARGE', 'DMT', 'AEPS', 'AADHAAR'])
          {'code': c, 'platformEnabled': true, 'selected': true, 'withinPlan': true, 'canCreate': true, 'hasHistory': false, 'reason': null, 'workflowType': c == 'AADHAAR' ? 'APPLICATION' : 'TRANSACTION'},
      ],
      'customServices': [],
      'navigation': [],
      'serviceNavigation': [],
      'quickActions': [
        for (final c in ['RECHARGE', 'DMT', 'AEPS', 'AADHAAR']) {'code': c, 'path': '/app/records/new?service=$c'},
      ],
      'dashboardWidgets': ['volume', 'cashCollected', 'cashPayout', 'pendingApplications'],
      'plan': {'code': 'FREE', 'name': 'Free', 'status': 'ACTIVE', 'fallback': false, 'entitlements': {'monthlyRecordLimit': 300}},
      'usage': {'recordsThisPeriod': 12},
      'supportAccessActive': [],
      'announcements': [],
      'unreadNotifications': 2,
    };

Map<String, Object?> recordJson({int no = 101, bool duplicate = false, String id = '0190a000-0000-7000-8000-00000000r001'}) => {
      'id': id,
      'recordNo': no,
      'serviceCode': 'DMT',
      'customServiceId': null,
      'workflowType': 'TRANSACTION',
      'principalDirection': 'COLLECT',
      'customer': null,
      'walkInName': 'Ramesh',
      'txnDate': '2026-11-06',
      'principalPaise': 500000,
      'customerFeePaise': 2000,
      'expectedCommissionPaise': 0,
      'receivedCommissionPaise': 0,
      'paymentMethod': 'CASH',
      'principalMethod': 'CASH',
      'amountCollectedPaise': 502000,
      'amountAllocatedPaise': 0,
      'amountDuePaise': 0,
      'receivablePaise': 502000,
      'details': {'beneficiaryName': 'Sita', 'bankName': 'Demo Bank', 'accountNumber': '123456789012'},
      'source': 'MOBILE_SYNC',
      'isManual': true,
      'opStatus': 'SUCCESSFUL',
      'paymentStatus': 'PAID',
      'postingStatus': 'UNPOSTED',
      'connectorStatus': 'NONE',
      'clientRef': 'x',
      'createdAt': '2026-11-06T05:00:00.000Z',
      'version': 1,
      'duplicate': duplicate,
    };
