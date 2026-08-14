import { Activity, CheckCircle2, Clock3, FileText, Percent, TimerReset } from "lucide-react";
import { ApproverResponseTable } from "@/components/dashboard/approver-response-table";
import { BottleneckCard } from "@/components/dashboard/bottleneck-card";
import { DashboardFilters } from "@/components/dashboard/dashboard-filters";
import { LongestWaitingTable } from "@/components/dashboard/longest-waiting-table";
import { ProjectRequestTrendChart } from "@/components/dashboard/project-request-trend-chart";
import { StageDurationChart } from "@/components/dashboard/stage-duration-chart";
import { StageVolumeChart } from "@/components/dashboard/stage-volume-chart";
import { StatCard } from "@/components/ui/stat-card";
import { getDashboardAnalytics } from "@/lib/dashboard-analytics";

const metricIcons = [
  <FileText key="requests" className="h-5 w-5" />,
  <CheckCircle2 key="completed" className="h-5 w-5" />,
  <Clock3 key="median" className="h-5 w-5" />,
  <Activity key="active" className="h-5 w-5" />,
  <TimerReset key="overdue" className="h-5 w-5" />,
  <Percent key="rate" className="h-5 w-5" />
];

export default async function DashboardPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const analytics = await getDashboardAnalytics(await searchParams);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-950">Dashboard</h2>
        <p className="mt-1 text-sm text-slate-500">
          Overview of request volume, active waiting work, and approval throughput for {analytics.periodLabel}.
        </p>
      </div>

      <DashboardFilters filters={analytics.filters} options={analytics.filterOptions} />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {analytics.kpis.map((metric, index) => (
          <StatCard
            key={metric.label}
            label={metric.label}
            value={metric.value}
            icon={metricIcons[index]}
            helper={typeof metric.absoluteChange === "number"
              ? `${metric.helper} Change: ${metric.absoluteChange >= 0 ? "+" : ""}${metric.absoluteChange}${typeof metric.percentChange === "number" ? ` (${Math.round(metric.percentChange)}%)` : ""}.`
              : metric.helper}
          />
        ))}
      </section>

      <BottleneckCard metric={analytics.bottleneck} />

      <section className="grid gap-4 xl:grid-cols-2">
        <ProjectRequestTrendChart data={analytics.trend} summary={analytics.summaryText} />
        <StageVolumeChart data={analytics.stageCounts} />
      </section>

      <StageDurationChart data={analytics.durationMetrics} />

      <LongestWaitingTable projects={analytics.longestWaitingProjects} />
      <ApproverResponseTable metrics={analytics.approverResponseMetrics} />

      <section className="rounded border border-slate-200 bg-white p-4 text-sm text-slate-600">
        <h3 className="font-semibold text-slate-950">Metric Definitions</h3>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <p><span className="font-medium text-slate-800">Requests Received:</span> Projects whose submitted_at falls inside the selected period.</p>
          <p><span className="font-medium text-slate-800">End-to-End Time:</span> submitted_at to completed_at.</p>
          <p><span className="font-medium text-slate-800">Requester Time:</span> Initial preparation plus revision-response time.</p>
          <p><span className="font-medium text-slate-800">Role Step Time:</span> Time during which Staff, Faculty Approver, or Admin approval steps were active.</p>
          <p><span className="font-medium text-slate-800">Current Waiting Time:</span> Time since the current stage became active.</p>
          <p><span className="font-medium text-slate-800">Overdue:</span> Past an explicitly configured project, workflow-step, or assignment due date.</p>
        </div>
      </section>
    </div>
  );
}
