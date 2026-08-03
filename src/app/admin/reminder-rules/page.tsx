import { updateDefaultReminderRuleAction } from "@/app/actions/admin";
import { getDefaultReminderRule } from "@/lib/data";

export default async function AdminReminderRulesPage() {
  const rule = await getDefaultReminderRule();
  const fields = [
    ["unopenedAfterDays", "Unopened after days", rule.unopenedAfterDays],
    ["noActionAfterDays", "No action after days", rule.noActionAfterDays],
    ["staffNoticeAfterDays", "Notify staff after days", rule.staffNoticeAfterDays],
    ["escalationAfterDays", "Escalate after days", rule.escalationAfterDays],
    ["repeatEscalationEveryDays", "Repeat escalation every days", rule.repeatEscalationEveryDays],
    ["dueSoonBeforeDays", "Due soon notice days", rule.dueSoonBeforeDays]
  ] as const;

  return (
    <div className="space-y-5">
      <h2 className="text-2xl font-semibold text-slate-950">Reminder Rules</h2>
      <form action={updateDefaultReminderRuleAction} className="grid gap-3 md:grid-cols-2">
        {fields.map(([name, label, value]) => (
          <label key={name} className="rounded border border-slate-200 bg-white p-4">
            <span className="text-sm font-medium text-slate-700">{label}</span>
            <input name={name} type="number" defaultValue={value} className="mt-2 w-full rounded border border-slate-300 px-3 py-2" />
          </label>
        ))}
        <button className="rounded bg-ise-maroon px-4 py-2 text-sm font-semibold text-white md:col-span-2">Save Reminder Rules</button>
      </form>
    </div>
  );
}
