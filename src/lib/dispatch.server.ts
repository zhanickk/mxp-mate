// High-level task dispatch logic shared by server functions, the webhook and the cron route.
import type { Database } from "@/integrations/supabase/types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  keyboardFor,
  sendMessage,
  sleep,
  taskMessage,
  almaty,
  escapeHtml,
  type InlineButton,
  type Step,
} from "./telegram.server";

type AssignmentStatus = Database["public"]["Enums"]["assignment_status"];

export type AssignmentRow = {
  id: string;
  task_id: string;
  member_id: string;
  status: string;
  telegram_message_id: number | null;
};

const ASSIGNMENT_SELECT = `
  id, task_id, member_id, status, telegram_message_id, sent_at, reminder_sent,
  members:member_id ( id, full_name, telegram_chat_id ),
  assignment_steps ( id, idx, title, done_at ),
  tasks:task_id ( id, title, description, deadline, team_id, created_by, teams:team_id ( name ) )
`;

type LoadedAssignment = {
  id: string;
  task_id: string;
  member_id: string;
  status: string;
  telegram_message_id: number | null;
  reminder_sent: boolean;
  members: { id: string; full_name: string; telegram_chat_id: number | null } | null;
  assignment_steps: Step[] | null;
  tasks: {
    id: string;
    title: string;
    description: string | null;
    deadline: string;
    team_id: string | null;
    created_by: string | null;
    teams: { name: string } | null;
  } | null;
};

export async function loadAssignments(ids: string[]): Promise<LoadedAssignment[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabaseAdmin
    .from("task_assignments")
    .select(ASSIGNMENT_SELECT)
    .in("id", ids);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as LoadedAssignment[];
}

export async function logActivity(assignmentId: string, memberId: string | null, action: string) {
  await supabaseAdmin
    .from("activity_log")
    .insert({ assignment_id: assignmentId, member_id: memberId, action });
}

/** Sends (or re-sends) the JD DM for each assignment id. */
export async function dispatchAssignments(
  ids: string[],
  opts: { prefix?: string | undefined; resend?: boolean | undefined } = {},
): Promise<{ sent: number; failed: string[] }> {
  const rows = await loadAssignments(ids);
  let sent = 0;
  const failed: string[] = [];

  for (const row of rows) {
    const member = row.members;
    const task = row.tasks;
    if (!task) continue;

    if (!member?.telegram_chat_id) {
      failed.push(member?.full_name ?? "Без имени");
      await supabaseAdmin
        .from("task_assignments")
        .update({ status: "not_delivered" })
        .eq("id", row.id);
      continue;
    }

    const steps = row.assignment_steps ?? [];
    const text = taskMessage({
      title: task.title,
      description: task.description,
      teamName: task.teams?.name ?? "MXP",
      deadline: task.deadline,
      prefix: opts.prefix,
      steps,
    });

    const nextStatus = (
      opts.resend && row.status !== "not_delivered" ? row.status : "sent"
    ) as AssignmentStatus;
    const res = await sendMessage(
      member.telegram_chat_id,
      text,
      keyboardFor(nextStatus, row.id, steps),
    );

    if (res.ok && res.result) {
      sent += 1;
      await supabaseAdmin
        .from("task_assignments")
        .update({
          status: nextStatus === "not_delivered" ? ("sent" as const) : nextStatus,
          telegram_message_id: res.result.message_id,
          sent_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      await logActivity(
        row.id,
        row.member_id,
        opts.resend ? "Отправлено повторно" : "Отправлено в Telegram",
      );
    } else {
      failed.push(member.full_name);
      await supabaseAdmin
        .from("task_assignments")
        .update({ status: "not_delivered" })
        .eq("id", row.id);
    }

    // Telegram rate limit: stay well under 30 msg/s.
    await sleep(120);
  }

  return { sent, failed };
}

/** Short reminder DM for a single assignment. */
export async function sendReminderFor(
  assignmentId: string,
): Promise<{ ok: boolean; reason?: string | undefined }> {
  const [row] = await loadAssignments([assignmentId]);
  if (!row?.tasks) return { ok: false, reason: "Назначение не найдено" };
  const chatId = row.members?.telegram_chat_id;
  if (!chatId) return { ok: false, reason: "У мембера не подключён Telegram" };

  const steps = row.assignment_steps ?? [];
  const doneSteps = steps.filter((x) => x.done_at).length;
  const text = [
    "⏰ <b>Напоминание</b>",
    "",
    `«${escapeHtml(row.tasks.title)}»`,
    `Дедлайн: ${almaty(row.tasks.deadline)} (Астана)`,
    ...(steps.length ? [`📋 Этапы: ${doneSteps} из ${steps.length}`] : []),
  ].join("\n");

  const res = await sendMessage(chatId, text, keyboardFor(row.status, row.id, steps));
  if (res.ok) await logActivity(row.id, row.member_id, "Отправлено напоминание");
  return { ok: res.ok, reason: res.description };
}

/** DMs the creator's linked member, if any. */
export async function notifyTaskCreator(
  createdBy: string | null,
  text: string,
  keyboard?: InlineButton[][] | undefined,
) {
  if (!createdBy) return;
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("member_id")
    .eq("id", createdBy)
    .maybeSingle();
  if (!profile?.member_id) return;
  const { data: member } = await supabaseAdmin
    .from("members")
    .select("telegram_chat_id")
    .eq("id", profile.member_id)
    .maybeSingle();
  if (member?.telegram_chat_id) await sendMessage(member.telegram_chat_id, text, keyboard);
}
