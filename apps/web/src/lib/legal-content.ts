/*
 * Public policy documents. `{brand}`, `{email}` and `{site}` are filled in at render time from
 * Branding, so a white-label deployment shows its own name and contact.
 *
 * These are a starting draft written for this product (a record-keeping SaaS for CSP / BC / CSC
 * counters that never moves money itself). They must be reviewed by a lawyer before launch,
 * especially the refund window, processing times and the governing-law clause.
 */

export type Block = string | { list: string[] };

export interface LegalSection {
  id: string;
  h: string;
  body: Block[];
}

export interface LegalDoc {
  slug: string;
  title: string;
  eyebrow: string;
  summary: string;
  updated: string;
  sections: LegalSection[];
}

const UPDATED = '8 November 2026';

export const TERMS: LegalDoc = {
  slug: 'terms',
  title: 'Terms & Conditions',
  eyebrow: 'Legal',
  summary:
    'The rules for using {brand}. In short: it is a record-keeping tool for your counter, you own your data, you keep it accurate and lawful, and you can stop using it at any time.',
  updated: UPDATED,
  sections: [
    {
      id: 'about',
      h: 'About these terms',
      body: [
        'These Terms & Conditions ("Terms") govern your use of the {brand} website, web app and mobile app (together, the "Service"). By creating an account or using the Service you agree to these Terms. If you are using the Service for a business, you confirm you are authorised to accept these Terms on its behalf.',
      ],
    },
    {
      id: 'service',
      h: 'What the Service is — and is not',
      body: [
        '{brand} is software that helps counter operators record services they provide (such as AEPS, DMT, PAN, Aadhaar updates, recharges and bill payments), keep a cashbook, track customer dues and print or share receipts.',
        {
          list: [
            '{brand} is not a bank, payment aggregator, business correspondent or government portal.',
            '{brand} does not move money, perform biometric authentication or submit applications to any bank or government system. Those happen on the portals you are already authorised to use.',
            '{brand} is independent and is not affiliated with, endorsed by or a partner of any bank, CSC SPV, UIDAI, NSDL / UTIITSL or other provider whose services you offer.',
          ],
        },
      ],
    },
    {
      id: 'account',
      h: 'Your account',
      body: [
        {
          list: [
            'You must be at least 18 years old and give accurate details when you register.',
            'Keep your login, OTPs and devices secure. You are responsible for activity under your account, including by staff you add.',
            'Tell us promptly at {email} if you suspect unauthorised access.',
          ],
        },
      ],
    },
    {
      id: 'use',
      h: 'Acceptable use',
      body: [
        'You agree not to:',
        {
          list: [
            'Store full Aadhaar numbers, full card numbers, PINs, passwords, OTPs or biometric data in the Service. The Service masks or rejects such values; do not try to work around this.',
            'Use the Service for any unlawful purpose, fraud or money laundering, or record transactions that did not happen.',
            "Attempt to access other users' data, probe or disrupt the Service, or reverse-engineer it.",
            'Resell or sublicense the Service without our written permission.',
          ],
        },
      ],
    },
    {
      id: 'data',
      h: 'Your data',
      body: [
        'You own the records you enter. You give us permission to store and process them only to run the Service for you, as described in our Privacy Policy. You are responsible for having a lawful basis to record your customers’ details and for keeping them accurate.',
        'You can export your records and close your account at any time.',
      ],
    },
    {
      id: 'plans',
      h: 'Plans, billing and taxes',
      body: [
        {
          list: [
            'A free plan is available. Paid plans are billed in advance, monthly or yearly, at the price shown when you subscribe. Prices include or exclude GST as stated at checkout.',
            'Payments are processed by our payment partner; we do not store your card or UPI credentials.',
            'Paid plans renew automatically until cancelled. You can cancel any time from your account; see our Refund & Cancellation Policy.',
            'We may change prices with at least 30 days’ notice. Changes apply from your next billing period.',
          ],
        },
      ],
    },
    {
      id: 'availability',
      h: 'Availability and changes',
      body: [
        'We work to keep the Service available and your data safe, including offline entry that syncs later, but we do not guarantee uninterrupted or error-free operation. We may improve, change or retire features; if we make a change that materially reduces a paid feature, we will tell you in advance.',
      ],
    },
    {
      id: 'liability',
      h: 'Disclaimers and limitation of liability',
      body: [
        'The Service is provided "as is". Cash balances, fees and reports are calculated from what you enter; you remain responsible for verifying your physical cash, your provider statements and your tax filings.',
        'To the extent permitted by law, {brand} is not liable for indirect or consequential losses, lost profits, or losses arising from transactions on third-party portals. Our total liability for any claim is limited to the amount you paid us in the 12 months before the claim.',
      ],
    },
    {
      id: 'termination',
      h: 'Suspension and termination',
      body: [
        'You may stop using the Service and delete your account at any time. We may suspend or close an account that breaches these Terms or the law, with notice where reasonably possible. On closure you may request an export of your data within 30 days, after which it is deleted as set out in our Privacy Policy.',
      ],
    },
    {
      id: 'law',
      h: 'Governing law and disputes',
      body: [
        'These Terms are governed by the laws of India. We will first try to resolve any dispute informally — write to {email}. If unresolved, disputes are subject to the jurisdiction of the competent courts in India.',
      ],
    },
    {
      id: 'changes',
      h: 'Changes to these terms',
      body: [
        'We may update these Terms. We will post the new version here with a new "last updated" date, and tell you by email or in the app if the change is significant. Continuing to use the Service after that means you accept the updated Terms.',
      ],
    },
  ],
};

