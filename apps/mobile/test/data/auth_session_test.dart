import 'dart:async';

import 'package:csp2all_mobile/data/api/api_client.dart';
import 'package:csp2all_mobile/data/api/api_exception.dart';
import 'package:csp2all_mobile/data/api/auth_session.dart';
import 'package:csp2all_mobile/data/api/token_store.dart';
import 'package:flutter_test/flutter_test.dart';

import '../helpers.dart';

void main() {
  group('AuthSession single-flight refresh', () {
    test('concurrent refreshes share ONE server call and persist the new pair first', () async {
      final store = MemoryTokenStore(tokens('1'));
      var calls = 0;
      final gate = Completer<void>();
      final session = AuthSession(
        store: store,
        refreshCall: (rt) async {
          calls++;
          expect(rt, tokens('1').refreshToken);
          await gate.future;
          return tokens('2');
        },
      );
      await session.load();
      final stale = session.current!.accessToken;
      final futures = List.generate(5, (_) => session.refresh(staleAccessToken: stale));
      gate.complete();
      final results = await Future.wait(futures);
      expect(calls, 1);
      expect(results.every((p) => p?.accessToken == tokens('2').accessToken), isTrue);
      expect((await store.read())!.refreshToken, tokens('2').refreshToken);
      expect(store.writes, 1);
    });

    test('a caller holding an already-replaced token gets the current pair without refreshing', () async {
      var calls = 0;
      final session = AuthSession(store: MemoryTokenStore(tokens('2')), refreshCall: (_) async {
        calls++;
        return tokens('3');
      });
      await session.load();
      final p = await session.refresh(staleAccessToken: tokens('1').accessToken);
      expect(p!.accessToken, tokens('2').accessToken);
      expect(calls, 0, reason: 'never re-use a refresh token that may already be spent');
    });

    test('rejected refresh ends the session and clears tokens', () async {
      final store = MemoryTokenStore(tokens('1'));
      final session = AuthSession(store: store, refreshCall: (_) async => throw ApiException(code: 'UNAUTHENTICATED', message: 'reused', status: 401));
      await session.load();
      final ended = session.onSessionEnded.first;
      expect(await session.refresh(), isNull);
      await ended;
      expect(await store.read(), isNull);
      expect(session.isSignedIn, isFalse);
    });

    test('network failure during refresh keeps tokens for a later attempt', () async {
      final store = MemoryTokenStore(tokens('1'));
      final session = AuthSession(store: store, refreshCall: (_) async => throw ApiException(code: 'NETWORK', message: 'offline'));
      await session.load();
      await expectLater(session.refresh(), throwsA(isA<ApiException>()));
      expect((await store.read())!.accessToken, tokens('1').accessToken);
    });

    test('proactively refreshes a token that is about to expire', () async {
      var calls = 0;
      final session = AuthSession(
        store: MemoryTokenStore(tokens('1', ttl: const Duration(seconds: 5))),
        refreshCall: (_) async {
          calls++;
          return tokens('2');
        },
      );
      expect(await session.accessToken(), tokens('2').accessToken);
      expect(calls, 1);
    });
  });

  group('ApiClient 401 handling', () {
    test('concurrent 401s trigger one refresh; every request is retried with the new token', () async {
      var refreshes = 0;
      final adapter = FakeAdapter((req) async {
        if (req.path == '/v1/auth/refresh') {
          refreshes++;
          await Future<void>.delayed(const Duration(milliseconds: 20));
          return FakeResponse(200, tokens('2').toJson());
        }
        final auth = req.headers['Authorization'] as String?;
        if (auth == 'Bearer ${tokens('2').accessToken}') return const FakeResponse(200, {'ok': true});
        return apiError(401, 'SESSION_EXPIRED');
      });
      final store = MemoryTokenStore(tokens('1'));
      final session = AuthSession(store: store, refreshCall: ApiClient.refreshCallFor(testBase, adapter: adapter));
      final client = ApiClient(baseUrl: testBase, session: session, adapter: adapter);

      final results = await Future.wait([for (var i = 0; i < 4; i++) client.get('/v1/thing/$i')]);
      expect(results.every((r) => r['ok'] == true), isTrue);
      expect(refreshes, 1);
      expect(adapter.to('POST', '/v1/auth/refresh').single.data, {'refreshToken': tokens('1').refreshToken});
      expect((await store.read())!.accessToken, tokens('2').accessToken);
    });

    test('refresh rejected → original 401 surfaces as ApiException and tokens are cleared', () async {
      final adapter = FakeAdapter((req) {
        if (req.path == '/v1/auth/refresh') return apiError(401, 'UNAUTHENTICATED');
        return apiError(401, 'SESSION_EXPIRED');
      });
      final store = MemoryTokenStore(tokens('1'));
      final session = AuthSession(store: store, refreshCall: ApiClient.refreshCallFor(testBase, adapter: adapter));
      final client = ApiClient(baseUrl: testBase, session: session, adapter: adapter);
      await expectLater(client.get('/v1/auth/me'), throwsA(isA<ApiException>().having((e) => e.code, 'code', 'SESSION_EXPIRED')));
      expect(await store.read(), isNull);
    });

    test('maps the error envelope, field errors and network failures', () async {
      final adapter = FakeAdapter((req) {
        if (req.path == '/v1/offline') return const FakeResponse(0, null);
        return apiError(422, 'VALIDATION_FAILED', fields: {'details.ifsc': ['Invalid IFSC']});
      });
      final session = AuthSession(store: MemoryTokenStore(tokens('1')), refreshCall: (_) async => tokens('2'));
      final client = ApiClient(baseUrl: testBase, session: session, adapter: adapter);
      try {
        await client.post('/v1/records', body: {}, idempotencyKey: 'key-12345678');
        fail('expected error');
      } on ApiException catch (e) {
        expect(e.code, 'VALIDATION_FAILED');
        expect(e.status, 422);
        expect(e.requestId, 'req-test');
        expect(e.fieldMessage('details.ifsc'), 'Invalid IFSC');
      }
      expect(adapter.requests.last.headers['Idempotency-Key'], 'key-12345678');
      await expectLater(client.get('/v1/offline'), throwsA(isA<ApiException>().having((e) => e.isNetwork, 'isNetwork', true)));
    });
  });
}
