import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  almaty,
  escapeHtml,
  getWebhookInfo,
  getWebhookSecret,
  hasBotToken,
  sendMessage,
  setWebhook,
  sleep,
  getMe,
} from "@/lib/telegram.server";
import { dispatchAssignments, logActivity, notifyTaskCreator } from "@/lib/dispatch.server";

const OPEN = ["sent", "accepted", "help_needed"] as const;

type Row = {
  id: string;
  member_id: string;
  status: string;
  reminder_sent: boolean;
  members: { full_name: string; telegram_chat_id: number | null } | null;
  tasks: {
    id: string;
    title: string;
    deadline: string;
    created_by: string | null;
    is_recurring: boolean;
    recurrence: string | null;
    team_id: string | null;
  } | null;
};

/** Keeps the Telegram webhook pointed at this app, so the bot works without manual setup. */
async function ensureWebhook(): Promise<string> {
  if (!(await hasBotToken())) return "no_token";

  const { data: urlRow } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", "app_url")
    .maybeSingle();

  const appUrl = urlRow?.value?.replace(/\/$/, "");
  if (!appUrl) return "no_app_url";

  const expected = `${appUrl}/api/public/telegram-webhook`;
  const info = await getWebhookInfo();
  if (info.ok && info.result?.url === expected) return "ok";

  const res = await setWebhook(expected, await getWebhookSecret());
  if (!res.ok) return `error: ${res.description ?? "unknown"}`;

  const me = await getMe();
  if (me.ok && me.result?.username) {
    await supabaseAdmin.from("app_settings").upsert({
      key: "bot_username",
      value: me.result.username,
      updated_at: new Date().toISOString(),
    });
  }
  return "connected";
}

