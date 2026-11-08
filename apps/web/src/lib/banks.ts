/*
 * Banks for the DMT beneficiary picker. `code` is the 4-letter IFSC prefix, so a typed IFSC picks
 * the bank automatically. Icons are our own monograms, not bank logos.
 */
export interface Bank {
  code: string;
  name: string;
  short: string;
  popular?: boolean;
}

export const BANKS: Bank[] = [
  { code: 'SBIN', name: 'State Bank of India', short: 'SBI', popular: true },
  { code: 'PUNB', name: 'Punjab National Bank', short: 'PNB', popular: true },
  { code: 'BARB', name: 'Bank of Baroda', short: 'BOB', popular: true },
  { code: 'HDFC', name: 'HDFC Bank', short: 'HDFC', popular: true },
  { code: 'ICIC', name: 'ICICI Bank', short: 'ICICI', popular: true },
  { code: 'UTIB', name: 'Axis Bank', short: 'AXIS', popular: true },
  { code: 'CNRB', name: 'Canara Bank', short: 'CAN', popular: true },
  { code: 'UBIN', name: 'Union Bank of India', short: 'UBI', popular: true },
  { code: 'BKID', name: 'Bank of India', short: 'BOI', popular: true },
  { code: 'IPOS', name: 'India Post Payments Bank', short: 'IPPB', popular: true },
  { code: 'CBIN', name: 'Central Bank of India', short: 'CBI', popular: true },
  { code: 'KKBK', name: 'Kotak Mahindra Bank', short: 'KOTAK', popular: true },
  { code: 'IDIB', name: 'Indian Bank', short: 'IB' },
  { code: 'IOBA', name: 'Indian Overseas Bank', short: 'IOB' },
  { code: 'UCBA', name: 'UCO Bank', short: 'UCO' },
  { code: 'MAHB', name: 'Bank of Maharashtra', short: 'BOM' },
  { code: 'PSIB', name: 'Punjab & Sind Bank', short: 'PSB' },
  { code: 'IBKL', name: 'IDBI Bank', short: 'IDBI' },
  { code: 'YESB', name: 'Yes Bank', short: 'YES' },
  { code: 'INDB', name: 'IndusInd Bank', short: 'INDUS' },
  { code: 'IDFB', name: 'IDFC FIRST Bank', short: 'IDFC' },
  { code: 'FDRL', name: 'Federal Bank', short: 'FED' },
  { code: 'BDBL', name: 'Bandhan Bank', short: 'BAN' },
  { code: 'AUBL', name: 'AU Small Finance Bank', short: 'AU' },
  { code: 'RATN', name: 'RBL Bank', short: 'RBL' },
  { code: 'KARB', name: 'Karnataka Bank', short: 'KBL' },
  { code: 'KVBL', name: 'Karur Vysya Bank', short: 'KVB' },
  { code: 'SIBL', name: 'South Indian Bank', short: 'SIB' },
  { code: 'CIUB', name: 'City Union Bank', short: 'CUB' },
  { code: 'TMBL', name: 'Tamilnad Mercantile Bank', short: 'TMB' },
  { code: 'JAKA', name: 'Jammu & Kashmir Bank', short: 'J&K' },
  { code: 'DLXB', name: 'Dhanlaxmi Bank', short: 'DLB' },
  { code: 'CSBK', name: 'CSB Bank', short: 'CSB' },
  { code: 'DBSS', name: 'DBS Bank India', short: 'DBS' },
  { code: 'ESFB', name: 'Equitas Small Finance Bank', short: 'EQ' },
  { code: 'UJVN', name: 'Ujjivan Small Finance Bank', short: 'UJ' },
  { code: 'AIRP', name: 'Airtel Payments Bank', short: 'APB' },
  { code: 'PYTM', name: 'Paytm Payments Bank', short: 'PPB' },
  { code: 'FINO', name: 'Fino Payments Bank', short: 'FINO' },
  { code: 'NSPB', name: 'NSDL Payments Bank', short: 'NSDL' },
  { code: 'HSBC', name: 'HSBC', short: 'HSBC' },
  { code: 'SCBL', name: 'Standard Chartered', short: 'SC' },
];

export const bankForIfsc = (ifsc: string): Bank | undefined =>
  ifsc.length >= 4 ? BANKS.find((b) => b.code === ifsc.slice(0, 4).toUpperCase()) : undefined;

export const bankByName = (name: string): Bank | undefined => {
  const n = name.trim().toLowerCase();
  return n ? BANKS.find((b) => b.name.toLowerCase() === n) : undefined;
};

const TONES = [
  'bg-[#b42318] text-white',
  'bg-[#175cd3] text-white',
  'bg-[#067647] text-white',
  'bg-[#b54708] text-white',
  'bg-[#6941c6] text-white',
  'bg-[#0e7090] text-white',
  'bg-[#c11574] text-white',
  'bg-[#344054] text-white',
];

/** Stable colour per bank so the same bank always looks the same. */
export function bankTone(code: string): string {
  let h = 0;
  for (const c of code) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length]!;
}
