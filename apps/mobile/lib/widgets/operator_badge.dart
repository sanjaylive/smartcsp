import 'package:flutter/material.dart';

/// Brand colour + short mark for a recharge operator. Drawn as a monogram, not the operator's logo.
@immutable
class OperatorMark {
  const OperatorMark(this.text, this.bg, {this.fg = Colors.white});
  final String text;
  final Color bg;
  final Color fg;
}

const _marks = <String, OperatorMark>{
  'AIRTEL': OperatorMark('A', Color(0xFFE40000)),
  'JIO': OperatorMark('Jio', Color(0xFF0A2885)),
  'VI': OperatorMark('Vi', Color(0xFFEE1C25), fg: Color(0xFFFFE600)),
  'BSNL': OperatorMark('B', Color(0xFF1B6EB5)),
  'MTNL': OperatorMark('M', Color(0xFF1B4F9C)),
  'TATA_PLAY': OperatorMark('TP', Color(0xFF8E1F7C)),
  'DISH_TV': OperatorMark('D', Color(0xFFE5451F)),
  'AIRTEL_DTH': OperatorMark('A', Color(0xFFB80000)),
  'SUN_DIRECT': OperatorMark('S', Color(0xFFF08A00)),
  'D2H': OperatorMark('d2h', Color(0xFFD71F26)),
};

const _fallback = OperatorMark('', Color(0xFF64748B));

/// Resolves an operator from a registry code (e.g. `TATA_PLAY`) or a provider name (e.g. "Airtel Digital TV").
OperatorMark operatorMark(String codeOrName) {
  final up = codeOrName.trim().toUpperCase();
  final direct = _marks[up];
  if (direct != null) return direct;
  final n = up.replaceAll(RegExp(r'[^A-Z0-9]'), '');
  if (n.isEmpty || n == 'OTHER') return _fallback;
  String? code;
  if (n.contains('AIRTEL')) {
    code = (n.contains('DTH') || n.contains('DIGITAL') || n.contains('TV')) ? 'AIRTEL_DTH' : 'AIRTEL';
  } else if (n.contains('JIO')) {
    code = 'JIO';
  } else if (n.contains('D2H') || n.contains('VIDEOCON')) {
    code = 'D2H'; // before Vi: "Videocon" starts with VI
  } else if (n.startsWith('VI') || n.contains('VODAFONE') || n.contains('IDEA')) {
    code = 'VI';
  } else if (n.contains('BSNL')) {
    code = 'BSNL';
  } else if (n.contains('MTNL')) {
    code = 'MTNL';
  } else if (n.contains('TATA')) {
    code = 'TATA_PLAY';
  } else if (n.contains('DISH')) {
    code = 'DISH_TV';
  } else if (n.contains('SUN')) {
    code = 'SUN_DIRECT';
  }
  if (code != null) return _marks[code]!;
  final initial = n.isEmpty ? '' : n[0];
  return OperatorMark(initial, _fallback.bg);
}

/// Round brand-coloured badge for an operator; used beside operator names in pickers and lists.
class OperatorBadge extends StatelessWidget {
  const OperatorBadge(this.codeOrName, {super.key, this.size = 28});
  final String codeOrName;
  final double size;

  @override
  Widget build(BuildContext context) {
    final m = operatorMark(codeOrName);
    final len = m.text.length;
    return ExcludeSemantics(
      child: Container(
        width: size,
        height: size,
        alignment: Alignment.center,
        decoration: BoxDecoration(color: m.bg, shape: BoxShape.circle),
        child: m.text.isEmpty
            ? Icon(Icons.cell_tower_rounded, size: size * 0.55, color: m.fg)
            : Text(
                m.text,
                maxLines: 1,
                textScaler: TextScaler.noScaling,
                style: TextStyle(
                  color: m.fg,
                  fontWeight: FontWeight.w800,
                  fontSize: size * (len >= 3 ? 0.32 : (len == 2 ? 0.38 : 0.48)),
                  letterSpacing: -0.2,
                  height: 1,
                ),
              ),
      ),
    );
  }
}

/// Dropdown row: operator badge + name.
class OperatorOption extends StatelessWidget {
  const OperatorOption({super.key, required this.codeOrName, required this.label});
  final String codeOrName;
  final String label;

  @override
  Widget build(BuildContext context) => Row(children: [
        OperatorBadge(codeOrName, size: 26),
        const SizedBox(width: 10),
        Expanded(child: Text(label, overflow: TextOverflow.ellipsis)),
      ]);
}
