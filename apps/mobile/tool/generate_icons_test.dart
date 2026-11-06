// Generates the placeholder launcher icons and splash images (simple CSP2All mark — no
// third-party logos). Run from apps/mobile:
//
//   flutter test tool/generate_icons_test.dart
//
// Replace with final artwork by overwriting the PNGs listed below (see README "Icons & splash").
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/painting.dart';
import 'package:flutter_test/flutter_test.dart';

const _indigo = Color(0xFF4F46E5);
const _violet = Color(0xFF7C3AED);

/// Draws the mark into a [size]×[size] square. [inset] leaves transparent padding (splash),
/// [rounded] clips the background (Android legacy icon). iOS icons must be opaque and square.
Future<List<int>> renderMark(int size, {double inset = 0, bool rounded = false, bool opaqueBackground = false}) async {
  final recorder = ui.PictureRecorder();
  final canvas = Canvas(recorder);
  final s = size.toDouble();
  if (opaqueBackground) canvas.drawRect(Rect.fromLTWH(0, 0, s, s), Paint()..color = _indigo);
  final box = Rect.fromLTWH(inset, inset, s - inset * 2, s - inset * 2);
  final bg = Paint()..shader = ui.Gradient.linear(box.topLeft, box.bottomRight, [_indigo, _violet]);
  if (rounded || inset > 0) {
    canvas.drawRRect(RRect.fromRectAndRadius(box, Radius.circular(box.width * 0.22)), bg);
  } else {
    canvas.drawRect(box, bg);
  }

  // A white ledger page with three lines and a tick: "records kept".
  final w = box.width;
  final page = Rect.fromLTWH(box.left + w * 0.26, box.top + w * 0.2, w * 0.48, w * 0.6);
  canvas.drawRRect(RRect.fromRectAndRadius(page, Radius.circular(w * 0.06)), Paint()..color = const Color(0xFFFFFFFF));
  final line = Paint()
    ..color = _indigo
    ..strokeWidth = w * 0.045
    ..strokeCap = StrokeCap.round;
  for (var i = 0; i < 3; i++) {
    final y = page.top + page.height * (0.24 + i * 0.18);
    canvas.drawLine(Offset(page.left + page.width * 0.2, y), Offset(page.right - page.width * (i == 2 ? 0.45 : 0.2), y), line);
  }
  final tick = Path()
    ..moveTo(page.left + page.width * 0.52, page.top + page.height * 0.78)
    ..lineTo(page.left + page.width * 0.64, page.top + page.height * 0.88)
    ..lineTo(page.left + page.width * 0.86, page.top + page.height * 0.66);
  canvas.drawPath(
    tick,
    Paint()
      ..color = _violet
      ..style = PaintingStyle.stroke
      ..strokeWidth = w * 0.05
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round,
  );

  final image = await recorder.endRecording().toImage(size, size);
  final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
  return bytes!.buffer.asUint8List();
}

void main() {
  test('generate launcher icons and splash images', () async {
    const android = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192};
    for (final e in android.entries) {
      File('android/app/src/main/res/mipmap-${e.key}/ic_launcher.png').writeAsBytesSync(await renderMark(e.value, rounded: true));
      File('android/app/src/main/res/drawable-${e.key}/splash_mark.png')
        ..createSync(recursive: true)
        ..writeAsBytesSync(await renderMark(e.value * 2, inset: e.value * 0.25));
    }

    final iconDir = Directory('ios/Runner/Assets.xcassets/AppIcon.appiconset');
    final re = RegExp(r'Icon-App-([\d.]+)x[\d.]+@(\d)x\.png');
    for (final f in iconDir.listSync().whereType<File>()) {
      final m = re.firstMatch(f.uri.pathSegments.last);
      if (m == null) continue;
      final px = (double.parse(m.group(1)!) * int.parse(m.group(2)!)).round();
      f.writeAsBytesSync(await renderMark(px, opaqueBackground: true));
    }

    final launch = Directory('ios/Runner/Assets.xcassets/LaunchImage.imageset');
    for (final (name, px) in [('LaunchImage.png', 120), ('LaunchImage@2x.png', 240), ('LaunchImage@3x.png', 360)]) {
      File('${launch.path}/$name').writeAsBytesSync(await renderMark(px, inset: px * 0.1));
    }
  });
}
