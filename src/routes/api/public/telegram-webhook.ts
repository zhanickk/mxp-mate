import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  answerCallbackQuery,
  editMessageText,
  escapeHtml,
  almaty,
  birthdayLabel,
  daysUntilBirthday,
  getWebhookSecret,
  keyboardFor,
  reviewKeyboard,
  sendMessage,
  STATUS_LINE,
  stepsKeyboard,
  taskMessage,
  type Step,
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
  "После «Сделал» работа уходит на проверку тому, кто её выдал.",
  "Если у задачи есть этапы, отмечай их кнопкой «Отметить этап».",
  "",
  "/birthdays: ближайшие дни рождения LC",
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
    .in("status", ["sent", "accepted", "help_needed", "overdue", "submitted"])
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

/** Ближайшие дни рождения по всему LC. */
async function handleBirthdays(chatId: number) {
  const member = await memberByChat(chatId);
  if (!member) {
    await sendMessage(chatId, "Ты ещё не подключён. Попроси у тимлида персональную ссылку.");
    return;
  }

  const { data } = await supabaseAdmin
    .from("lc_people")
    .select("full_name, department, birthday, music_app, instagram")
    .eq("is_active", true)
    .not("birthday", "is", null);

  const upcoming = (data ?? [])
    .map((p) => ({ ...p, days: daysUntilBirthday(p.birthday) }))
    .filter((p) => p.days !== null && p.days <= 30)
    .sort((a, b) => (a.days ?? 0) - (b.days ?? 0))
    .slice(0, 10);

  if (upcoming.length === 0) {
    await sendMessage(chatId, "В ближайший месяц дней рождения нет 🎂");
    return;
  }

  const lines = upcoming.map((p) => {
    const when = p.days === 0 ? "сегодня" : p.days === 1 ? "завтра" : `через ${p.days} дн.`;
    const extra = [p.music_app, p.instagram ? `@${p.instagram}` : null].filter(Boolean).join(" · ");
    return [
      `🎂 <b>${escapeHtml(p.full_name)}</b> (${escapeHtml(p.department ?? "LC")})`,
      `   ${birthdayLabel(p.birthday)} - ${when}`,
      extra ? `   ${escapeHtml(extra)}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  });

  await sendMessage(chatId, ["🎉 <b>Ближайшие дни рождения</b>", "", ...lines].join("\n\n"));
}

/** Этапы назначения, по возрастанию порядка. */
async function loadSteps(assignmentId: string): Promise<Step[]> {
  const { data } = await supabaseAdmin
    .from("assignment_steps")
    .select("id, idx, title, done_at")
    .eq("assignment_id", assignmentId)
    .order("idx");
  return (data ?? []) as Step[];
}

/** Перерисовывает сообщение задачи: либо обычный вид, либо экран выбора этапа. */
async function renderTask(
  chatId: number,
  messageId: number,
  assignmentId: string,
  mode: "task" | "steps",
) {
  const { data } = await supabaseAdmin
    .from("task_assignments")
    .select("id, status, tasks:task_id ( title, description, deadline, teams:team_id ( name ) )")
    .eq("id", assignmentId)
    .maybeSingle();

  const row = data as unknown as {
    status: string;
    tasks: {
      title: string;
      description: string | null;
      deadline: string;
      teams: { name: string } | null;
    } | null;
  } | null;
  if (!row?.tasks) return;

  const steps = await loadSteps(assignmentId);
  const text = taskMessage({
    title: row.tasks.title,
    description: row.tasks.description,
    teamName: row.tasks.teams?.name ?? "MXP",
    deadline: row.tasks.deadline,
    steps,
  });

  await editMessageText(
    chatId,
    messageId,
    `${text}\n\n${STATUS_LINE[row.status] ?? ""}`,
    mode === "steps"
      ? stepsKeyboard(assignmentId, steps)
      : keyboardFor(row.status, assignmentId, steps),
  );
}

/** Отметить или снять этап. Доступно только тому, кому выдана джейдишка. */
async function handleStepToggle(update: NonNullable<TgUpdate["callback_query"]>, stepId: string) {
  const chatId = update.message?.chat.id ?? update.from.id;

  const { data: step } = await supabaseAdmin
    .from("assignment_steps")
    .select("id, assignment_id, title, done_at")
    .eq("id", stepId)
    .maybeSingle();

  if (!step) {
    await answerCallbackQuery(update.id, "Этап не найден");
    return;
  }

  const { data: owner } = await supabaseAdmin
    .from("task_assignments")
    .select("id, member_id, members:member_id ( telegram_chat_id )")
    .eq("id", step.assignment_id)
    .maybeSingle();

  const ownerRow = owner as unknown as {
    id: string;
    member_id: string;
    members: { telegram_chat_id: number | null } | null;
  } | null;

  if (!ownerRow || ownerRow.members?.telegram_chat_id !== chatId) {
    await answerCallbackQuery(update.id, "Эта задача не твоя", true);
    return;
  }

  const nextDone = !step.done_at;
  await supabaseAdmin
    .from("assignment_steps")
    .update({ done_at: nextDone ? new Date().toISOString() : null })
    .eq("id", stepId);

  await logActivity(
    step.assignment_id,
    ownerRow.member_id,
    `${nextDone ? "Отметил этап" : "Снял отметку с этапа"}: ${step.title}`,
  );

  if (update.message?.message_id) {
    await renderTask(chatId, update.message.message_id, step.assignment_id, "steps");
  }
  await answerCallbackQuery(update.id, nextDone ? "Готово ☑️" : "Снял отметку");
}

/** Аккаунт сайта, стоящий за этим чатом: нужен, чтобы понять, кто принимает работу. */
async function reviewerByChat(chatId: number) {
  const member = await memberByChat(chatId);
  if (!member) return null;

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("member_id", member.id)
    .maybeSingle();
  if (!profile) return null;

  const { data: roles } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", profile.id);

  return {
    userId: profile.id,
    isVp: (roles ?? []).some((r) => r.role === "vp"),
    fullName: member.full_name,
  };
}

/** Принять или вернуть сданную работу. Кнопки видит только тот, кто выдал задачу. */
async function handleReview(
  update: NonNullable<TgUpdate["callback_query"]>,
  approve: boolean,
  assignmentId: string,
) {
  const chatId = update.message?.chat.id ?? update.from.id;

  const { data } = await supabaseAdmin
    .from("task_assignments")
    .select(
      "id, status, member_id, members:member_id ( full_name, telegram_chat_id ), tasks:task_id ( title, description, deadline, created_by, teams:team_id ( name ) )",
    )
    .eq("id", assignmentId)
    .maybeSingle();

  const row = data as unknown as {
    id: string;
    status: string;
    member_id: string;
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

  const reviewer = await reviewerByChat(chatId);
  const allowed = reviewer && (reviewer.isVp || row.tasks.created_by === reviewer.userId);
  if (!allowed) {
    await answerCallbackQuery(update.id, "Принять может только тот, кто выдал джейдишку", true);
    return;
  }

  if (row.status !== "submitted") {
    await answerCallbackQuery(update.id, "Эта работа уже проверена");
    return;
  }

  const now = new Date().toISOString();
  await supabaseAdmin
    .from("task_assignments")
    .update(
      approve
        ? { status: "done", done_at: now, reviewed_at: now, reviewed_by: reviewer.userId }
        : {
            status: "accepted",
            done_at: null,
            submitted_at: null,
            reviewed_at: now,
            reviewed_by: reviewer.userId,
          },
    )
    .eq("id", assignmentId);

  await logActivity(
    assignmentId,
    row.member_id,
    approve ? "Работа принята" : "Возвращено на доработку",
  );

  const memberName = escapeHtml(row.members?.full_name ?? "Мембер");
  const title = escapeHtml(row.tasks.title);

  if (update.message?.message_id) {
    await editMessageText(
      chatId,
      update.message.message_id,
      approve
        ? `👍 Принято: «${title}» от ${memberName}`
        : `↩️ Возвращено на доработку: «${title}» от ${memberName}`,
      [],
    );
  }

  if (row.members?.telegram_chat_id) {
    if (approve) {
      await sendMessage(
        row.members.telegram_chat_id,
        `👍 Твою работу по «${title}» приняли. Красавчик!`,
      );
    } else {
      const text = taskMessage({
        title: row.tasks.title,
        description: row.tasks.description,
        teamName: row.tasks.teams?.name ?? "MXP",
        deadline: row.tasks.deadline,
        prefix: "↩️ <b>Вернули на доработку</b>",
      });
      await sendMessage(
        row.members.telegram_chat_id,
        `${text}\n\n${STATUS_LINE["accepted"]}`,
        keyboardFor("accepted", assignmentId),
      );
    }
  }

  await answerCallbackQuery(update.id, approve ? "Принято 👍" : "Вернул на доработку");
}

async function handleCallback(update: NonNullable<TgUpdate["callback_query"]>) {
  const raw = update.data ?? "";
  const [action, assignmentId] = raw.split(":");
  const chatId = update.message?.chat.id ?? update.from.id;

  if (
    !assignmentId ||
    !["acc", "done", "help", "ok", "ret", "steps", "st", "bk"].includes(action ?? "")
  ) {
    await answerCallbackQuery(update.id, "Неизвестное действие");
    return;
  }

  if (action === "ok" || action === "ret") {
    await handleReview(update, action === "ok", assignmentId);
    return;
  }

  if (action === "st") {
    await handleStepToggle(update, assignmentId);
    return;
  }

  if (action === "steps" || action === "bk") {
    if (update.message?.message_id) {
      await renderTask(
        chatId,
        update.message.message_id,
        assignmentId,
        action === "steps" ? "steps" : "task",
      );
    }
    await answerCallbackQuery(update.id, "");
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
  let status: "accepted" | "submitted" | "help_needed" = "accepted";
  let toast = "Принято ✅";
  const patch: Record<string, unknown> = {};

  if (action === "acc") {
    status = "accepted";
    patch["accepted_at"] = now;
    toast = "Принято ✅";
  } else if (action === "done") {
    status = "submitted";
    patch["submitted_at"] = now;
    toast = "Отправил на проверку 🕓";
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
    action === "acc" ? "Принял задачу" : action === "done" ? "Сдал на проверку" : "Запросил помощь",
  );

  const currentSteps = await loadSteps(assignmentId);
  const baseText = taskMessage({
    title: row.tasks.title,
    description: row.tasks.description,
    teamName: row.tasks.teams?.name ?? "MXP",
    deadline: row.tasks.deadline,
    steps: currentSteps,
  });

  const messageId = update.message?.message_id ?? row.telegram_message_id;
  if (messageId) {
    await editMessageText(
      chatId,
      messageId,
      `${baseText}\n\n${STATUS_LINE[status]}`,
      keyboardFor(status, assignmentId, currentSteps),
    );
  }

  if (status === "help_needed") {
    await notifyTaskCreator(
      row.tasks.created_by,
      `🆘 ${escapeHtml(row.members?.full_name ?? "Мембер")} просит помощь по задаче «${escapeHtml(row.tasks.title)}»`,
    );
  }

  if (status === "submitted") {
    await notifyTaskCreator(
      row.tasks.created_by,
      [
        "🕓 <b>Сдали работу</b>",
        "",
        `${escapeHtml(row.members?.full_name ?? "Мембер")} сдал «${escapeHtml(row.tasks.title)}»`,
        "",
        "Проверь и прими работу или верни на доработку.",
      ].join("\n"),
      reviewKeyboard(assignmentId),
    );
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
            } else if (text.startsWith("/birthdays") || text.startsWith("/dr")) {
              await handleBirthdays(chatId);
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
