/*
 * Customer receipt for a service record. One builder feeds the printable web receipt, the email
 * and the WhatsApp/SMS text, so all three always show the same thing.
 *
 * Privacy: only non-sensitive fields are printed and the customer's phone is masked. Transaction value is labelled separately from
 * the shop's fee so the customer sees exactly what they paid for.
 */
import type { ServiceRecord, Tenant } from '@prisma/client';
import {
  en,
  formatINR,
  getService,
  customFieldsToFieldDefs,
  maskIdentifier,
  type CustomFieldDef,
  type FieldDef,
  type PrincipalDirection,
} from '@csp2all/shared';
import { receivableFor } from './posting';

const T = en as Record<string, string>;
const tr = (key: string | undefined, fallback = '') => (key && T[key]) || fallback;

export interface ReceiptLine {
  label: string;
  value: string;
}

export interface Receipt {
  shop: {
    name: string;
    address: string | null;
    place: string | null;
    phone: string | null;
    footer: string | null;
    brandColor: string | null;
  };
  receiptNo: string;
  recordId: string;
  issuedAt: string;
  txnDate: string;
  service: string;
  status: string;
  customer: { name: string; phone: string | null };
  details: ReceiptLine[];
  amounts: {
    principalLabel: string | null;
    principalPaise: number;
    feePaise: number;
    totalPaise: number;
    paidPaise: number;
    duePaise: number;
  };
  paidVia: string | null;
  reference: string | null;
  provider: string | null;
  /** Ready-to-send plain text (WhatsApp / SMS / email text part). */
  text: string;
}

function detailLines(
  serviceCode: string,
  fields: FieldDef[],
  details: Record<string, unknown>,
  customerName: string,
) {
  const out: ReceiptLine[] = [];
  for (const f of fields) {
    if (f.sensitive || f.type === 'checklist') continue;
    const raw = details[f.key];
    if (raw === undefined || raw === null || raw === '' || raw === false) continue;
    // The sender is usually the customer — don't print the same name twice.
    if (
      f.key === 'senderName' &&
      String(raw).trim().toLowerCase() === customerName.trim().toLowerCase()
    )
      continue;
    let value: string;
    if (f.type === 'select')
      value = tr(f.options?.find((o) => o.value === raw)?.labelKey, String(raw));
    else if (f.type === 'boolean') value = 'Yes';
    else value = String(raw);
    const label = serviceCode === 'CUSTOM' ? f.labelKey : tr(f.labelKey, f.key);
    out.push({ label, value });
  }
  return out.slice(0, 8);
}

export function buildReceipt(
  rec: ServiceRecord & { customer?: { name: string; phone: string | null } | null },
  tenant: Tenant,
  opts: { customService?: { name: string; fields: unknown } | null } = {},
): Receipt {
  const def = getService(rec.serviceCode);
  const service = opts.customService?.name ?? tr(def?.labelKey, rec.serviceCode);
  const fields: FieldDef[] = opts.customService
    ? customFieldsToFieldDefs((opts.customService.fields ?? []) as CustomFieldDef[])
    : (def?.fields ?? []);
  const direction = rec.principalDirection as PrincipalDirection;
  const total = Number(receivableFor(direction, rec.principalPaise, rec.customerFeePaise));
  const paid = Number(rec.amountCollectedPaise + rec.amountAllocatedPaise);
  const principalLabel =
    direction === 'NONE'
      ? null
      : tr(def?.principalLabelKey ?? 'record.principal.generic', 'Amount');
  const customerName = rec.customer?.name ?? rec.walkInName ?? 'Walk-in customer';
  const place = [tenant.district, tenant.state].filter(Boolean).join(', ') || null;
  const paidVia =
    paid > 0 ? (rec.paymentMode ?? tr(`method.${rec.paymentMethod}`, rec.paymentMethod)) : null;

  const r: Omit<Receipt, 'text'> = {
    shop: {
      name: tenant.name,
      address: tenant.address,
      place,
      phone: tenant.contactPhone,
      footer: tenant.receiptFooter,
      brandColor: tenant.brandColor,
    },
    receiptNo: `R-${String(rec.recordNo).padStart(5, '0')}`,
    recordId: rec.id,
    issuedAt: rec.createdAt.toISOString(),
    txnDate: rec.txnDate.toISOString().slice(0, 10),
    service,
    status: tr(`status.${rec.opStatus}`, rec.opStatus),
    customer: { name: customerName, phone: maskIdentifier(rec.customer?.phone ?? null) },
    details: detailLines(
      rec.serviceCode,
      fields,
      (rec.details ?? {}) as Record<string, unknown>,
      customerName,
    ),
    amounts: {
      principalLabel,
      principalPaise: Number(rec.principalPaise),
      feePaise: Number(rec.customerFeePaise),
      totalPaise: total,
      paidPaise: paid,
      duePaise: Number(rec.amountDuePaise),
    },
    paidVia,
    reference: rec.externalRef,
    provider: rec.provider,
  };
  return { ...r, text: receiptText(r) };
}

