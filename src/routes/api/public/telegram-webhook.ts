import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  answerCallbackQuery,
  editMessageText,
  escapeHtml,
  almaty,
  getWebhookSecret,
  keyboardFor,
  sendMessage,
  STATUS_LINE,
  taskMessage,
} from "@/lib/telegram.server";
import { logActivity, notifyTaskCreator } from "@/lib/dispatch.server";

type TgUser = { id: number; username?: string; first_name?: string };
type TgUpdate = {
  message?: { message_id: number; from?: TgUser; chat: { id: number }; text?: string };
  callback_query?: {
    id: string;
    from: TgUser;
    data?: string;
    message?: { message_id: number; chat: { id: number } };
  };
};

const HELP_TEXT = [
  "🤖 <b>MXP Tasks</b>",
  "",
  "/tasks: мои активные джейдишки",
  "/help: список команд",
  "",
  "Кнопки под задачей: ✅ Принял · 🏁 Сделал · 🆘 Нужна помощь",
].join("\n");

async function memberByChat(chatId: number) {
  const { data } = await supabaseAdmin
    .from("members")
    .select("id, full_name, telegram_chat_id")
    .eq("telegram_chat_id", chatId)
    .maybeSingle();
  return data;
}

async function handleStart(chatId: number, from: TgUser | undefined, code: string | undefined) {
  if (!code) {
    const existing = await memberByChat(chatId);
    if (existing) {
      await sendMessage(
        chatId,
        `Ты уже подключён, ${escapeHtml(existing.full_name)} 👋\n\n${HELP_TEXT}`,
      );
      return;
    }
    await sendMessage(
      chatId,
      "Привет! Это бот MXP Tasks 🤖\n\nЧтобы подключиться, попроси у своего тимлида персональную ссылку-приглашение.",
    );
    return;
  }

  const { data: member } = await supabaseAdmin
    .from("members")
    .select("id, full_name")
    .eq("invite_code", code.trim().toUpperCase())
    .maybeSingle();

  if (!member) {
    await sendMessage(chatId, "Ссылка недействительна 😕 Напиши своему тимлиду.");
    return;
  }

  await supabaseAdmin
    .from("members")
    .update({
      telegram_chat_id: chatId,
      telegram_username: from?.username ?? null,
    })
    .eq("id", member.id);

  await sendMessage(
    chatId,
    `Привет, ${escapeHtml(member.full_name)}! 👋\nТы подключён к MXP Tasks. Сюда будут приходить твои джейдишки.\n\n${HELP_TEXT}`,
  );
}

async function handleTasks(chatId: number) {
  const member = await memberByChat(chatId);
  if (!member) {
    await sendMessage(chatId, "Ты ещё не подключён. Попроси у тимлида персональную ссылку.");
    return;
  }

  const { data } = await supabaseAdmin
    .from("task_assignments")
    .select("id, status, tasks:task_id ( title, deadline )")
    .eq("member_id", member.id)
    .in("status", ["sent", "accepted", "help_needed", "overdue"])
    .order("created_at", { ascending: true });

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    status: string;
    tasks: { title: string; deadline: string } | null;
  }>;

  if (rows.length === 0) {
    await sendMessage(chatId, "🎉 Открытых джейдишек нет. Отдыхай!");
    return;
  }

  const lines = rows
    .filter((r) => r.tasks)
    .map(
      (r, i) =>
        `${i + 1}. <b>${escapeHtml(r.tasks!.title)}</b>\n   ⏰ ${almaty(r.tasks!.deadline)}\n   ${STATUS_LINE[r.status] ?? r.status}`,
    );

  await sendMessage(chatId, ["📋 <b>Твои джейдишки</b>", "", ...lines].join("\n"));
}

async function handleComment(chatId: number, text: string) {
  const member = await memberByChat(chatId);
  if (!member) return false;

  const { data: pending } = await supabaseAdmin
    .from("task_assignments")
    .select("id")
    .eq("member_id", member.id)
    .eq("awaiting_comment", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!pending) return false;

  if (text.trim() === "/skip") {
    await supabaseAdmin
      .from("task_assignments")
      .update({ awaiting_comment: false })
      .eq("id", pending.id);
    await sendMessage(chatId, "Ок, без комментария 👍");
    return true;
  }

  await supabaseAdmin
    .from("task_assignments")
    .update({ awaiting_comment: false, comment: text.slice(0, 2000) })
    .eq("id", pending.id);
  await logActivity(pending.id, member.id, "Добавлен комментарий к результату");
  await sendMessage(chatId, "Записал, спасибо! 🙌");
  return true;
}

