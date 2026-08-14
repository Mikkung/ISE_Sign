import { formatDuration, type ApproverResponseMetric } from "@/lib/dashboard-analytics";

export function ApproverResponseTable({ metrics }: { metrics: ApproverResponseMetric[] }) {
  if (metrics.length === 0) {
    return null;
  }

  return (
    <section className="rounded border border-slate-200 bg-white p-4">
      <h3 className="text-lg font-semibold text-slate-950">Approval Response Time</h3>
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-2 py-2">Approver</th>
              <th className="px-2 py-2">Role</th>
              <th className="px-2 py-2">Completed Decisions</th>
              <th className="px-2 py-2">Median Response Time</th>
              <th className="px-2 py-2">Average Response Time</th>
              <th className="px-2 py-2">Oldest Current Assignment</th>
              <th className="px-2 py-2">Active Assignment Count</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {metrics.map((metric) => (
              <tr key={metric.approverId}>
                <td className="px-2 py-2 font-medium text-slate-900">{metric.approverName}</td>
                <td className="px-2 py-2">{metric.role}</td>
                <td className="px-2 py-2">{metric.completedDecisions}</td>
                <td className="px-2 py-2">{formatDuration(metric.medianResponseHours)}</td>
                <td className="px-2 py-2">{formatDuration(metric.averageResponseHours)}</td>
                <td className="px-2 py-2">{formatDuration(metric.oldestCurrentAssignmentHours)}</td>
                <td className="px-2 py-2">{metric.activeAssignmentCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
