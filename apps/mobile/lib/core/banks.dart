import 'package:flutter/material.dart';

/// Banks for the DMT beneficiary picker. [code] is the 4-letter IFSC prefix, so a typed IFSC picks
/// the bank. Icons are our own monograms, not bank logos. Mirrors apps/web/src/lib/banks.ts.
class Bank {
  const Bank(this.code, this.name, this.short, {this.popular = false});
  final String code;
  final String name;
  final String short;
  final bool popular;
}

const banks = <Bank>[
  Bank('SBIN', 'State Bank of India', 'SBI', popular: true),
  Bank('PUNB', 'Punjab National Bank', 'PNB', popular: true),
  Bank('BARB', 'Bank of Baroda', 'BOB', popular: true),
  Bank('HDFC', 'HDFC Bank', 'HDFC', popular: true),
  Bank('ICIC', 'ICICI Bank', 'ICICI', popular: true),
  Bank('UTIB', 'Axis Bank', 'AXIS', popular: true),
  Bank('CNRB', 'Canara Bank', 'CAN', popular: true),
  Bank('UBIN', 'Union Bank of India', 'UBI', popular: true),
  Bank('BKID', 'Bank of India', 'BOI', popular: true),
  Bank('IPOS', 'India Post Payments Bank', 'IPPB', popular: true),
  Bank('CBIN', 'Central Bank of India', 'CBI', popular: true),
  Bank('KKBK', 'Kotak Mahindra Bank', 'KOTAK', popular: true),
  Bank('IDIB', 'Indian Bank', 'IB'),
  Bank('IOBA', 'Indian Overseas Bank', 'IOB'),
  Bank('UCBA', 'UCO Bank', 'UCO'),
  Bank('MAHB', 'Bank of Maharashtra', 'BOM'),
  Bank('PSIB', 'Punjab & Sind Bank', 'PSB'),
  Bank('IBKL', 'IDBI Bank', 'IDBI'),
  Bank('YESB', 'Yes Bank', 'YES'),
  Bank('INDB', 'IndusInd Bank', 'INDUS'),
  Bank('IDFB', 'IDFC FIRST Bank', 'IDFC'),
  Bank('FDRL', 'Federal Bank', 'FED'),
  Bank('BDBL', 'Bandhan Bank', 'BAN'),
  Bank('AUBL', 'AU Small Finance Bank', 'AU'),
  Bank('RATN', 'RBL Bank', 'RBL'),
  Bank('KARB', 'Karnataka Bank', 'KBL'),
  Bank('KVBL', 'Karur Vysya Bank', 'KVB'),
  Bank('SIBL', 'South Indian Bank', 'SIB'),
  Bank('CIUB', 'City Union Bank', 'CUB'),
  Bank('TMBL', 'Tamilnad Mercantile Bank', 'TMB'),
  Bank('JAKA', 'Jammu & Kashmir Bank', 'J&K'),
  Bank('DLXB', 'Dhanlaxmi Bank', 'DLB'),
  Bank('CSBK', 'CSB Bank', 'CSB'),
  Bank('DBSS', 'DBS Bank India', 'DBS'),
  Bank('ESFB', 'Equitas Small Finance Bank', 'EQ'),
  Bank('UJVN', 'Ujjivan Small Finance Bank', 'UJ'),
  Bank('AIRP', 'Airtel Payments Bank', 'APB'),
  Bank('PYTM', 'Paytm Payments Bank', 'PPB'),
  Bank('FINO', 'Fino Payments Bank', 'FINO'),
  Bank('NSPB', 'NSDL Payments Bank', 'NSDL'),
  Bank('HSBC', 'HSBC', 'HSBC'),
  Bank('SCBL', 'Standard Chartered', 'SC'),
];

Bank? bankForIfsc(String ifsc) {
  if (ifsc.length < 4) return null;
  final p = ifsc.substring(0, 4).toUpperCase();
  for (final b in banks) {
    if (b.code == p) return b;
  }
  return null;
}

Bank? bankByName(String name) {
  final n = name.trim().toLowerCase();
  if (n.isEmpty) return null;
  for (final b in banks) {
    if (b.name.toLowerCase() == n) return b;
  }
  return null;
}

const _tones = [
  Color(0xFFB42318),
  Color(0xFF175CD3),
  Color(0xFF067647),
  Color(0xFFB54708),
  Color(0xFF6941C6),
  Color(0xFF0E7090),
  Color(0xFFC11574),
  Color(0xFF344054),
];

/// Stable colour per bank (same hash as the web app).
Color bankTone(String code) {
  var h = 0;
  for (final c in code.codeUnits) {
    h = (h * 31 + c) & 0xFFFFFFFF;
  }
  return _tones[h % _tones.length];
}

/// Rounded monogram for a bank; a generic bank icon when unknown.
class BankIcon extends StatelessWidget {
  const BankIcon({super.key, this.bank, this.size = 36});
  final Bank? bank;
  final double size;

  @override
  Widget build(BuildContext context) {
    final b = bank;
    final scheme = Theme.of(context).colorScheme;
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: b == null ? scheme.surfaceContainerHighest : bankTone(b.code),
        borderRadius: BorderRadius.circular(size * 0.28),
      ),
      child: b == null
          ? Icon(Icons.account_balance_rounded, size: size * 0.5, color: scheme.onSurfaceVariant)
          : Text(
              b.short.length > 4 ? b.short.substring(0, 4) : b.short,
              style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: size * 0.27, letterSpacing: -0.3),
            ),
    );
  }
}
