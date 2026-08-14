import { formatDuration, type BottleneckMetric } from "@/lib/dashboard-analytics";

export function BottleneckCard({ metric }: { metric: BottleneckMetric }) {
  return (
    <section className="rounded border border-slate-200 bg-white p-5">
      <p className="text-sm font-medium uppercase text-slate-500">Current Bottleneck</p>
      <h3 className="mt-1 text-2xl font-semibold text-slate-950">{metric.label}</h3>
      <div className="mt-4 grid gap-3 text-sm md:grid-cols-4">
        <div>
          <p className="text-slate-500">Active Projects</p>
          <p className="text-lg font-semibold text-slate-900">{metric.activeProjectCount}</p>
        </div>
        <div>
          <p className="text-slate-500">Total Waiting</p>
          <p className="text-lg font-semibold text-slate-900">{formatDuration(metric.totalWaitingHours)}</p>
        </div>
        <div>
          <p className="text-slate-500">Median Waiting Age</p>
          <p className="text-lg font-semibold text-slate-900">{formatDuration(metric.medianWaitingHours)}</p>
        </div>
        <div>
          <p className="text-slate-500">Oldest Waiting Age</p>
          <p className="text-lg font-semibold text-slate-900">{formatDuration(metric.oldestWaitingHours)}</p>
        </div>
      </div>
    </section>
  );
}
