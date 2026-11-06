// Small, strict-ish JSON readers so models never leak dynamic maps into the UI.
typedef Json = Map<String, Object?>;

Json asJson(Object? v) => v is Map ? v.cast<String, Object?>() : <String, Object?>{};

List<Json> asJsonList(Object? v) => v is List ? v.map(asJson).toList() : const [];

String str(Json j, String k, [String fallback = '']) {
  final v = j[k];
  return v == null ? fallback : '$v';
}

String? strOrNull(Json j, String k) {
  final v = j[k];
  return v == null ? null : '$v';
}

/// Integers (money in paise, counts). Accepts num for robustness but never produces fractions.
int intOf(Json j, String k, [int fallback = 0]) {
  final v = j[k];
  if (v is int) return v;
  if (v is num) return v.round();
  if (v is String) return int.tryParse(v) ?? fallback;
  return fallback;
}

int? intOrNull(Json j, String k) {
  final v = j[k];
  if (v == null) return null;
  return intOf(j, k);
}

bool boolOf(Json j, String k, [bool fallback = false]) {
  final v = j[k];
  return v is bool ? v : fallback;
}

List<String> strList(Json j, String k) => j[k] is List ? (j[k] as List).map((e) => '$e').toList() : const [];

class PageResult<T> {
  const PageResult({required this.items, required this.page, required this.pageSize, required this.total, required this.pages});

  final List<T> items;
  final int page;
  final int pageSize;
  final int total;
  final int pages;

  bool get hasMore => page < pages;

  factory PageResult.fromJson(Json j, T Function(Json) item) => PageResult(
        items: asJsonList(j['items']).map(item).toList(),
        page: intOf(j, 'page', 1),
        pageSize: intOf(j, 'pageSize', 25),
        total: intOf(j, 'total'),
        pages: intOf(j, 'pages', 1),
      );
}