async function runTick() {
  const webhook = await ensureWebhook();
  const now = new Date();
  const soon = new Date(now.getTime() + 24 * 3600 * 1000).toISOString();
  const summary = { webhook, reminders: 0, overdue: 0, recurring: 0, birthdays: 0 };

  const { data } = await supabaseAdmin
    .from("task_assignments")
    .select(
      "id, member_id, status, reminder_sent, members:member_id ( full_name, telegram_chat_id ), tasks:task_id ( id, title, deadline, created_by, is_recurring, recurrence, team_id )",
    )
    .in("status", [...OPEN]);

  const rows = (data ?? []) as unknown as Row[];

  for (const row of rows) {
    if (!row.tasks) continue;
    const deadline = row.tasks.deadline;
    const chatId = row.members?.telegram_chat_id;

    if (deadline < now.toISOString()) {
      await supabaseAdmin.from("task_assignments").update({ status: "overdue" }).eq("id", row.id);
      await logActivity(row.id, row.member_id, "Просрочено");
      summary.overdue += 1;
      if (chatId) {
        await sendMessage(
          chatId,
          `⛔️ Дедлайн по задаче «${escapeHtml(row.tasks.title)}» прошёл (${almaty(deadline)}). Напиши тимлиду, если нужна помощь.`,
        );
        await sleep(100);
      }
      await notifyTaskCreator(
        row.tasks.created_by,
        `⛔️ ${escapeHtml(row.members?.full_name ?? "Мембер")} просрочил задачу «${escapeHtml(row.tasks.title)}»`,
      );
      continue;
    }

    if (!row.reminder_sent && deadline <= soon && chatId) {
      await sendMessage(
        chatId,
        `⏰ Напоминание: «${escapeHtml(row.tasks.title)}» — дедлайн ${almaty(deadline)} (Астана)`,
      );
      await supabaseAdmin.from("task_assignments").update({ reminder_sent: true }).eq("id", row.id);
      await logActivity(row.id, row.member_id, "Отправлено напоминание о дедлайне");
      summary.reminders += 1;
      await sleep(100);
    }
  }

  // --- weekly recurring rollover ---
  const { data: recurring } = await supabaseAdmin
    .from("tasks")
    .select("id, title, description, category, team_id, deadline, created_by")
    .eq("is_recurring", true)
    .eq("recurrence", "weekly")
    .lt("deadline", now.toISOString());

  for (const task of recurring ?? []) {
    const { data: child } = await supabaseAdmin
      .from("tasks")
      .select("id")
      .eq("parent_task_id", task.id)
      .limit(1)
      .maybeSingle();
    if (child) continue;

    const nextDeadline = new Date(new Date(task.deadline).getTime() + 7 * 86_400_000).toISOString();
    const { data: created } = await supabaseAdmin
      .from("tasks")
      .insert({
        title: task.title,
        description: task.description,
        category: task.category,
        team_id: task.team_id,
        deadline: nextDeadline,
        created_by: task.created_by,
        is_recurring: true,
        recurrence: "weekly",
        parent_task_id: task.id,
      })
      .select("id")
      .single();
    if (!created) continue;

    const { data: prev } = await supabaseAdmin
      .from("task_assignments")
      .select("member_id")
      .eq("task_id", task.id);

    const inserts = (prev ?? []).map((p) => ({ task_id: created.id, member_id: p.member_id }));
    if (inserts.length === 0) continue;

    const { data: newAssignments } = await supabaseAdmin
      .from("task_assignments")
      .insert(inserts)
      .select("id");

    await dispatchAssignments(
      (newAssignments ?? []).map((a) => a.id),
      {
        prefix: "🔁 <b>Еженедельная джейдишка</b>",
      },
    );
    summary.recurring += 1;
  }

  // --- birthdays in 3 days, once a day around 09:00 Almaty ---
  const almatyHour = Number(
    new Intl.DateTimeFormat("ru-RU", {
      timeZone: "Asia/Almaty",
      hour: "2-digit",
      hour12: false,
    }).format(now),
  );

  const almatyToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Almaty" }).format(now);
  const { data: lastNotice } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", "birthday_notice_date")
    .maybeSingle();

  if (almatyHour >= 9 && lastNotice?.value !== almatyToday) {
    await supabaseAdmin
      .from("app_settings")
      .upsert({ key: "birthday_notice_date", value: almatyToday, updated_at: now.toISOString() });
    const target = new Date(now.getTime() + 5 * 3600 * 1000 + 3 * 86_400_000);
    const mm = String(target.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(target.getUTCDate()).padStart(2, "0");

    const { data: members } = await supabaseAdmin
      .from("members")
      .select("full_name, birthday")
      .eq("is_active", true)
      .not("birthday", "is", null);

    const upcoming = (members ?? []).filter((m) => (m.birthday ?? "").slice(5) === `${mm}-${dd}`);
    if (upcoming.length > 0) {
      const { data: staff } = await supabaseAdmin
        .from("profiles")
        .select("role, member_id, team_id")
        .in("role", ["vp", "team_leader"]);

      const memberIds = (staff ?? []).map((s) => s.member_id).filter(Boolean) as string[];
      const { data: staffMembers } = await supabaseAdmin
        .from("members")
        .select("id, telegram_chat_id")
        .in("id", memberIds.length ? memberIds : ["00000000-0000-0000-0000-000000000000"]);

      const text = [
        "🎂 <b>Скоро дни рождения (через 3 дня)</b>",
        "",
        ...upcoming.map((m) => `• ${escapeHtml(m.full_name)}`),
        "",
        "Пора запускать поздравления!",
      ].join("\n");

      for (const sm of staffMembers ?? []) {
        if (sm.telegram_chat_id) {
          await sendMessage(sm.telegram_chat_id, text);
          await sleep(100);
        }
      }
      summary.birthdays = upcoming.length;
    }
  }

  return summary;
}

/** Accepts either Lovable's managed cron secret or the pg_cron secret stored in app_settings. */
async function isAuthorized(request: Request): Promise<boolean> {
  const token = /^Bearer ([^\s,]+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!token) return false;

  if (process.env["LOVABLE_CRON_SECRET"]) {
    const { authenticateCronRequest } = await import("@/integrations/supabase/cron-auth");
    if ((await authenticateCronRequest(request)) === null) return true;
  }

  const { data } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", "cron_secret")
    .maybeSingle();
  if (!data?.value) return false;

  const { createHash, timingSafeEqual } = await import("node:crypto");
  const digest = (v: string) => createHash("sha256").update(v, "utf8").digest();
  return timingSafeEqual(digest(token), digest(data.value));
}

export const Route = createFileRoute("/api/public/cron-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await isAuthorized(request))) {
          return new Response("Unauthorized", { status: 401 });
        }
        try {
          const summary = await runTick();
          await supabaseAdmin.from("app_settings").upsert({
            key: "cron_last_run",
            value: `${new Date().toISOString()} ${JSON.stringify(summary)}`,
            updated_at: new Date().toISOString(),
          });
          return Response.json({ ok: true, ...summary });
        } catch (error) {
          console.error("[cron-tick]", error);
          return Response.json({ ok: false, error: String(error) }, { status: 500 });
        }
      },
    },
  },
});
