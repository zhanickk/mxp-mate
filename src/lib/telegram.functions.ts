import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/** Оставляет только те назначения, которые доступны вызывающему по его правам. */
async function visibleAssignmentIds(
  supabase: SupabaseClient<Database>,
  ids: string[],
): Promise<string[]> {
  const { data, error } = await supabase.from("task_assignments").select("id").in("id", ids);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.id);
}

/** Sends the JD to every listed assignment. */
export const sendTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ assignment_ids: z.array(z.string().uuid()).min(1) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const allowed = await visibleAssignmentIds(context.supabase, data.assignment_ids);
    if (allowed.length === 0) throw new Error("Нет прав на эти задачи");
    const { dispatchAssignments } = await import("./dispatch.server");
    return dispatchAssignments(allowed);
  });

/** Re-sends an existing JD message. */
export const resendTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ assignment_ids: z.array(z.string().uuid()).min(1) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const allowed = await visibleAssignmentIds(context.supabase, data.assignment_ids);
    if (allowed.length === 0) throw new Error("Нет прав на эти задачи");
    const { dispatchAssignments } = await import("./dispatch.server");
    return dispatchAssignments(allowed, {
      prefix: "🔁 <b>Джейдишка (повторно)</b>",
      resend: true,
    });
  });

/** Sends a short reminder for one assignment. */
export const sendReminder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ assignment_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const allowed = await visibleAssignmentIds(context.supabase, [data.assignment_id]);
    if (allowed.length === 0) throw new Error("Нет прав на эту задачу");
    const { sendReminderFor } = await import("./dispatch.server");
    return sendReminderFor(data.assignment_id);
  });

/** Принять сданную работу или вернуть её на доработку. Права проверяет сама база. */
export const reviewAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        assignment_id: z.string().uuid(),
        approve: z.boolean(),
        comment: z.string().max(2000).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("review_assignment", {
      _assignment_id: data.assignment_id,
      _approve: data.approve,
      ...(data.comment ? { _comment: data.comment } : {}),
    });
    if (error) throw new Error(error.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { escapeHtml, keyboardFor, sendMessage, STATUS_LINE, taskMessage } =
      await import("./telegram.server");

    const { data: row } = await supabaseAdmin
      .from("task_assignments")
      .select(
        "id, members:member_id ( telegram_chat_id ), tasks:task_id ( title, description, deadline, teams:team_id ( name ) )",
      )
      .eq("id", data.assignment_id)
      .maybeSingle();

    const loaded = row as unknown as {
      members: { telegram_chat_id: number | null } | null;
      tasks: {
        title: string;
        description: string | null;
        deadline: string;
        teams: { name: string } | null;
      } | null;
    } | null;

    const chatId = loaded?.members?.telegram_chat_id;
    if (chatId && loaded?.tasks) {
      if (data.approve) {
        const tail = data.comment ? `\n\n💬 ${escapeHtml(data.comment)}` : "";
        await sendMessage(
          chatId,
          `👍 Твою работу по «${escapeHtml(loaded.tasks.title)}» приняли. Красавчик!${tail}`,
        );
      } else {
        const text = taskMessage({
          title: loaded.tasks.title,
          description: loaded.tasks.description,
          teamName: loaded.tasks.teams?.name ?? "MXP",
          deadline: loaded.tasks.deadline,
          prefix: "↩️ <b>Вернули на доработку</b>",
        });
        const tail = data.comment ? `\n\n💬 ${escapeHtml(data.comment)}` : "";
        await sendMessage(
          chatId,
          `${text}${tail}\n\n${STATUS_LINE["accepted"]}`,
          keyboardFor("accepted", data.assignment_id),
        );
      }
    }

    return { ok: true as const };
  });

/**
 * Удаляет задачи пачкой. Права проверяет сама база (VP удаляет любые, тимлид
 * только свои), а мемберам в боте старое сообщение меняется на «задача отменена»,
 * чтобы у них не висели кнопки от несуществующей задачи.
 */
export const deleteTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ task_ids: z.array(z.string().uuid()).min(1).max(200) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Сообщения в Telegram нужно собрать до удаления: назначения уйдут каскадом.
    const { data: before } = await supabaseAdmin
      .from("task_assignments")
      .select(
        "task_id, status, telegram_message_id, members:member_id ( telegram_chat_id ), tasks:task_id ( title )",
      )
      .in("task_id", data.task_ids);

    const { data: deleted, error } = await context.supabase
      .from("tasks")
      .delete()
      .in("id", data.task_ids)
      .select("id");
    if (error) throw new Error(error.message);

    const deletedIds = new Set((deleted ?? []).map((r) => r.id));

    const rows = (before ?? []) as unknown as Array<{
      task_id: string;
      status: string;
      telegram_message_id: number | null;
      members: { telegram_chat_id: number | null } | null;
      tasks: { title: string } | null;
    }>;

    const { editMessageText, escapeHtml, sleep } = await import("./telegram.server");
    let notified = 0;
    for (const r of rows) {
      if (!deletedIds.has(r.task_id)) continue;
      if (r.status === "done") continue;
      const chatId = r.members?.telegram_chat_id;
      if (!chatId || !r.telegram_message_id) continue;
      const res = await editMessageText(
        chatId,
        r.telegram_message_id,
        `❌ <b>Задача отменена</b>\n\n«${escapeHtml(r.tasks?.title ?? "")}»\nДелать больше не нужно.`,
        [],
      );
      if (res.ok) notified += 1;
      await sleep(60);
    }

    return {
      deleted: deletedIds.size,
      skipped: data.task_ids.length - deletedIds.size,
      notified,
    };
  });

/** Bot health check: getMe + current webhook info. */
export const getBotStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const tg = await import("./telegram.server");
    if (!(await tg.hasBotToken())) {
      return { configured: false as const };
    }
    const [me, hook] = await Promise.all([tg.getMe(), tg.getWebhookInfo()]);
    return {
      configured: true as const,
      me: me.ok ? me.result : null,
      error: me.ok ? null : (me.description ?? "Ошибка"),
      webhook: hook.ok ? hook.result : null,
    };
  });

/** VP-only: points the Telegram webhook at this app. */
export const setupWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ origin: z.string().url() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: isVp, error: roleError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "vp",
    });
    if (roleError || !isVp) throw new Error("Только VP может подключать webhook");

    const tg = await import("./telegram.server");
    const url = `${data.origin.replace(/\/$/, "")}/api/public/telegram-webhook`;
    const result = await tg.setWebhook(url, await tg.getWebhookSecret());
    const me = await tg.getMe();

    if (me.ok && me.result?.username) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("app_settings").upsert({
        key: "bot_username",
        value: me.result.username,
        updated_at: new Date().toISOString(),
      });
    }

    return {
      ok: result.ok,
      url,
      description: result.description ?? null,
      me: me.ok ? me.result : null,
    };
  });
