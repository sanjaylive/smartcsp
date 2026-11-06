import { ShieldCheck } from 'lucide-react';

/** Logo + the "Admin" marker that distinguishes this console from the shop portal. */
export function AdminBrand({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="grid size-7 place-items-center rounded-md bg-gradient-to-br from-[#4F46E5] to-[#7C3AED] text-[13px] font-bold text-white"
        aria-hidden
      >
        C
      </span>
      {!compact && <span className="text-[15px] font-semibold tracking-tight">CSP2All</span>}
      <span
        className="inline-flex items-center gap-1 rounded bg-[#7C3AED] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white"
        data-testid="admin-badge"
      >
        <ShieldCheck className="size-3" aria-hidden />
        Admin
      </span>
    </div>
  );
}
