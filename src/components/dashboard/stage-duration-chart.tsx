"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DurationMetric } from "@/lib/dashboard-analytics";

function formatChartDuration(hours: number | null) {
  if (hours === null) {
    return "-";
  }
  if (hours < 48) {
    return `${Math.round(hours * 10) / 10}h`;
  }
  return `${Math.round((hours / 24) * 10) / 10}d`;
}

export function StageDurationChart({ data }: { data: DurationMetric[] }) {
  const hasData = data.some((item) => item.medianHours !== null);
  const chartData = data.map((item) => ({
    ...item,
    median: item.medianHours ?? 0
  }));

  if (!hasData) {
    return <p className="rounded border border-slate-200 bg-white p-4 text-sm text-slate-500">No duration data is available yet.</p>;
  }

  return (
    <div className="rounded border border-slate-200 bg-white p-4">
      <h3 className="mb-3 text-lg font-semibold text-slate-950">Median Time by Stage</h3>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" margin={{ top: 12, right: 24, bottom: 0, left: 32 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={(value) => formatChartDuration(Number(value))} />
            <YAxis dataKey="label" type="category" width={110} tick={{ fontSize: 12 }} />
            <Tooltip formatter={(value) => formatChartDuration(Number(value))} />
            <Bar dataKey="median" name="Median elapsed time" fill="#0f766e" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 grid gap-2 text-xs text-slate-600 md:grid-cols-3">
        {data.map((item) => (
          <p key={item.stage}>
            <span className="font-semibold text-slate-800">{item.label}:</span> avg {formatChartDuration(item.averageHours)}, P90 {formatChartDuration(item.p90Hours)}, n={item.sampleCount}, excluded={item.excludedCount}
          </p>
        ))}
      </div>
    </div>
  );
}
