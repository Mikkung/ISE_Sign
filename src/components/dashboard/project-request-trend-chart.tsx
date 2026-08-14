"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import type { TrendPoint } from "@/lib/dashboard-analytics";

export function ProjectRequestTrendChart({ data, summary }: { data: TrendPoint[]; summary: string }) {
  if (data.length === 0) {
    return <p className="rounded border border-slate-200 bg-white p-4 text-sm text-slate-500">No request trend data is available.</p>;
  }

  return (
    <div className="rounded border border-slate-200 bg-white p-4">
      <div className="mb-3">
        <h3 className="text-lg font-semibold text-slate-950">Project Request Trend</h3>
        <p className="sr-only">{summary}</p>
      </div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 12, right: 20, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
            <Tooltip />
            <Line type="monotone" dataKey="submitted" name="Submitted Requests" stroke="#8b2332" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="completed" name="Completed Projects" stroke="#2563eb" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
