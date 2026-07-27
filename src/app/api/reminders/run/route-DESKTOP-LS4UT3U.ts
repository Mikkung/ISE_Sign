import { NextResponse } from "next/server";
import { createEmailProvider } from "@/lib/email";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.replace("Bearer ", "");

  if (!process.env.SCHEDULER_SECRET || token !== process.env.SCHEDULER_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();

  if (!supabase) {
    return NextResponse.json({
      processed: 0,
      warning: "Supabase service role configuration is missing; reminder run was not executed."
    });
  }

  const { data, error } = await supabase.rpc("process_pending_reminders");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: emailLogs } = await supabase
    .from("notification_logs")
    .select("id, recipient_id, dedupe_key, profiles!notification_logs_recipient_id_fkey(email, display_name)")
    .eq("channel", "email")
    .eq("status", "logged")
    .order("created_at", { ascending: true })
    .limit(50);

  const provider = createEmailProvider();
  let emailSent = 0;
  let emailLoggedOnly = 0;
  let emailFailed = 0;

  for (const log of emailLogs ?? []) {
    const profile = Array.isArray(log.profiles) ? log.profiles[0] : log.profiles;

    if (!profile?.email) {
      continue;
    }

    const result = await provider
      .send({
        to: profile.email,
        subject: "ISE Project Approval reminder",
        text: "มีงานอนุมัติที่รอการดำเนินการในระบบ ISE Project Approval",
        html: "<p>มีงานอนุมัติที่รอการดำเนินการในระบบ ISE Project Approval</p>"
      })
      .catch((sendError: unknown) => ({
        sent: false,
        provider: "smtp" as const,
        warning: sendError instanceof Error ? sendError.message : "Unknown email delivery error"
      }));

    if (result.sent) {
      emailSent += 1;
      await supabase
        .from("notification_logs")
        .update({ status: "sent", provider: result.provider, error_message: null })
        .eq("id", log.id);
    } else if (result.provider === "development-log") {
      emailLoggedOnly += 1;
      await supabase
        .from("notification_logs")
        .update({ provider: result.provider, error_message: result.warning })
        .eq("id", log.id);
    } else {
      emailFailed += 1;
      await supabase
        .from("notification_logs")
        .update({ status: "failed", provider: result.provider, error_message: result.warning })
        .eq("id", log.id);
    }
  }

  return NextResponse.json({
    processed: data ?? 0,
    emailSent,
    emailLoggedOnly,
    emailFailed
  });
}
