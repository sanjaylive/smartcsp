/// NPCI UPI deep link (what payment QR codes encode). Any UPI app scanning it opens a payment to
/// [upiId] with the amount pre-filled. Mirrors `upiPaymentUri` in packages/shared.
String upiPaymentUri({required String upiId, String? payeeName, int? amountPaise, String? note}) {
  final q = <String>['pa=${Uri.encodeComponent(upiId)}'];
  if (payeeName != null && payeeName.isNotEmpty) q.add('pn=${Uri.encodeComponent(payeeName)}');
  if (amountPaise != null && amountPaise > 0) q.add('am=${(amountPaise / 100).toStringAsFixed(2)}');
  q.add('cu=INR');
  if (note != null && note.isNotEmpty) q.add('tn=${Uri.encodeComponent(note.length > 50 ? note.substring(0, 50) : note)}');
  return 'upi://pay?${q.join('&')}';
}

final upiIdPattern = RegExp(r'^[a-z0-9][a-z0-9.\-_]{1,255}@[a-z][a-z0-9]{1,63}$');

const upiApps = ['PHONEPE', 'PAYTM', 'GPAY', 'BHIM', 'BHARATPE', 'AMAZONPAY', 'OTHER'];

const upiAppLabels = {
  'PHONEPE': 'PhonePe',
  'PAYTM': 'Paytm',
  'GPAY': 'Google Pay',
  'BHIM': 'BHIM',
  'BHARATPE': 'BharatPe',
  'AMAZONPAY': 'Amazon Pay',
  'OTHER': 'UPI',
};

/// Flat colour chip per UPI app (no logos).
const upiAppColors = {
  'PHONEPE': 0xFF5F259F,
  'PAYTM': 0xFF00BAF2,
  'GPAY': 0xFF1A73E8,
  'BHIM': 0xFFF37021,
  'BHARATPE': 0xFF00B9A5,
  'AMAZONPAY': 0xFF232F3E,
  'OTHER': 0xFF64748B,
};
