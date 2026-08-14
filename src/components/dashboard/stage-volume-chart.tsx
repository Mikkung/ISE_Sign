"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { StageCount } from "@/lib/dashboard-analytics";

export function StageVolumeChart({ data }: { data: StageCount[] }) {
  const hasData = data.some((item) => item.count > 0);

  if (!hasData) {
    return <p className="rounded border border-slate-200 bg-white p-4 text-sm text-slate-500">No active requests match the selected filters.</p>;
  }

  return (
    <div className="rounded border border-slate-200 bg-white p-4">
      <h3 className="mb-3 text-lg font-semibold text-slate-950">Active Requests by Stage</h3>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 12, right: 16, bottom: 24, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} interval={0} angle={-12} textAnchor="end" height={58} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
            <Tooltip />
            <Bar dataKey="count" name="Active Projects" fill="#8b2332" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
