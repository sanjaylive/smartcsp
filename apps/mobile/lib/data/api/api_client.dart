import 'package:dio/dio.dart';
import 'package:uuid/uuid.dart';

import 'api_exception.dart';
import 'auth_session.dart';
import 'token_store.dart';

const _uuid = Uuid();

/// Generates an Idempotency-Key. Create one per user submission and reuse it on retries.
String newIdempotencyKey() => _uuid.v4();

/// Thin typed wrapper around Dio: bearer auth, single-flight refresh on 401, error mapping.
class ApiClient {
  ApiClient({required String baseUrl, required this.session, Dio? dio, HttpClientAdapter? adapter})
      : dio = dio ?? Dio(_options(baseUrl)) {
    if (adapter != null) this.dio.httpClientAdapter = adapter;
    this.dio.interceptors.add(_AuthInterceptor(this));
  }

  final Dio dio;
  final AuthSession session;

  static BaseOptions _options(String baseUrl) => BaseOptions(
        baseUrl: baseUrl,
        connectTimeout: const Duration(seconds: 15),
        receiveTimeout: const Duration(seconds: 30),
        sendTimeout: const Duration(seconds: 30),
        contentType: Headers.jsonContentType,
        responseType: ResponseType.json,
        headers: {'Accept': 'application/json'},
      );

  /// Builds the refresh call used by [AuthSession]: a bare Dio without the auth interceptor.
  static RefreshCall refreshCallFor(String baseUrl, {HttpClientAdapter? adapter}) {
    final bare = Dio(_options(baseUrl));
    if (adapter != null) bare.httpClientAdapter = adapter;
    return (refreshToken) async {
      try {
        final res = await bare.post<Map<String, dynamic>>('/v1/auth/refresh', data: {'refreshToken': refreshToken});
        return TokenPair.fromJson(res.data!.cast<String, Object?>());
      } on DioException catch (e) {
        throw ApiException.fromDio(e);
      }
    };
  }

  Future<Map<String, Object?>> get(String path, {Map<String, Object?>? query}) =>
      _send(() => dio.get<Object?>(path, queryParameters: _cleanQuery(query)));

  Future<Map<String, Object?>> post(String path, {Object? body, String? idempotencyKey}) => _send(() => dio.post<Object?>(
        path,
        data: body ?? <String, Object?>{},
        options: idempotencyKey == null ? null : Options(headers: {'Idempotency-Key': idempotencyKey}),
      ));

  Future<Map<String, Object?>> put(String path, {Object? body}) => _send(() => dio.put<Object?>(path, data: body ?? {}));

  Future<Map<String, Object?>> patch(String path, {Object? body}) => _send(() => dio.patch<Object?>(path, data: body ?? {}));

  Future<Map<String, Object?>> delete(String path) => _send(() => dio.delete<Object?>(path));

  Future<Map<String, Object?>> _send(Future<Response<Object?>> Function() call) async {
    try {
      final res = await call();
      final data = res.data;
      if (data is Map) return data.cast<String, Object?>();
      if (data is List) return <String, Object?>{'items': data};
      return <String, Object?>{};
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  static Map<String, Object?>? _cleanQuery(Map<String, Object?>? q) {
    if (q == null) return null;
    final out = <String, Object?>{};
    q.forEach((k, v) {
      if (v == null) return;
      if (v is String && v.isEmpty) return;
      out[k] = v;
    });
    return out;
  }
}

const _noAuthPaths = ['/v1/auth/otp/request', '/v1/auth/otp/verify', '/v1/auth/refresh'];

class _AuthInterceptor extends Interceptor {
  _AuthInterceptor(this.client);
  final ApiClient client;

  @override
  Future<void> onRequest(RequestOptions options, RequestInterceptorHandler handler) async {
    if (!_noAuthPaths.contains(options.path)) {
      try {
        final token = await client.session.accessToken();
        if (token != null) options.headers['Authorization'] = 'Bearer $token';
      } on ApiException catch (_) {
        // Fall through without a token; the server answers 401 and onError handles it.
      }
    }
    handler.next(options);
  }

  @override
  Future<void> onError(DioException err, ErrorInterceptorHandler handler) async {
    final req = err.requestOptions;
    final is401 = err.response?.statusCode == 401;
    if (!is401 || _noAuthPaths.contains(req.path) || req.extra['retriedAfterRefresh'] == true) {
      return handler.next(err);
    }
    final sent = (req.headers['Authorization'] as String?)?.replaceFirst('Bearer ', '');
    try {
      final pair = await client.session.refresh(staleAccessToken: sent);
      if (pair == null) return handler.next(err);
      req.headers['Authorization'] = 'Bearer ${pair.accessToken}';
      req.extra['retriedAfterRefresh'] = true;
      final res = await client.dio.fetch<Object?>(req);
      return handler.resolve(res);
    } on DioException catch (e) {
      return handler.next(e);
    } on ApiException catch (_) {
      return handler.next(err);
    }
  }
}
