import '../api/api_client.dart';
import '../models/auth_models.dart';
import '../models/json.dart';
import '../models/money_models.dart';
import '../models/record_models.dart';
import '../models/tenant_models.dart';

/// What the sync queue needs from the server. Implemented by [CspApi]; faked in tests.
abstract class RecordSubmitter {
  Future<ServiceRecord> createRecord(RecordDraftData data, {required String clientRef, required String idempotencyKey});
}

/// Typed endpoints of the CSP2All REST API (source of truth: apps/api/src/modules/**).
class CspApi implements RecordSubmitter {
  CspApi(this.client);
  final ApiClient client;

  // ---------------------------------------------------------------- auth
  Future<OtpChallenge> requestOtp(String email) async =>
      OtpChallenge.fromJson(await client.post('/v1/auth/otp/request', body: {'email': email.trim().toLowerCase(), 'consent': true}));

  Future<VerifyResult> verifyOtp({required String challengeId, required String email, required String code, required String deviceName}) async =>
      VerifyResult.fromJson(await client.post('/v1/auth/otp/verify', body: {
        'challengeId': challengeId,
        'email': email.trim().toLowerCase(),
        'code': code,
        'client': 'mobile',
        'deviceName': deviceName,
      }));

  Future<MeResponse> me() async => MeResponse.fromJson(await client.get('/v1/auth/me'));

  Future<MeResponse> selectTenant(String tenantId) async => MeResponse.fromJson(await client.post('/v1/auth/select-tenant', body: {'tenantId': tenantId}));

  Future<void> logout() => client.post('/v1/auth/logout');

  Future<void> logoutAll() => client.post('/v1/auth/logout-all');

  Future<List<SessionInfo>> sessions() async => asJsonList((await client.get('/v1/auth/sessions'))['items']).map(SessionInfo.fromJson).toList();

  Future<void> revokeSession(String id) => client.delete('/v1/auth/sessions/$id');

  // ---------------------------------------------------------------- onboarding
  Future<OnboardingState> onboarding() async => OnboardingState.fromJson(await client.get('/v1/onboarding'));

  Future<void> saveShop(ShopSetup shop) => client.put('/v1/onboarding/shop', body: shop.toJson());

  Future<void> saveServices(List<String> services) => client.put('/v1/onboarding/services', body: {'services': services});

  Future<MeResponse> completeOnboarding() async => MeResponse.fromJson(await client.post('/v1/onboarding/complete'));

  // ---------------------------------------------------------------- shop
  Future<TenantContext> tenantContext() async => TenantContext.fromJson(await client.get('/v1/tenant/context'));

  Future<Dashboard> dashboard() async => Dashboard.fromJson(await client.get('/v1/dashboard'));

  // ---------------------------------------------------------------- records
  Future<PageResult<ServiceRecord>> records(RecordFilters f, {int page = 1}) async =>
      PageResult.fromJson(await client.get('/v1/records', query: f.toQuery(page)), ServiceRecord.fromJson);

  Future<ServiceRecord> record(String id) async => ServiceRecord.fromJson(await client.get('/v1/records/$id'));

  @override
  Future<ServiceRecord> createRecord(RecordDraftData data, {String? clientRef, required String idempotencyKey}) async =>
      ServiceRecord.fromJson(await client.post('/v1/records', body: data.toApiJson(clientRef: clientRef), idempotencyKey: idempotencyKey));

  Future<PostingPreview> postingPreview(RecordDraftData data) async =>
      PostingPreview.fromJson(await client.post('/v1/records/posting-preview', body: data.toApiJson()..remove('post')));

  Future<ServiceRecord> transition(String id, {required int version, required String to, String? reason, bool? reversePosting}) async =>
      ServiceRecord.fromJson(await client.post('/v1/records/$id/transitions', body: {
        'version': version,
        'to': to,
        if (reason != null && reason.trim().isNotEmpty) 'reason': reason.trim(),
        'reversePosting': ?reversePosting,
      }));

  Future<ServiceRecord> postRecord(String id, int version) async =>
      ServiceRecord.fromJson(await client.post('/v1/records/$id/post', body: {'version': version}));

  // ---------------------------------------------------------------- customers
  Future<PageResult<Customer>> customers({String? q, int page = 1}) async =>
      PageResult.fromJson(await client.get('/v1/customers', query: {'q': q, 'page': page, 'pageSize': 25}), Customer.fromJson);

  Future<Customer> createCustomer({required String name, String? phone, String? notes}) async => Customer.fromJson(await client.post('/v1/customers', body: {
        'name': name.trim(),
        'phone': (phone ?? '').trim().isEmpty ? null : phone!.trim(),
        'notes': (notes ?? '').trim().isEmpty ? null : notes!.trim(),
      }));

  // ---------------------------------------------------------------- follow-ups
  Future<PageResult<FollowUp>> followUps({int page = 1}) async =>
      PageResult.fromJson(await client.get('/v1/follow-ups', query: {'status': 'OPEN', 'page': page, 'pageSize': 50}), FollowUp.fromJson);

  Future<void> completeFollowUp(String id, int version) => client.patch('/v1/follow-ups/$id', body: {'version': version, 'status': 'DONE'});

  // ---------------------------------------------------------------- dues
  Future<DuesSummary> dues() async => DuesSummary.fromJson(await client.get('/v1/dues'));

  Future<CollectionResult> collect({
    String? customerId,
    required String method,
    required String receivedOn,
    required Map<String, int> allocations,
    required String idempotencyKey,
  }) async =>
      CollectionResult.fromJson(await client.post('/v1/collections', idempotencyKey: idempotencyKey, body: {
        'customerId': customerId,
        'method': method,
        'receivedOn': receivedOn,
        'allocations': [
          for (final e in allocations.entries)
            if (e.value > 0) {'recordId': e.key, 'amountPaise': e.value},
        ],
      }));

  // ---------------------------------------------------------------- cash
  Future<Cashbook> cashbook(String date, {String account = 'CASH'}) async =>
      Cashbook.fromJson(await client.get('/v1/cashbook', query: {'date': date, 'account': account}));

  Future<ClosingPreview> closingPreview(String date) async => ClosingPreview.fromJson(await client.get('/v1/closings/$date/preview'));

  Future<void> closeDay({required String businessDate, required int countedCashPaise, String? notes, required String idempotencyKey}) =>
      client.post('/v1/closings', idempotencyKey: idempotencyKey, body: {
        'businessDate': businessDate,
        'countedCashPaise': countedCashPaise,
        'notes': (notes ?? '').trim().isEmpty ? null : notes!.trim(),
      });

  // ---------------------------------------------------------------- notifications
  Future<PageResult<AppNotification>> notifications({int page = 1}) async =>
      PageResult.fromJson(await client.get('/v1/notifications', query: {'page': page, 'pageSize': 30}), AppNotification.fromJson);

  Future<void> markNotificationRead(String id) => client.post('/v1/notifications/$id/read');

  Future<void> markAllNotificationsRead() => client.post('/v1/notifications/read-all');
}
