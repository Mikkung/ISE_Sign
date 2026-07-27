import { updateDefaultReminderRuleAction } from "@/app/actions/admin";
import { getDefaultReminderRule } from "@/lib/data";

export default async function AdminReminderRulesPage() {
  const rule = await getDefaultReminderRule();
  const fields = [
    ["unopenedAfterDays", "ยังไม่เปิดหลังจากกี่วัน", rule.unopenedAfterDays],
    ["noActionAfterDays", "เปิดแล้วไม่ดำเนินการหลังจากกี่วัน", rule.noActionAfterDays],
    ["staffNoticeAfterDays", "แจ้งเจ้าหน้าที่หลังจากกี่วัน", rule.staffNoticeAfterDays],
    ["escalationAfterDays", "ยกระดับหลังจากกี่วัน", rule.escalationAfterDays],
    ["repeatEscalationEveryDays", "แจ้งยกระดับซ้ำทุกกี่วัน", rule.repeatEscalationEveryDays],
    ["dueSoonBeforeDays", "ใกล้ครบกำหนดล่วงหน้ากี่วัน", rule.dueSoonBeforeDays]
  ] as const;

  return (
    <div className="space-y-5">
      <h2 className="text-2xl font-semibold text-slate-950">กฎการแจ้งเตือน</h2>
      <form action={updateDefaultReminderRuleAction} className="grid gap-3 md:grid-cols-2">
        {fields.map(([name, label, value]) => (
          <label key={name} className="rounded border border-slate-200 bg-white p-4">
            <span className="text-sm font-medium text-slate-700">{label}</span>
            <input name={name} type="number" defaultValue={value} className="mt-2 w-full rounded border border-slate-300 px-3 py-2" />
          </label>
        ))}
        <button className="rounded bg-ise-maroon px-4 py-2 text-sm font-semibold text-white md:col-span-2">บันทึกกฎแจ้งเตือน</button>
      </form>
    </div>
  );
}