export const PRIVACY: LegalDoc = {
  slug: 'privacy',
  title: 'Privacy Policy',
  eyebrow: 'Legal',
  summary:
    'What we collect, why, and the choices you have. We collect only what is needed to run your counter records, we never sell data, and we mask sensitive identifiers by design.',
  updated: UPDATED,
  sections: [
    {
      id: 'scope',
      h: 'Who we are and what this covers',
      body: [
        'This policy explains how {brand} ("we") handles personal data when you use our website and app. It is written with the Digital Personal Data Protection Act, 2023 and the Information Technology Act, 2000 in mind.',
        'For records you keep about your own customers, you decide what is recorded and why, and we process that data on your behalf to provide the Service.',
      ],
    },
    {
      id: 'collect',
      h: 'Data we collect',
      body: [
        {
          list: [
            'Account details: your name, mobile number, email, shop name and address, and staff you add.',
            'Records you enter: services, amounts, fees, cashbook entries, dues, and customer names and mobile numbers.',
            'Money-transfer details: beneficiary name, bank, account number and IFSC, as entered by the shop. Aadhaar and card numbers, PINs, OTPs and biometrics are rejected and never stored.',
            'Customer KYC: KYC status, ID type and the last 4 characters of the ID number, and — only if the shop uploads them — photos of ID documents. Shops are asked to upload masked Aadhaar copies. ID photos can be opened only by staff the shop has allowed to see sensitive customer data, through short-lived links, and every access is logged.',
            'Billing details: plan, invoices and payment status. Card and UPI details are handled by our payment partner, not by us.',
            'Technical data: device and browser type, IP address, app version and error logs, used for security and to fix problems.',
          ],
        },
      ],
    },
    {
      id: 'use',
      h: 'How we use it',
      body: [
        {
          list: [
            'To provide the Service: save and sync your records, calculate balances, generate receipts and reports.',
            'To sign you in securely, including phone OTP.',
            'To send service messages such as OTPs, receipts or reminders you choose to send, and important account notices.',
            'To prevent fraud and abuse, and to meet legal obligations.',
            'To improve the product using aggregated, non-identifying usage information.',
          ],
        },
        'We do not sell your data or your customers’ data, and we do not use it for third-party advertising.',
      ],
    },
    {
      id: 'share',
      h: 'Who we share it with',
      body: [
        'Only with service providers who help us run the Service — for example hosting, SMS / OTP delivery, email and payment processing — under contracts that limit their use to that purpose. We may also disclose data where required by law or a valid order of a court or government authority.',
      ],
    },
    {
      id: 'security',
      h: 'How we protect it',
      body: [
        {
          list: [
            'Encryption in transit (HTTPS) and access controls that keep each shop’s data separate.',
            'Masking of sensitive identifiers at the point of entry.',
            'Limited, logged access by our support team, only when you ask for help.',
          ],
        },
        'No system is perfectly secure. If a breach affects your personal data we will notify you and the authorities as the law requires.',
      ],
    },
    {
      id: 'retention',
      h: 'How long we keep it',
      body: [
        'We keep your data while your account is active. If you close your account, we delete or anonymise your records within 90 days, except where we must keep certain data (such as invoices) for tax or legal reasons.',
      ],
    },
    {
      id: 'rights',
      h: 'Your rights',
      body: [
        'You can access, correct, export or delete your data, withdraw consent, and nominate someone to exercise your rights. Most of this you can do in the app; otherwise write to {email} and we will respond within 30 days.',
      ],
    },
    {
      id: 'children',
      h: 'Children',
      body: ['The Service is meant for businesses and is not directed at anyone under 18.'],
    },
    {
      id: 'grievance',
      h: 'Grievance Officer',
      body: [
        'If you have a concern about how your data is handled, contact our Grievance Officer at {email}. We will acknowledge your complaint within 48 hours and aim to resolve it within 30 days.',
      ],
    },
    {
      id: 'changes',
      h: 'Changes to this policy',
      body: [
        'We will post any update here with a new "last updated" date and notify you of significant changes by email or in the app.',
      ],
    },
  ],
};