function receiptText(r: Omit<Receipt, 'text'>) {
  const a = r.amounts;
  const lines = [
    `*${r.shop.name}* — Receipt ${r.receiptNo}`,
    `Date: ${r.txnDate}`,
    `Customer: ${r.customer.name}`,
    `Service: ${r.service}`,
    `Status: ${r.status}`,
    ...r.details.map((d) => `${d.label}: ${d.value}`),
    ...(a.principalLabel && a.principalPaise
      ? [`${a.principalLabel}: ${formatINR(a.principalPaise)}`]
      : []),
    `Service charge: ${formatINR(a.feePaise)}`,
    `*Total: ${formatINR(a.totalPaise)}*`,
    `Paid: ${formatINR(a.paidPaise)}${r.paidVia ? ` (${r.paidVia})` : ''}`,
    ...(a.duePaise > 0 ? [`Balance due: ${formatINR(a.duePaise)}`] : []),
    ...(r.reference ? [`Ref: ${r.reference}`] : []),
    '',
    r.shop.footer || 'Thank you for visiting.',
  ];
  return lines.join('\n');
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Email-safe HTML (inline styles, no images or scripts). */
export function receiptHtml(r: Receipt) {
  const brand = /^#[0-9a-fA-F]{6}$/.test(r.shop.brandColor ?? '') ? r.shop.brandColor! : '#b53927';
  const row = (l: string, v: string, strong = false) =>
    `<tr><td style="padding:6px 0;color:#6f6558">${esc(l)}</td><td style="padding:6px 0;text-align:right;${strong ? 'font-weight:700;color:#22201d' : 'color:#22201d'}">${esc(v)}</td></tr>`;
  const a = r.amounts;
  return `<!doctype html><html><body style="margin:0;background:#faf8f3;padding:24px;font-family:Inter,Arial,sans-serif">
<div style="max-width:440px;margin:auto;background:#fff;border:1px solid #e8e0d5;border-radius:14px;overflow:hidden">
<div style="background:${brand};color:#fff;padding:18px 22px">
<div style="font-size:18px;font-weight:800">${esc(r.shop.name)}</div>
<div style="font-size:12px;opacity:.9">${esc([r.shop.address, r.shop.place, r.shop.phone && `Ph: ${r.shop.phone}`].filter(Boolean).join(' · '))}</div>
</div>
<div style="padding:18px 22px">
<table style="width:100%;font-size:13px;border-collapse:collapse">
${row('Receipt', r.receiptNo, true)}${row('Date', r.txnDate)}${row('Customer', r.customer.name)}${row('Service', `${r.service} · ${r.status}`)}
${r.details.map((d) => row(d.label, d.value)).join('')}
</table>
<hr style="border:none;border-top:1px dashed #e8e0d5;margin:12px 0">
<table style="width:100%;font-size:13px;border-collapse:collapse">
${a.principalLabel && a.principalPaise ? row(a.principalLabel, formatINR(a.principalPaise)) : ''}
${row('Service charge', formatINR(a.feePaise))}
${row('Total', formatINR(a.totalPaise), true)}
${row('Paid', `${formatINR(a.paidPaise)}${r.paidVia ? ` · ${r.paidVia}` : ''}`, true)}
${a.duePaise > 0 ? row('Balance due', formatINR(a.duePaise), true) : ''}
${r.reference ? row('Reference', r.reference) : ''}
</table>
<p style="margin:16px 0 0;font-size:13px;color:#22201d">${esc(r.shop.footer || 'Thank you for visiting.')}</p>
<p style="margin:12px 0 0;font-size:11px;color:#6f6558">This receipt records a service entered by the shop. It is not a bank or government receipt.</p>
</div></div></body></html>`;
}