async function handleCallback(update: NonNullable<TgUpdate["callback_query"]>) {
  const raw = update.data ?? "";
  const [action, assignmentId] = raw.split(":");
  const chatId = update.message?.chat.id ?? update.from.id;

  if (!assignmentId || !["acc", "done", "help"].includes(action ?? "")) {
    await answerCallbackQuery(update.id, "Неизвестное действие");
    return;
  }

  const { data } = await supabaseAdmin
    .from("task_assignments")
    .select(
      "id, status, member_id, telegram_message_id, members:member_id ( full_name, telegram_chat_id ), tasks:task_id ( title, description, deadline, created_by, teams:team_id ( name ) )",
    )
    .eq("id", assignmentId)
    .maybeSingle();

  const row = data as unknown as {
    id: string;
    status: string;
    member_id: string;
    telegram_message_id: number | null;
    members: { full_name: string; telegram_chat_id: number | null } | null;
    tasks: {
      title: string;
      description: string | null;
      deadline: string;
      created_by: string | null;
      teams: { name: string } | null;
    } | null;
  } | null;

  if (!row || !row.tasks) {
    await answerCallbackQuery(update.id, "Задача не найдена");
    return;
  }

  if (row.members?.telegram_chat_id !== chatId) {
    await answerCallbackQuery(update.id, "Эта задача не твоя", true);
    return;
  }

  const now = new Date().toISOString();
  let status: "accepted" | "done" | "help_needed" = "accepted";
  let toast = "Принято ✅";
  const patch: Record<string, unknown> = {};

  if (action === "acc") {
    status = "accepted";
    patch["accepted_at"] = now;
    toast = "Принято ✅";
  } else if (action === "done") {
    status = "done";
    patch["done_at"] = now;
    patch["awaiting_comment"] = true;
    toast = "Красавчик! 🏁";
  } else {
    status = "help_needed";
    toast = "Сообщил тимлиду 🆘";
  }

  await supabaseAdmin
    .from("task_assignments")
    .update({ status, ...patch })
    .eq("id", assignmentId);

  await logActivity(
    assignmentId,
    row.member_id,
    action === "acc"
      ? "Принял задачу"
      : action === "done"
        ? "Отметил выполненной"
        : "Запросил помощь",
  );

  const baseText = taskMessage({
    title: row.tasks.title,
    description: row.tasks.description,
    teamName: row.tasks.teams?.name ?? "MXP",
    deadline: row.tasks.deadline,
  });

  const messageId = update.message?.message_id ?? row.telegram_message_id;
  if (messageId) {
    await editMessageText(
      chatId,
      messageId,
      `${baseText}\n\n${STATUS_LINE[status]}`,
      keyboardFor(status, assignmentId),
    );
  }

  if (status === "help_needed") {
    await notifyTaskCreator(
      row.tasks.created_by,
      `🆘 ${escapeHtml(row.members?.full_name ?? "Мембер")} просит помощь по задаче «${escapeHtml(row.tasks.title)}»`,
    );
  }

  if (status === "done") {
    await sendMessage(chatId, "Можешь отправить ссылку или комментарий к результату (или /skip)");
  }

  await answerCallbackQuery(update.id, toast);
}

export const Route = createFileRoute("/api/public/telegram-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let expected: string;
        try {
          expected = await getWebhookSecret();
        } catch (error) {
          console.error("[telegram-webhook] no bot token:", error);
          return new Response(`Bot token not configured: ${String(error).slice(0, 200)}`, {
            status: 500,
          });
        }

        if (request.headers.get("x-telegram-bot-api-secret-token") !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        let update: TgUpdate;
        try {
          update = (await request.json()) as TgUpdate;
        } catch {
          return new Response("Bad request", { status: 400 });
        }

        try {
          if (update.callback_query) {
            await handleCallback(update.callback_query);
          } else if (update.message?.text) {
            const chatId = update.message.chat.id;
            const text = update.message.text.trim();

            if (text.startsWith("/start")) {
              await handleStart(chatId, update.message.from, text.split(/\s+/)[1]);
            } else if (text.startsWith("/tasks")) {
              await handleTasks(chatId);
            } else if (text.startsWith("/help")) {
              await sendMessage(chatId, HELP_TEXT);
            } else {
              const consumed = await handleComment(chatId, text);
              if (!consumed) await sendMessage(chatId, HELP_TEXT);
            }
          }
        } catch (error) {
          console.error("[telegram-webhook]", error);
        }

        // Always 200 so Telegram does not retry endlessly.
        return new Response("ok");
      },
    },
  },
});
