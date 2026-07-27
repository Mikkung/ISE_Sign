import type { ReactNode } from "react";

type StatCardProps = {
  label: string;
  value: string | number;
  icon?: ReactNode;
  helper?: string;
};

export function StatCard({ label, value, icon, helper }: StatCardProps) {
  return (
    <div className="rounded border border-slate-200 bg-white p-4 shadow-panel">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">{label}</p>
        {icon ? <div className="text-ise-maroon">{icon}</div> : null}
      </div>
      <p className="mt-3 text-2xl font-semibold text-slate-950">{value}</p>
      {helper ? <p className="mt-1 text-xs text-slate-500">{helper}</p> : null}
    </div>
  );
}
