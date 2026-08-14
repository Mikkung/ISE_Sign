import type { DashboardFilterOptions, DashboardFilters } from "@/lib/dashboard-analytics";

interface DashboardFiltersProps {
  filters: DashboardFilters;
  options: DashboardFilterOptions;
}

export function DashboardFilters({ filters, options }: DashboardFiltersProps) {
  return (
    <form className="grid gap-3 rounded border border-slate-200 bg-white p-4 md:grid-cols-3 xl:grid-cols-6">
      <label className="space-y-1 text-sm">
        <span className="font-medium text-slate-700">Range</span>
        <select name="range" defaultValue={filters.range} className="w-full rounded border border-slate-300 px-3 py-2">
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
          <option value="12m">Last 12 months</option>
          <option value="all">All time</option>
          <option value="custom">Custom range</option>
        </select>
      </label>
      <label className="space-y-1 text-sm">
        <span className="font-medium text-slate-700">From</span>
        <input name="from" type="date" defaultValue={filters.from ?? ""} className="w-full rounded border border-slate-300 px-3 py-2" />
      </label>
      <label className="space-y-1 text-sm">
        <span className="font-medium text-slate-700">To</span>
        <input name="to" type="date" defaultValue={filters.to ?? ""} className="w-full rounded border border-slate-300 px-3 py-2" />
      </label>
      <label className="space-y-1 text-sm">
        <span className="font-medium text-slate-700">Academic Program</span>
        <select name="academicProgram" defaultValue={filters.academicProgram} className="w-full rounded border border-slate-300 px-3 py-2">
          <option value="all">All programs</option>
          {options.academicPrograms.map((program) => (
            <option key={program} value={program}>{program}</option>
          ))}
        </select>
      </label>
      <label className="space-y-1 text-sm">
        <span className="font-medium text-slate-700">Project Type</span>
        <select name="projectType" defaultValue={filters.projectType} className="w-full rounded border border-slate-300 px-3 py-2">
          <option value="all">All types</option>
          {options.projectTypes.map((type) => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>
      </label>
      <label className="space-y-1 text-sm">
        <span className="font-medium text-slate-700">Status</span>
        <select name="status" defaultValue={filters.status} className="w-full rounded border border-slate-300 px-3 py-2">
          <option value="all">All statuses</option>
          {options.statuses.map((status) => (
            <option key={status} value={status}>{status.replaceAll("_", " ")}</option>
          ))}
        </select>
      </label>
      <div className="flex items-end gap-2 md:col-span-3 xl:col-span-6">
        <button type="submit" className="rounded bg-ise-maroon px-4 py-2 text-sm font-semibold text-white">
          Apply Filters
        </button>
        <a href="/dashboard" className="rounded border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">
          Reset
        </a>
      </div>
    </form>
  );
}
