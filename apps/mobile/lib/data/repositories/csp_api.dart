import 'package:dio/dio.dart';

import '../api/api_client.dart';
import '../models/auth_models.dart';
import '../models/json.dart';
import '../models/money_models.dart';
import '../models/payment_models.dart';
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

  /// Update your own display name and/or preferred language.
  Future<MeResponse> updateProfile({String? displayName, String? locale}) async => MeResponse.fromJson(await client.patch('/v1/auth/me', body: {
        if (displayName != null) 'displayName': displayName.trim(),
        'locale': ?locale,
      }));

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

  // ---------------------------------------------------------------- DMT beneficiaries
  Future<List<Beneficiary>> beneficiaries(String customerId) async =>
      asJsonList((await client.get('/v1/customers/$customerId/beneficiaries'))['items']).map(Beneficiary.fromJson).toList();

  Future<Beneficiary> createBeneficiary(String customerId, {required String name, required String bankName, required String accountNumber, String? ifsc}) async =>
      Beneficiary.fromJson(await client.post('/v1/customers/$customerId/beneficiaries', body: {
        'name': name.trim(),
        'bankName': bankName.trim(),
        'accountNumber': accountNumber.replaceAll(RegExp(r'[\s-]'), ''),
        'ifsc': (ifsc ?? '').trim().isEmpty ? null : ifsc!.trim().toUpperCase(),
      }));

  /// Whether names can be verified through the shop's connected provider (Pay2All).
  Future<bool> accountVerifyAvailable() async => (await client.get('/v1/beneficiaries/verify'))['available'] == true;

  Future<AccountVerifyResult> verifyAccount({required String accountNumber, required String ifsc}) async =>
      AccountVerifyResult.fromJson(await client.post('/v1/beneficiaries/verify', body: {'accountNumber': accountNumber, 'ifsc': ifsc.toUpperCase()}));

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

  Future<NotificationsPage> notificationsFeed({int page = 1, bool unreadOnly = false}) async => NotificationsPage.fromJson(
      await client.get('/v1/notifications', query: {'page': page, 'pageSize': 15, if (unreadOnly) 'unread': 'true'}));

  Future<int> unreadNotifications() async => intOf(await client.get('/v1/notifications', query: {'page': 1, 'pageSize': 1}), 'unread');

  Future<void> markNotificationRead(String id) => client.post('/v1/notifications/$id/read');

  Future<void> markAllNotificationsRead() => client.post('/v1/notifications/read-all');

  // ---------------------------------------------------------------- shop payment accounts
  Future<List<PaymentAccount>> paymentAccounts() async =>
      asJsonList((await client.get('/v1/payment-accounts'))['items']).map(PaymentAccount.fromJson).toList();

  Future<PaymentAccount> createPaymentAccount(Json body) async => PaymentAccount.fromJson(await client.post('/v1/payment-accounts', body: body));

  Future<PaymentAccount> updatePaymentAccount(String id, int version, Json body) async =>
      PaymentAccount.fromJson(await client.patch('/v1/payment-accounts/$id', body: {'version': version, ...body}));

  /// Returns true when deleted, false when switched off (already used on records).
  Future<bool> deletePaymentAccount(String id) async => (await client.delete('/v1/payment-accounts/$id'))['deleted'] == true;

  /// Uploads the shop's printed UPI QR image (PNG/JPEG) for a UPI account.
  Future<void> uploadPaymentQr(String accountId, List<int> bytes, String fileName) => client.post('/v1/attachments',
      body: FormData.fromMap({
        'ownerType': 'PAYMENT_QR',
        'ownerId': accountId,
        'file': MultipartFile.fromBytes(bytes, filename: fileName),
      }));

  /// Short-lived link to an uploaded file.
  Future<String> attachmentUrl(String id) async => str(await client.get('/v1/attachments/$id/url'), 'url');

  // ---------------------------------------------------------------- Pay2All connector
  Future<ConnectorOverview> integrations() async => ConnectorOverview.fromJson(await client.get('/v1/integrations'));

  Future<void> configurePay2all({required String mode, required List<String> enabledServices, String? apiToken}) =>
      client.put('/v1/integrations/pay2all', body: {
        'mode': mode,
        'enabledServices': enabledServices,
        if (apiToken != null && apiToken.trim().isNotEmpty) 'credentials': {'apiToken': apiToken.trim()},
      });

  Future<(bool, String)> pay2allHealth() async {
    final r = await client.post('/v1/integrations/pay2all/health');
    return (boolOf(r, 'ok'), str(r, 'detail'));
  }

  /// Pay2All operators, grouped by service name.
  Future<List<P2AOperator>> p2aOperators() async {
    final r = await client.get('/v1/pay2all/providers');
    final services = r['services'] is List ? asJsonList(r['services']) : asJsonList(r['items']);
    return [
      for (final svc in services)
        for (final p in asJsonList(svc['providers'])) P2AOperator(intOf(p, 'provider_id'), str(p, 'name'), '${str(svc, 'service')} ${str(svc, 'code')}'),
    ];
  }

  Future<Json> p2aLookup(String number, {String type = 'mobile'}) => client.post('/v1/pay2all/lookup', body: {'number': number, 'type': type});

  Future<List<P2APlan>> p2aPlans(int providerId, {String? circleId}) async =>
      asJsonList((await client.get('/v1/pay2all/plans', query: {'providerId': providerId, 'circleId': circleId}))['plans']).map(P2APlan.fromJson).toList();

  Future<List<(String, String)>> p2aBillCategories() async {
    final r = await client.get('/v1/pay2all/bbps/categories');
    final list = r['items'] is List ? asJsonList(r['items']) : const <Json>[];
    return [for (final c in list) (str(c, 'billerSlug'), str(c, 'name'))];
  }

  Future<List<(String, String)>> p2aBillers(String category) async =>
      [for (final b in asJsonList((await client.get('/v1/pay2all/bbps/billers', query: {'category': category}))['billers'])) (str(b, 'billerId'), str(b, 'billerName'))];

  Future<List<BillerParam>> p2aBillerParams(String billerId) async => [
        for (final p in asJsonList((await client.get('/v1/pay2all/bbps/billers/${Uri.encodeComponent(billerId)}'))['params']))
          BillerParam(
            name: str(p, 'paramName'),
            optional: boolOf(p, 'optional'),
            numeric: str(p, 'dataType').toUpperCase().contains('NUM'),
            maxLength: intOrNull(p, 'maxLength'),
          ),
      ];

  Future<FetchedBill> p2aFetchBill({required String billerId, required Map<String, String> params, required String mobile}) async =>
      FetchedBill.fromJson(await client.post('/v1/pay2all/bbps/fetch', body: {'billerId': billerId, 'params': params, 'mobile': mobile}));

  /// Sends a Live operation (recharge / bill) to the provider. The operator has confirmed it.
  Future<ProviderOperation> executeLive(RecordDraftData data, Json live, {required String idempotencyKey}) async {
    final body = data.toApiJson()
      ..remove('post')
      ..remove('opStatus')
      ..remove('clientRef');
    return ProviderOperation.fromJson(
        await client.post('/v1/provider-operations', idempotencyKey: idempotencyKey, body: {...body, 'confirmed': true, 'live': live}));
  }

  Future<ProviderOperation> providerOperation(String id) async => ProviderOperation.fromJson(await client.get('/v1/provider-operations/$id'));
}
