import { listNotifications } from "@/lib/data";

export default async function NotificationsPage() {
  const notifications = await listNotifications();

  return (
    <div className="space-y-5">
      <h2 className="text-2xl font-semibold text-slate-950">Notifications</h2>
      {notifications.length === 0 ? (
        <div className="rounded border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">
          No notifications yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded border border-slate-200 bg-white">
          {notifications.map((notification) => (
            <article key={notification.id} className="border-b border-slate-100 p-4 last:border-b-0">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-950">{notification.subject}</p>
                  <p className="mt-1 text-sm text-slate-600">{notification.body}</p>
                  <p className="mt-2 text-xs text-slate-500">
                    {notification.projectTitle ?? "System"} · {new Date(notification.createdAt).toLocaleString("th-TH")}
                  </p>
                </div>
                <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-700">
                  {notification.channel} · {notification.status}
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
