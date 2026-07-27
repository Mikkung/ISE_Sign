export default function AdminAuditLogsPage() {
  return (
    <div className="space-y-5">
      <h2 className="text-2xl font-semibold text-slate-950">Audit logs</h2>
      <div className="rounded border border-slate-200 bg-white p-5 text-sm text-slate-600">
        Audit logs are append-only in the database. Connect Supabase to view live records here.
      </div>
    </div>
  );
}
