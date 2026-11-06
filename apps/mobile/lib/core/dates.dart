/// Business dates are calendar dates in the shop's timezone (default Asia/Kolkata), serialized
/// as `YYYY-MM-DD`. Instants are ISO-8601 UTC strings. Display format: "06 Nov 2026".
library;

const String defaultTimezone = 'Asia/Kolkata';

const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/// Fixed UTC offsets for the zones a CSP shop can choose. India has no DST, so a fixed offset is
/// exact. Unknown zones fall back to the device's local offset.
const Map<String, Duration> _zoneOffsets = {
  'Asia/Kolkata': Duration(hours: 5, minutes: 30),
  'Asia/Calcutta': Duration(hours: 5, minutes: 30),
  'UTC': Duration.zero,
};

final RegExp _isoDate = RegExp(r'^\d{4}-\d{2}-\d{2}$');

bool isIsoDate(String s) {
  if (!_isoDate.hasMatch(s)) return false;
  final d = DateTime.tryParse('${s}T00:00:00Z');
  return d != null && toIsoDate(d) == s;
}

String _two(int v) => v.toString().padLeft(2, '0');

/// Calendar date of a DateTime's own fields (no timezone conversion).
String toIsoDate(DateTime d) => '${d.year.toString().padLeft(4, '0')}-${_two(d.month)}-${_two(d.day)}';

/// Wall-clock time in [timeZone] for an instant.
DateTime inZone(DateTime instant, [String timeZone = defaultTimezone]) {
  final offset = _zoneOffsets[timeZone];
  if (offset == null) return instant.toLocal();
  final u = instant.toUtc().add(offset);
  return DateTime.utc(u.year, u.month, u.day, u.hour, u.minute, u.second);
}

/// Business date (YYYY-MM-DD) of an instant in the shop timezone.
String localDate(DateTime instant, [String timeZone = defaultTimezone]) => toIsoDate(inZone(instant, timeZone));

String todayIso([String timeZone = defaultTimezone]) => localDate(DateTime.now(), timeZone);

String addDays(String isoDate, int days) {
  final d = DateTime.parse('${isoDate}T00:00:00Z').add(Duration(days: days));
  return toIsoDate(d);
}

/// "06 Nov 2026". Invalid input is returned unchanged.
String formatDate(String? isoDate) {
  if (isoDate == null || isoDate.isEmpty) return '';
  final s = isoDate.length >= 10 ? isoDate.substring(0, 10) : isoDate;
  if (!isIsoDate(s)) return isoDate;
  final p = s.split('-');
  return '${p[2]} ${_months[int.parse(p[1]) - 1]} ${p[0]}';
}

/// "06 Nov 2026, 14:05" in the shop timezone.
String formatDateTime(String? instant, [String timeZone = defaultTimezone]) {
  if (instant == null) return '';
  final parsed = DateTime.tryParse(instant);
  if (parsed == null) return instant;
  final z = inZone(parsed, timeZone);
  return '${formatDate(toIsoDate(z))}, ${_two(z.hour)}:${_two(z.minute)}';
}

/// Parses a YYYY-MM-DD string into a local DateTime for date pickers.
DateTime? parseIsoDate(String? s) {
  if (s == null || !isIsoDate(s)) return null;
  final p = s.split('-').map(int.parse).toList();
  return DateTime(p[0], p[1], p[2]);
}