export const REFUND: LegalDoc = {
  slug: 'refund-policy',
  title: 'Refund & Cancellation Policy',
  eyebrow: 'Billing',
  summary:
    'Start free, upgrade only if it helps, and cancel any time. This page explains how cancellations work and when you can get your money back.',
  updated: UPDATED,
  sections: [
    {
      id: 'free',
      h: 'Try before you pay',
      body: [
        '{brand} has a free plan, so you can use the core features at your counter before deciding to pay. We encourage you to try it fully before upgrading.',
      ],
    },
    {
      id: 'cancel',
      h: 'Cancelling a subscription',
      body: [
        {
          list: [
            'You can cancel a paid plan at any time from Settings → Billing, or by writing to {email} from your registered email.',
            'Cancellation stops the next renewal. Your paid features continue until the end of the period you have already paid for, after which the account moves to the free plan. Your records are not deleted.',
          ],
        },
      ],
    },
    {
      id: 'eligible',
      h: 'When you can get a refund',
      body: [
        {
          list: [
            'First purchase: if you are not satisfied, request a full refund within 7 days of your first payment for a plan.',
            'Duplicate or incorrect charge: if you were charged twice or charged the wrong amount, we refund the extra amount in full.',
            'Failed upgrade: if money was debited but the plan was not activated, we either activate it or refund you in full.',
          ],
        },
      ],
    },
    {
      id: 'not-eligible',
      h: 'When refunds do not apply',
      body: [
        {
          list: [
            'Renewals, or requests made after the 7-day window on a first purchase.',
            'Partly used months or years after cancelling (you keep access until the period ends instead).',
            'Accounts suspended for breaching our Terms & Conditions.',
            'Fees, commissions or charges of banks and service portals you use at your counter — {brand} does not collect or hold these.',
          ],
        },
      ],
    },
    {
      id: 'how',
      h: 'How to request a refund',
      body: [
        'Email {email} with your registered mobile number, the payment date and amount, and the transaction or invoice ID. We will reply within 2 working days.',
      ],
    },
    {
      id: 'timeline',
      h: 'Refund timelines',
      body: [
        'Approved refunds are returned to the original payment method within 5–7 working days. Your bank or UPI app may take a few more days to show the credit.',
      ],
    },
  ],
};

export const SHIPPING: LegalDoc = {
  slug: 'shipping-policy',
  title: 'Delivery Policy',
  eyebrow: 'Billing',
  summary:
    '{brand} is an online service, so there is nothing physical to ship. Here is how and when you get access after signing up or paying.',
  updated: UPDATED,
  sections: [
    {
      id: 'digital',
      h: 'Digital service — no physical shipping',
      body: [
        '{brand} is delivered online through your browser and the installable app. We do not ship any physical goods, so no shipping charges apply.',
      ],
    },
    {
      id: 'access',
      h: 'When you get access',
      body: [
        {
          list: [
            'Free plan: available immediately after you verify your mobile number.',
            'Paid plan: activated immediately after successful payment. In rare cases it can take up to 30 minutes for the payment confirmation to reach us.',
            'A GST invoice is emailed to your registered email address and is available under Settings → Billing.',
          ],
        },
      ],
    },
    {
      id: 'issues',
      h: 'If your plan is not activated',
      body: [
        'If your payment succeeded but your plan is still not active after 30 minutes, write to {email} with your payment reference. We will activate it or refund you in full as described in our Refund & Cancellation Policy.',
      ],
    },
    {
      id: 'hardware',
      h: 'Printers and other hardware',
      body: [
        '{brand} works with many Bluetooth thermal printers, but we do not sell or deliver hardware. Any device you buy from a third party is covered by that seller’s delivery and warranty terms.',
      ],
    },
  ],
};

export const DISCLAIMER: LegalDoc = {
  slug: 'disclaimer',
  title: 'Disclaimer',
  eyebrow: 'Legal',
  summary:
    'Important notes about what {brand} is, what it is not, and the limits of the information it shows.',
  updated: UPDATED,
  sections: [
    {
      id: 'independent',
      h: 'Independent software',
      body: [
        '{brand} is an independent record-keeping tool. It is not affiliated with, authorised by or endorsed by any bank, the Government of India, CSC e-Governance Services India Ltd, UIDAI, NSDL, UTIITSL, NPCI or any payment or service provider. Names of banks, portals and services are used only to describe the services our users offer.',
      ],
    },
    {
      id: 'no-transactions',
      h: 'No financial transactions',
      body: [
        '{brand} does not process payments, withdrawals, transfers or applications. All such transactions take place on the portals you are authorised to use, and are governed by those providers’ terms.',
      ],
    },
    {
      id: 'accuracy',
      h: 'Accuracy of figures',
      body: [
        'Balances, fees, commissions and reports are calculated from the data you enter. Always reconcile them with your physical cash and your provider statements. {brand} is not responsible for losses caused by incorrect entries.',
      ],
    },
    {
      id: 'advice',
      h: 'Not professional advice',
      body: [
        'Information on this website and in the app is general in nature and is not legal, tax or financial advice. Please consult a qualified professional for advice on your situation.',
      ],
    },
    {
      id: 'links',
      h: 'External links',
      body: [
        'Links to third-party websites are provided for convenience. We do not control and are not responsible for their content or practices.',
      ],
    },
  ],
};

export const LEGAL_DOCS = [TERMS, PRIVACY, REFUND, SHIPPING, DISCLAIMER];
