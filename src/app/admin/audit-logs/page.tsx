import { listAuditLogs } from "@/lib/data";

export default async function AdminAuditLogsPage() {
  const logs = await listAuditLogs();

  return (
    <div className="space-y-5">
      <h2 className="text-2xl font-semibold text-slate-950">Audit logs</h2>
      <div className="overflow-hidden rounded border border-slate-200 bg-white">
        {logs.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">No audit logs found.</p>
        ) : (
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Action</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Actor</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Entity</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="px-4 py-3 text-sm font-medium text-slate-950">{log.action}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{log.actor}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {log.entityType} {log.entityId ? `· ${log.entityId}` : ""}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">{new Date(log.createdAt).toLocaleString("th-TH")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
