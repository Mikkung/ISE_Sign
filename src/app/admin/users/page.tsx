import { updateProfileRoleAction } from "@/app/actions/projects";
import { listProfiles } from "@/lib/data";
import type { UserRole } from "@/lib/types";

const roles: UserRole[] = ["student", "staff", "approver", "admin"];

export default async function AdminUsersPage() {
  const profiles = await listProfiles();

  return (
    <div className="space-y-5">
      <h2 className="text-2xl font-semibold text-slate-950">Manage Users and Roles</h2>
      <div className="overflow-hidden rounded border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Name</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Email</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Role</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Unit</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Update</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {profiles.map((profile) => (
              <tr key={profile.id}>
                <td className="px-4 py-3 text-sm font-medium">{profile.displayName}</td>
                <td className="px-4 py-3 text-sm">{profile.email}</td>
                <td className="px-4 py-3 text-sm">{profile.role}</td>
                <td className="px-4 py-3 text-sm">{profile.unitName ?? "-"}</td>
                <td className="px-4 py-3 text-sm">
                  <form action={updateProfileRoleAction} className="flex flex-wrap gap-2">
                    <input type="hidden" name="profileId" value={profile.id} />
                    <select name="role" defaultValue={profile.role} className="rounded border border-slate-300 px-2 py-1 text-sm">
                      {roles.map((role) => (
                        <option key={role} value={role}>{role}</option>
                      ))}
                    </select>
                    <input
                      name="position"
                      defaultValue={profile.position ?? ""}
                      placeholder="Position"
                      className="w-40 rounded border border-slate-300 px-2 py-1 text-sm"
                    />
                    <button className="rounded bg-ise-maroon px-2 py-1 text-xs font-semibold text-white">Save</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
