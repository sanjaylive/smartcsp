import 'package:dio/dio.dart';

/// Normalised API error. Server errors follow `{error:{code,message,requestId,fields?,details?}}`
/// with stable codes from packages/shared/src/errors.ts. Transport failures use the synthetic
/// codes `NETWORK` and `TIMEOUT`.
class ApiException implements Exception {
  ApiException({
    required this.code,
    required this.message,
    this.status,
    this.requestId,
    this.fields = const {},
    this.details = const {},
  });

  final String code;
  final String message;
  final int? status;
  final String? requestId;

  /// Field-level messages keyed by dotted path, e.g. `details.accountLast4`.
  final Map<String, List<String>> fields;
  final Map<String, Object?> details;

  /// No response reached us: the request may be retried safely (with the same Idempotency-Key).
  bool get isNetwork => code == 'NETWORK' || code == 'TIMEOUT';

  bool get isAuth => status == 401 || code == 'UNAUTHENTICATED' || code == 'SESSION_EXPIRED';

  /// Server-side 5xx and rate limits are transient; the sync queue retries them with backoff.
  bool get isTransient => isNetwork || (status != null && status! >= 500) || code == 'RATE_LIMITED' || code == 'IDEMPOTENCY_IN_PROGRESS';

  /// Translation key for this error.
  String get messageKey => 'error.$code';

  /// First message for a form field. Matches exact paths and `details.` prefixes.
  String? fieldMessage(String path) => fields[path]?.firstOrNull;

  factory ApiException.fromDio(DioException e) {
    final res = e.response;
    final data = res?.data;
    if (data is Map && data['error'] is Map) {
      final err = (data['error'] as Map).cast<String, Object?>();
      final rawFields = err['fields'];
      final fields = <String, List<String>>{};
      if (rawFields is Map) {
        rawFields.forEach((k, v) {
          if (v is List) fields['$k'] = v.map((x) => '$x').toList();
        });
      }
      return ApiException(
        code: '${err['code'] ?? 'INTERNAL_ERROR'}',
        message: '${err['message'] ?? 'Request failed'}',
        status: res?.statusCode,
        requestId: err['requestId'] as String?,
        fields: fields,
        details: err['details'] is Map ? (err['details'] as Map).cast<String, Object?>() : const {},
      );
    }
    switch (e.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return ApiException(code: 'TIMEOUT', message: 'The server took too long to respond');
      case DioExceptionType.connectionError:
        return ApiException(code: 'NETWORK', message: 'No connection');
      case DioExceptionType.unknown when res == null:
        return ApiException(code: 'NETWORK', message: e.message ?? 'No connection');
      default:
        return ApiException(
          code: res == null ? 'NETWORK' : 'INTERNAL_ERROR',
          message: e.message ?? 'Request failed',
          status: res?.statusCode,
        );
    }
  }

  @override
  String toString() => 'ApiException($code, $status, $message${requestId != null ? ', requestId=$requestId' : ''})';
}
