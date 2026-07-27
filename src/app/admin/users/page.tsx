import { listProfiles } from "@/lib/data";

export default async function AdminUsersPage() {
  const profiles = await listProfiles();

  return (
    <div className="space-y-5">
      <h2 className="text-2xl font-semibold text-slate-950">จัดการผู้ใช้และบทบาท</h2>
      <div className="overflow-hidden rounded border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">ชื่อ</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">อีเมล</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">บทบาท</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">หน่วยงาน</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {profiles.map((profile) => (
              <tr key={profile.id}>
                <td className="px-4 py-3 text-sm font-medium">{profile.displayName}</td>
                <td className="px-4 py-3 text-sm">{profile.email}</td>
                <td className="px-4 py-3 text-sm">{profile.role}</td>
                <td className="px-4 py-3 text-sm">{profile.unitName ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
