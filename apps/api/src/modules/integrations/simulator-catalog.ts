/*
 * Development-only stand-in for Pay2All's read-only catalog (operators, plans, billers, bill fetch),
 * used when a shop's connector is in SIMULATOR mode. Shapes follow the Pay2All reference. It never
 * contacts Pay2All and is unreachable in production (the simulator is refused there).
 */

const SERVICES = [
  {
    service_id: 1,
    service: 'Prepaid Mobile',
    code: 'prepaid',
    providers: [
      { provider_id: 11, name: 'Jio', code: 'JIO' },
      { provider_id: 12, name: 'Airtel', code: 'AIRTEL' },
      { provider_id: 13, name: 'Vi (Vodafone Idea)', code: 'VI' },
      { provider_id: 14, name: 'BSNL', code: 'BSNL' },
    ],
  },
  {
    service_id: 2,
    service: 'DTH',
    code: 'dth',
    providers: [
      { provider_id: 21, name: 'Tata Play', code: 'TATAPLAY' },
      { provider_id: 22, name: 'Airtel Digital TV', code: 'AIRTELDTH' },
      { provider_id: 23, name: 'Dish TV', code: 'DISHTV' },
    ],
  },
];

const PLANS = [
  {
    plan_id: 1,
    amount: 199,
    validity: '28 days',
    data: '1.5 GB/day',
    category: 'Popular',
    description: 'Unlimited calls, 100 SMS/day',
  },
  {
    plan_id: 2,
    amount: 299,
    validity: '28 days',
    data: '2 GB/day',
    category: 'Popular',
    description: 'Unlimited calls, 100 SMS/day',
  },
  {
    plan_id: 3,
    amount: 666,
    validity: '84 days',
    data: '1.5 GB/day',
    category: 'Long validity',
    description: 'Unlimited calls',
  },
  {
    plan_id: 4,
    amount: 19,
    validity: '1 day',
    data: '1 GB',
    category: 'Data',
    description: 'Data add-on',
  },
];

const BILLER_PARAMS = [
  {
    paramName: 'Consumer Number',
    dataType: 'NUMERIC',
    optional: false,
    minLength: 6,
    maxLength: 12,
  },
];

function route(path: string, body: Record<string, unknown> | null): unknown {
  if (path === '/providers') return { services: SERVICES };
  if (path === '/lookup') {
    const n = String(body?.number ?? '');
    const id = n.startsWith('7') ? 12 : n.startsWith('8') ? 13 : 11;
    const name = SERVICES[0]!.providers.find((p) => p.provider_id === id)!.name;
    return {
      provider_id: id,
      provider_name: name,
      circle_id: '5',
      circle_code: 'BR',
      circle_name: 'Bihar & Jharkhand',
    };
  }
  if (path === '/plans') return { categories: ['Popular', 'Long validity', 'Data'], plans: PLANS };
  if (path === '/bbps/categories')
    return [
      { name: 'Electricity', billerSlug: 'electricity' },
      { name: 'Water', billerSlug: 'water' },
      { name: 'Broadband Postpaid', billerSlug: 'broadband' },
    ];
  if (path === '/bbps/billers')
    return {
      title: 'Billers',
      billers: [
        { billerId: 'SIMBSEB01', billerName: 'North Bihar Power (Simulated)' },
        { billerId: 'SIMBSEB02', billerName: 'South Bihar Power (Simulated)' },
      ],
    };
  if (path.startsWith('/bbps/billers/'))
    return {
      billerId: path.split('/').pop(),
      billerName: 'North Bihar Power (Simulated)',
      fetchRequirement: 'MANDATORY',
      params: BILLER_PARAMS,
    };
  if (path === '/bbps/fetch') {
    const due = new Date(Date.now() + 9 * 86400_000).toISOString().slice(0, 10);
    return {
      ok: true,
      amount: 845,
      dueDate: due,
      customerName: 'RAMESH KUMAR',
      billNumber: 'SIM-55120',
      billPeriod: 'Oct 2026',
      referenceId: `SIMREF${Date.now().toString(36)}`,
    };
  }
  return null;
}

export const simulatorCatalogFetch = (async (input: URL | string, init?: RequestInit) => {
  const url = new URL(String(input));
  const path = url.pathname.replace(/^\/api\/v1/, '');
  const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
  const data = route(path, body);
  return new Response(
    JSON.stringify(
      data === null ? { status_id: 2, message: 'Not simulated' } : { status_id: 1, data },
    ),
    {
      status: data === null ? 404 : 200,
      headers: { 'content-type': 'application/json' },
    },
  );
}) as typeof fetch;
